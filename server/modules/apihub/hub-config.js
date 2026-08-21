/* hub-config.js — API Hub 配置域纯逻辑（默认配置/规范化清洗/分组公开级联/路由生效策略）
 * 自 service.js 拆出（红线 12）；无 IO，策略计算只依赖传入的配置对象。 */
'use strict';

const {
  isPlainObject,
  validId,
  AUTH_MODES,
  METHODS,
  isValidPath,
  normalizePath,
  DEFAULT_LOGGING,
} = require('./hub-shared');

/** 默认配置:无分组/标签/覆盖,默认鉴权 = 会话令牌 */
function defaultConfig() {
  return {
    version: 1,
    defaults: { auth: 'session' },
    groups: [],
    tags: [],
    routes: {}, // "METHOD path" → 覆盖配置
    customRoutes: [],
    logging: Object.assign({}, DEFAULT_LOGGING),
  };
}

  /** 校验并规范化配置(补默认值 / 清洗非法字段 / 分组公开级联) */
  function normalizeConfig(input) {
    const cfg = defaultConfig();
    if (isPlainObject(input)) {
      if (isPlainObject(input.defaults)) {
        const auth = input.defaults.auth;
        if (AUTH_MODES.indexOf(auth) !== -1) cfg.defaults.auth = auth;
      }
      if (Array.isArray(input.groups)) {
        cfg.groups = input.groups
          .filter(function (g) {
            return isPlainObject(g) && validId(g.id) && typeof g.name === 'string' && g.name.trim();
          })
          .map(function (g) {
            return {
              id: String(g.id),
              name: String(g.name).trim().slice(0, 50),
              parentId: validId(g.parentId) ? String(g.parentId) : '',
              public: !!g.public,
              sort: Number(g.sort) || 0,
              icon: typeof g.icon === 'string' ? String(g.icon).slice(0, 16) : '',
              color:
                typeof g.color === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-z][a-z0-9-]{0,20})$/.test(g.color)
                  ? String(g.color).slice(0, 24)
                  : '',
            };
          });
      }
      if (Array.isArray(input.tags)) {
        cfg.tags = input.tags
          .filter(function (t) {
            return isPlainObject(t) && validId(t.id) && typeof t.name === 'string' && t.name.trim();
          })
          .map(function (t) {
            return {
              id: String(t.id),
              name: String(t.name).trim().slice(0, 40),
              parentId: validId(t.parentId) ? String(t.parentId) : '',
              sort: Number(t.sort) || 0,
              icon: typeof t.icon === 'string' ? String(t.icon).slice(0, 16) : '',
              color:
                typeof t.color === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-z][a-z0-9-]{0,20})$/.test(t.color)
                  ? String(t.color).slice(0, 24)
                  : '',
            };
          });
      }
      if (isPlainObject(input.routes)) {
        Object.keys(input.routes).forEach(function (key) {
          const ov = input.routes[key];
          if (!isPlainObject(ov)) return;
          const clean = {};
          if (typeof ov.name === 'string' && ov.name.trim()) clean.name = ov.name.trim().slice(0, 60);
          if (typeof ov.desc === 'string' && ov.desc.trim())
            clean.desc = ov.desc.trim().slice(0, 200);
          if (AUTH_MODES.indexOf(ov.auth) !== -1) clean.auth = ov.auth;
          clean.public = !!ov.public;
          clean.favorite = !!ov.favorite;
          clean.pinned = !!ov.pinned;
          clean.groupIds = Array.isArray(ov.groupIds)
            ? ov.groupIds.filter(validId).map(String).slice(0, 20)
            : [];
          clean.tagIds = Array.isArray(ov.tagIds)
            ? ov.tagIds.filter(validId).map(String).slice(0, 20)
            : [];
          cfg.routes[key] = clean;
        });
      }
      if (Array.isArray(input.customRoutes)) {
        cfg.customRoutes = input.customRoutes
          .filter(function (c) {
            return (
              isPlainObject(c) &&
              validId(c.id) &&
              METHODS.indexOf(c.method) !== -1 &&
              typeof c.path === 'string' &&
              isValidPath(c.path)
            );
          })
          .map(function (c) {
            return {
              id: String(c.id),
              method: String(c.method),
              path: normalizePath(c.path),
              name: typeof c.name === 'string' ? c.name.trim().slice(0, 60) : '',
              desc: typeof c.desc === 'string' ? c.desc.trim().slice(0, 200) : '',
              responseType: c.responseType === 'static' ? 'static' : 'echo',
              staticStatus: Number(c.staticStatus) >= 100 && Number(c.staticStatus) <= 599
                ? Number(c.staticStatus)
                : 200,
              staticBody: c.responseType === 'static' ? c.staticBody : null,
              auth: AUTH_MODES.indexOf(c.auth) !== -1 ? c.auth : '',
              public: !!c.public,
              favorite: !!c.favorite,
              pinned: !!c.pinned,
              groupIds: Array.isArray(c.groupIds) ? c.groupIds.filter(validId).map(String).slice(0, 20) : [],
              tagIds: Array.isArray(c.tagIds) ? c.tagIds.filter(validId).map(String).slice(0, 20) : [],
            };
          });
      }
      if (isPlainObject(input.logging)) {
        const lg = Object.assign({}, DEFAULT_LOGGING);
        const maxLogs = Number(input.logging.maxLogs);
        lg.maxLogs = Number.isFinite(maxLogs) ? Math.max(10, Math.min(10000, Math.floor(maxLogs))) : DEFAULT_LOGGING.maxLogs;
        const retentionDays = Number(input.logging.retentionDays);
        lg.retentionDays = Number.isFinite(retentionDays)
          ? Math.max(1, Math.min(365, Math.floor(retentionDays)))
          : DEFAULT_LOGGING.retentionDays;
        lg.excludeBots = !!input.logging.excludeBots;
        lg.excludeInternal = !!input.logging.excludeInternal;
        cfg.logging = lg;
      }
    }
    return cascadeGroupPublic(cfg);
  }

  /** 分组公开级联:父分组公开 → 全部子孙分组强制公开(存储层保证 UI 与运行一致) */
  function cascadeGroupPublic(cfg) {
    const byId = {};
    cfg.groups.forEach(function (g) {
      byId[g.id] = g;
    });
    // 多次遍历直到稳定(多级嵌套)
    let changed = true;
    while (changed) {
      changed = false;
      cfg.groups.forEach(function (g) {
        if (!g.public && g.parentId && byId[g.parentId] && byId[g.parentId].public) {
          g.public = true;
          changed = true;
        }
      });
    }
    return cfg;
  }

  /** 分组(含祖先链)是否公开:任一祖先公开则该组公开 */
  function groupIsPublic(id, cfg) {
    const byId = {};
    cfg.groups.forEach(function (g) {
      byId[g.id] = g;
    });
    const seen = {};
    let cur = byId[id];
    while (cur && !seen[cur.id]) {
      seen[cur.id] = true;
      if (cur.public) return true;
      cur = cur.parentId ? byId[cur.parentId] : null;
    }
    return false;
  }

  /**
   * 计算路由生效策略。
   * @param {string} key "METHOD path"(内置路由)或自定义路由 id
   * @param {object|null} customRoute 自定义路由对象
   * @param {object} cfg 规范化后的配置
   * @returns {{ public: boolean, auth: string, isHubMgmt: boolean }}
   */
  function policyFor(key, customRoute, cfg) {
    const isHubMgmt = key.indexOf('/api/hub/') !== -1;
    if (isHubMgmt) return { public: false, auth: 'session', isHubMgmt: true };

    if (customRoute) {
      const pub =
        customRoute.public ||
        (customRoute.groupIds || []).some(function (gid) {
          return groupIsPublic(gid, cfg);
        });
      return {
        public: pub,
        auth: pub ? 'none' : customRoute.auth || cfg.defaults.auth || 'session',
        isHubMgmt: false,
      };
    }

    const ov = cfg.routes[key];
    const pub =
      !!(ov && ov.public) ||
      ((ov && ov.groupIds) || []).some(function (gid) {
        return groupIsPublic(gid, cfg);
      });
    return {
      public: pub,
      auth: pub ? 'none' : (ov && ov.auth) || cfg.defaults.auth || 'session',
      isHubMgmt: false,
    };
  }

  /** 取某路由的 API Key(自定义路由优先 'cr:<id>',回退到路由键) */
  function apiKeyFor(routeKey, customId, secrets) {
    const keys = (secrets && isPlainObject(secrets.apiKeys) ? secrets.apiKeys : {}) || {};
    if (customId && typeof keys['cr:' + customId] === 'string') return keys['cr:' + customId];
    return typeof keys[routeKey] === 'string' ? keys[routeKey] : '';
  }

module.exports = {
  defaultConfig,
  normalizeConfig,
  cascadeGroupPublic,
  groupIsPublic,
  policyFor,
  apiKeyFor,
};
