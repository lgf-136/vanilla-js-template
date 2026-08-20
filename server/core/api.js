/* ============================================================
 * api/index.js — 共享 API 处理器(Node http req/res 风格)
 * ------------------------------------------------------------
 * 供 dev-server.js(本地 http 服务器)、Vercel 函数(api/index.js)
 * 与 Deno Deploy(deno/main.js 经 createRequire)共用,保证多处逻辑一致。
 *
 * 用法:
 *   const { createApiHandler, sendJson } = require('./server/core/api');
 *   const handleApi = createApiHandler({ db, encrypt, decrypt, verifyPassword });
 *   await handleApi(req, res, pathname);
 *
 * 路由按域拆分在 ../modules/<module>/routes.js,createApiHandler 把它们收编进一张
 * "METHOD /path" 路由表。新增业务模块时,在 ./routes/ 下新增一个
 * 导出路由数组的模块并在此注册即可,无需改动任何现有路由。
 *
 * 鉴权门禁(API Hub 统一管理):
 *   - 默认:除 /api/auth/login 外均需会话令牌(x-auth-token)
 *   - API Hub(server/modules/apihub/service.js)可把任意内置/自定义路由设为公开
 *     或改用 bearer / global-password / api-key 鉴权;
 *   - /api/hub/* 管理接口本身始终要求会话鉴权。
 *
 * API(默认均需 x-auth-token,除非在 API Hub 中配置为公开/自定义鉴权):
 *   POST   /api/auth/login     { password, expiry }  -> { token, expiresAt }
 *   GET    /api/auth/verify                            -> { ok: true }
 *   POST   /api/auth/logout                            登出(删除会话)
 *   GET    /api/settings                               全部 app_settings(KV)
 *   PUT    /api/settings       { settings: { key: value } }  批量写入
 *   DELETE /api/settings       { keys: [ ... ] }       删除
 *   GET    /api/hub/state                              API Hub 路由发现 + 配置
 *   PUT    /api/hub/config                             API Hub 配置保存
 * ============================================================ */
'use strict';

const { sendJson } = require('./http/json');
const { createHub } = require('../modules/apihub/service');
const authRoutes = require('../modules/auth/routes');
const settingsRoutes = require('../modules/settings/routes');
const hubRoutes = require('../modules/apihub/routes');
const chatsRoutes = require('../modules/chats/routes');

/** 去除尾部多余斜杠,保证路由表按规范路径命中 */
function normalizePath(pathname) {
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname || '/';
}

/** 段级 `:param` 匹配(chats 等模块使用路径参数):'GET /api/chats/conversations/:id' 命中
 * 'GET /api/chats/conversations/abc',返回 { key, params };不命中返回 null。
 * 段以 ':' 开头为捕获,否则必须逐字符相等。 */
function matchParamRoute(routeKey, requestKey) {
  const rp = routeKey.split(' ');
  const kp = requestKey.split(' ');
  if (rp.length !== 2 || kp.length !== 2) return null;
  if (rp[0] !== kp[0]) return null;
  const rSegs = rp[1].split('/');
  const kSegs = kp[1].split('/');
  if (rSegs.length !== kSegs.length) return null;
  const params = {};
  for (let i = 1; i < rSegs.length; i++) { // 从第 1 段起(第 0 段为空)
    if (rSegs[i].charAt(0) === ':') {
      params[rSegs[i].slice(1)] = decodeURIComponent(kSegs[i] || '');
    } else if (rSegs[i] !== kSegs[i]) {
      return null;
    }
  }
  return { key: routeKey, params };
}

/** 精确匹配优先,其次 :param 模式匹配;断言失败原因供自定义路由冲突检测 */
function lookupRoute(routes, key) {
  if (routes[key]) return { route: routes[key], params: {} };
  for (const k of Object.keys(routes)) {
    if (k.indexOf(':') === -1) continue;
    const hit = matchParamRoute(k, key);
    if (hit) return { route: routes[k], params: hit.params };
  }
  return { route: null, params: {} };
}

/**
 * @param {{ db, encrypt, decrypt, verifyPassword, matchesPassword }} ctx 依赖注入
 */
function createApiHandler(ctx) {
  const hub = createHub(ctx);

  // 内置路由表(静态);hub 自定义路由在请求时按配置动态解析
  const allRoutes = authRoutes(ctx)
    .concat(settingsRoutes(ctx))
    .concat(hubRoutes(Object.assign({}, ctx, { hub })))
    .concat(chatsRoutes(ctx));
  const routes = {};
  allRoutes.forEach(function (r) {
    routes[r.method + ' ' + r.path] = r;
  });

  // 供 hub 使用:发现列表(不含 /api/hub/* 管理接口)+ 冲突检测
  hub.staticRoutes = allRoutes.filter(function (r) {
    return r.path.indexOf('/api/hub/') !== 0;
  });
  hub.staticRouteKeys = hub.staticRoutes.map(function (r) {
    return r.method + ' ' + r.path;
  });
  // saveAll 通过闭包读取 deps.staticRouteKeys 做冲突检测,同步到注入对象
  ctx.staticRouteKeys = hub.staticRouteKeys;

  return async function handleApi(req, res, pathname) {
    const started = Date.now();
    let state = null;
    try {
      const key = req.method + ' ' + normalizePath(pathname);
      const { route: routeEntry, params: routeParams } = lookupRoute(routes, key);
      const route = routeEntry;
      state = await hub.loadAll();
      // 内置路由未命中时,尝试匹配自定义路由
      const custom =
        route === null
          ? state.config.customRoutes.filter(function (c) {
              return c.method + ' ' + c.path === key;
            })[0] || null
          : null;
      if (!route && !custom) return sendJson(res, 404, { error: 'not_found' });

      // 管理接口强制会话鉴权;其余按 Hub 策略(公开开关 + 鉴权方式)
      const mgmt = route && route.path.indexOf('/api/hub/') === 0;
      let policy;
      if (mgmt) {
        policy = { public: false, auth: 'session', isHubMgmt: true };
      } else if (route && route.public) {
        policy = { public: true, auth: 'none', isHubMgmt: false };
      } else {
        policy = hub.policyFor(key, custom, state.config);
      }

      const auth = await hub.authorize(req, key, { auth: policy.auth, customId: custom ? custom.id : null }, state);
      if (!auth.ok) {
        return sendJson(res, auth.status, {
          error: auth.error,
          message: auth.message,
        });
      }

      if (custom) {
        return hub.handleCustom(custom, req, res, sendJson);
      }
      // :param 路由参数与上下文一起注入(现有路由第三参仍为 ctx,兼容不变)
      return route.handler(
        req,
        res,
        Object.assign({}, ctx, { session: auth.session, params: routeParams || {} })
      );
    } finally {
      // 请求访问日志(配置驱动;失败绝不影响请求本身)
      try {
        if (state && hub.shouldLogRequest(req, normalizePath(pathname), state.config)) {
          const ua =
            (req.headers && (req.headers['user-agent'] || req.headers['User-Agent'])) || '';
          await hub.appendLog(
            {
              method: req.method,
              path: normalizePath(pathname),
              status: res.statusCode || 0,
              ts: Date.now(),
              ip: hub.clientIp(req),
              ua: String(ua).slice(0, 200),
              ms: Date.now() - started,
            },
            state.config
          );
        }
      } catch (e) {
        /* 日志落库失败仅静默忽略,不阻塞响应 */
      }
    }
  };
}

module.exports = { createApiHandler, sendJson };
