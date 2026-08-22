/* hub-shared.js — API Hub 常量、请求/路径纯工具与自定义路由回显（自 service.js 拆出，红线 12）
 * 无状态、无 IO：仅操作入参与字面量，供 service / hub-config 共用。 */
'use strict';


  /** 是否命中机器人 UA(排除机器人请求时使用) */
  function isBotUa(ua) {
    return typeof ua === 'string' && BOT_RE.test(ua);
  }

  /**
   * 判断某请求是否应记录日志(依据配置):
   *   excludeInternal → 项目内部管理接口(/api/hub /api/settings /api/auth)不记录
   *   excludeBots      → 机器人 / 爬虫 / 监测 UA 不记录
   */
  function shouldLogRequest(req, pathname, cfg) {
    const logging = (cfg && cfg.logging) || DEFAULT_LOGGING;
    if (logging.excludeInternal && isInternalPath(pathname)) return false;
    if (logging.excludeBots) {
      const ua = getHeader(req, 'user-agent');
      if (isBotUa(ua)) return false;
    }
    return true;
  }

  /** 从 Node req / Worker Request 提取客户端 IP(兼容两种形态) */
  // 信任链收敛在 server/core/http/client-ip.js:Node 直连 socket → cf-connecting-ip →
  // x-forwarded-for 末位(平台追加的真实 IP)。不得直接取 x-forwarded-for 首值(客户端可控)。
  const { clientIp } = require('../../core/http/client-ip');

  /** 校验自定义路由路径:必须以 / 开头、不含 .. 段、不含查询串 */
  function isValidPath(p) {
    if (typeof p !== 'string') return false;
    if (p.charAt(0) !== '/') return false;
    if (p.indexOf('?') !== -1 || p.indexOf('#') !== -1) return false;
    return p.split('/').indexOf('..') === -1;
  }

  function normalizePath(p) {
    let out = p.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
    return out || '/';
  }

  /** 自定义路由执行:echo(回显请求)/ static(固定响应) */
  async function handleCustom(customRoute, req, res, sendJsonFn) {
    if (customRoute.responseType === 'static') {
      return sendJsonFn(res, customRoute.staticStatus || 200, customRoute.staticBody || { ok: true });
    }
    // echo:回显方法 / 路径 / 查询参数 / 请求头(去敏感) / 请求体
    let rawBody = '';
    if (typeof req.on === 'function') {
      rawBody = await new Promise(function (resolve) {
        let data = '';
        req.on('data', function (c) {
          data += c;
          if (data.length > 1e6) data = data.slice(0, 1e6);
        });
        req.on('end', function () {
          resolve(data);
        });
        req.on('error', function () {
          resolve('');
        });
      });
    } else if (typeof req.text === 'function') {
      try {
        rawBody = await req.text();
      } catch (e) {
        rawBody = '';
      }
    }
    let parsedBody = null;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (e) {
        parsedBody = rawBody;
      }
    }
    const url = new URL(req.url || '/', 'http://localhost');
    const query = {};
    url.searchParams.forEach(function (v, k) {
      query[k] = v;
    });
    const headers = {};
    // Node:req.headers 对象;Worker:headers.entries()
    if (req.headers && typeof req.headers.entries === 'function') {
      req.headers.forEach(function (v, k) {
        headers[k] = v;
      });
    } else if (req.headers) {
      Object.keys(req.headers).forEach(function (k) {
        headers[k] = req.headers[k];
      });
    }
    // 不原样回显敏感请求头
    ['authorization', 'x-auth-token', 'x-auth-password', 'x-api-key', 'cookie'].forEach(function (h) {
      delete headers[h];
    });
    return sendJsonFn(res, 200, {
      method: customRoute.method,
      path: customRoute.path,
      query: query,
      headers: headers,
      body: parsedBody === null ? undefined : parsedBody,
      timestamp: new Date().toISOString(),
    });
  }

// 旧版 app_settings 存储键(仅用于惰性迁移;新数据落 apihub_* 独立表)
const HUB_CONFIG_KEY = 'settings:hub:config';

const HUB_SECRETS_KEY = 'settings:hub:secrets';

const HUB_HISTORY_KEY = 'settings:hub:history';

const HUB_LOGS_KEY = 'settings:hub:logs';

const LEGACY_HUB_KEYS = [HUB_CONFIG_KEY, HUB_SECRETS_KEY, HUB_HISTORY_KEY, HUB_LOGS_KEY];

/** 未设置活跃工作空间时的兜底(与前端默认工作空间一致) */
const DEFAULT_WORKSPACE_ID = 'ws-default';

const HISTORY_CAP = 50; // 历史条数上限(前端展示 20,服务端多留余量)

/** 默认日志配置:条数上限 / 保留天数 / 排除机器人 / 排除项目内部访问 */
const DEFAULT_LOGGING = {
  maxLogs: 500,
  retentionDays: 7,
  excludeBots: false,
  excludeInternal: true,
};

/** 校验单条日志:method/path/status/ts 合法才保留(ip/ua/ms 可选) */
function normalizeLogEntry(e) {
  if (!isPlainObject(e)) return null;
  if (METHODS.indexOf(e.method) === -1) return null;
  if (typeof e.path !== 'string' || !e.path) return null;
  const status = Number(e.status);
  if (!Number.isFinite(status) || status < 0 || status > 599) return null;
  const ts = Number(e.ts);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return {
    method: String(e.method),
    path: String(e.path).slice(0, 500),
    status: Math.floor(status),
    ts: Math.floor(ts),
    ip: typeof e.ip === 'string' ? String(e.ip).slice(0, 64) : '',
    ua: typeof e.ua === 'string' ? String(e.ua).slice(0, 200) : '',
    ms: Number.isFinite(Number(e.ms)) ? Math.max(0, Math.floor(Number(e.ms))) : 0,
  };
}

/** 常见机器人 / 爬虫 / 监测 UA 特征(排除机器人请求时命中即不记录) */
const BOT_RE =
  /(bot|crawl|spider|slurp|bingpreview|googlebot|baiduspider|yandex|duckduckbot|facebookexternalhit|pingdom|uptimerobot|monitor|headless|curl\/|wget|python-requests|go-http-client|axios\/|node-fetch)/i;

/** 项目内部管理接口:apihub 管理 / 设置 / 鉴权(排除项目内部访问时命中即不记录) */
function isInternalPath(pathname) {
  const p = String(pathname || '');
  return p.indexOf('/api/hub/') === 0 || p.indexOf('/api/settings') === 0 || p.indexOf('/api/auth/') === 0;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const AUTH_MODES = ['none', 'session', 'bearer', 'global-password', 'api-key'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 解析 JSON 字符串;失败返回 fallback(绝不抛出) */
function parseJson(text, fallback) {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

function validId(id) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''));
}

/** 从 Node/Worker 两种请求对象中取请求头 */
function getHeader(req, name) {
  if (!req) return null;
  if (typeof req.headers.get === 'function') return req.headers.get(name);
  if (req.headers) {
    const v = req.headers[name.toLowerCase()];
    return v === undefined ? req.headers[name] : v;
  }
  return null;
}

/** Authorization: Bearer <token> 解析 */
function parseBearer(auth) {
  if (typeof auth !== 'string') return '';
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return m ? m[1] : '';
}

module.exports = {
  HUB_CONFIG_KEY,
  HUB_SECRETS_KEY,
  HUB_HISTORY_KEY,
  HUB_LOGS_KEY,
  LEGACY_HUB_KEYS,
  DEFAULT_WORKSPACE_ID,
  HISTORY_CAP,
  DEFAULT_LOGGING,
  METHODS,
  AUTH_MODES,
  isInternalPath,
  isPlainObject,
  parseJson,
  validId,
  getHeader,
  parseBearer,
  isValidPath,
  normalizePath,
  BOT_RE,
  isBotUa,
  shouldLogRequest,
  clientIp,
  handleCustom,
  normalizeLogEntry,
};
