/* ============================================================
 * hub/index.js — API Hub 核心(配置存取 + 公开/鉴权策略,Node / Worker 共用)
 * ------------------------------------------------------------
 * 职责:
 *   1. 存取 Hub 配置与密钥(独立表 apihub_config/apihub_history/apihub_logs,
 *      均按当前工作空间 workspace_id 隔离;旧版 settings:hub:* 惰性迁移):
 *        apihub_config    config 明文(分组/标签/路由覆盖/自定义路由/日志设置)
 *                        + secrets 加密落库(各路由的 API Key,键名含 secret → 敏感键)
 *        apihub_history   请求运行历史
 *        apihub_logs      请求访问日志(受条数上限/保留天数/排除规则驱动)
 *   2. 解析每个路由的生效策略:公开开关(含分组级联)/ 鉴权方式
 *   3. 按鉴权方式校验请求:
 *        none            无需鉴权(公开开关打开时)
 *        session         请求头 x-auth-token 会话(默认)
 *        bearer          Authorization: Bearer <token> 会话
 *        global-password 请求头 x-auth-password 与全局密码常量时间比较(兜底)
 *        api-key         请求头 x-api-key 与 Hub 中配置的密钥比较
 *
 * 运行时无关:
 *   - req 同时兼容 Node(req.headers[name])与 Worker(request.headers.get(name));
 *   - 密码 / API Key 比较通过注入的 matchesPassword(node:crypto timingSafeEqual);
 *   - verifyPassword 由各运行时注入(Node 读 process.env.AUTH_PASSWORD,
 *     Worker 读 env.AUTH_PASSWORD),未配置时抛错 → 返回 500 提示。
 * ============================================================ */
'use strict';

const { GLOBAL_WORKSPACE_ID } = require('../../db/scope');
const { findSession } = require('../../core/auth/session');
const {
  HUB_CONFIG_KEY,
  HUB_SECRETS_KEY,
  HUB_HISTORY_KEY,
  HUB_LOGS_KEY,
  LEGACY_HUB_KEYS,
  DEFAULT_WORKSPACE_ID,
  HISTORY_CAP,
  METHODS,
  AUTH_MODES,
  DEFAULT_LOGGING,
  isPlainObject,
  parseJson,
  getHeader,
  parseBearer,
  shouldLogRequest,
  isBotUa,
  clientIp,
  handleCustom,
} = require('./hub-shared');
const {
  defaultConfig,
  normalizeConfig,
  groupIsPublic,
  policyFor,
  apiKeyFor,
} = require('./hub-config');

/**
 * @param {object} deps 依赖注入
 * @param {object} deps.db SQLite/Turso/D1 统一接口(get/run)
 * @param {function} deps.encrypt 敏感值加密
 * @param {function} deps.decrypt 敏感值解密
 * @param {function} deps.verifyPassword 校验全局密码(未配置 AUTH_PASSWORD 时抛错)
 * @param {function} [deps.matchesPassword] 常量时间比较(缺省回退 node:crypto)
 */
function createHub(deps) {
  const { db, encrypt, decrypt, verifyPassword } = deps;
  const safeEqual =
    deps.matchesPassword ||
    function (a, b) {
      try {
        const crypto = require('crypto');
        const x = Buffer.from(String(a));
        const y = Buffer.from(String(b));
        return x.length === y.length && crypto.timingSafeEqual(x, y);
      } catch (e) {
        return false;
      }
    };

  /** 解析当前活跃工作空间:读全局指针 settings:activeWorkspace,兜底默认工作空间 */
  async function resolveWorkspace() {
    const row = await db.get(
      "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
      [GLOBAL_WORKSPACE_ID]
    );
    return (row && row.value) || DEFAULT_WORKSPACE_ID;
  }

  /** 旧版 settings:hub:* → apihub_* 独立表惰性迁移(幂等;旧数据迁入当前工作空间) */
  let migrated = false;
  async function ensureMigrated() {
    if (migrated) return;
    migrated = true;
    try {
      const configRow = await db.get(
        'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
        [GLOBAL_WORKSPACE_ID, HUB_CONFIG_KEY]
      );
      if (!configRow) return; // 无旧数据
      const ws = await resolveWorkspace();
      const secretsRow = await db.get(
        'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
        [GLOBAL_WORKSPACE_ID, HUB_SECRETS_KEY]
      );
      await db.run(
        'INSERT INTO apihub_config (workspace_id, config, secrets, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET config = excluded.config, secrets = excluded.secrets, updated_at = excluded.updated_at',
        [ws, configRow.value, secretsRow ? secretsRow.value : '{}', new Date().toISOString()]
      );
      const historyRow = await db.get(
        'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
        [GLOBAL_WORKSPACE_ID, HUB_HISTORY_KEY]
      );
      if (historyRow) {
        const list = parseJson(historyRow.value, []);
        if (Array.isArray(list)) {
          for (const e of list) {
            const n = normalizeHistoryEntry(e);
            if (n) {
              await db.run(
                'INSERT INTO apihub_history (workspace_id, method, path, status, ts) VALUES (?, ?, ?, ?, ?)',
                [ws, n.method, n.path, n.status, n.ts]
              );
            }
          }
        }
      }
      const logsRow = await db.get(
        'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
        [GLOBAL_WORKSPACE_ID, HUB_LOGS_KEY]
      );
      if (logsRow) {
        const list = parseJson(logsRow.value, []);
        if (Array.isArray(list)) {
          for (const e of list) {
            const n = normalizeLogEntry(e);
            if (n) {
              await db.run(
                'INSERT INTO apihub_logs (workspace_id, method, path, status, ts, ip, ua, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [ws, n.method, n.path, n.status, n.ts, n.ip, n.ua, n.ms]
              );
            }
          }
        }
      }
      for (const k of LEGACY_HUB_KEYS) {
        await db.run('DELETE FROM app_settings WHERE workspace_id = ? AND key = ?', [GLOBAL_WORKSPACE_ID, k]);
      }
    } catch (e) {
      migrated = false; // 失败下次重试
      throw e;
    }
  }

  /** 校验单条历史:method/path/status/ts 合法才保留 */
  function normalizeHistoryEntry(e) {
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
    };
  }

  /** 读请求历史(按工作空间过滤,ts 倒序,截断到上限) */
  async function loadHistory() {
    await ensureMigrated();
    const ws = await resolveWorkspace();
    const rows = await db.query(
      'SELECT method, path, status, ts FROM apihub_history WHERE workspace_id = ? ORDER BY ts DESC LIMIT ?',
      [ws, HISTORY_CAP]
    );
    return (rows || [])
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .slice(0, HISTORY_CAP);
  }

  /** 写请求历史(校验 + 去重同 ts + 截断上限;整表替换当前工作空间数据) */
  async function saveHistory(history) {
    await ensureMigrated();
    if (!Array.isArray(history)) throw new Error('需要 history 数组');
    const ws = await resolveWorkspace();
    const seen = {};
    const list = history
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .filter(function (e) {
        if (seen[e.ts]) return false;
        seen[e.ts] = true;
        return true;
      })
      .slice(0, HISTORY_CAP);
    await db.run('DELETE FROM apihub_history WHERE workspace_id = ?', [ws]);
    for (const e of list) {
      await db.run(
        'INSERT INTO apihub_history (workspace_id, method, path, status, ts) VALUES (?, ?, ?, ?, ?)',
        [ws, e.method, e.path, e.status, e.ts]
      );
    }
    return list;
  }

  /* ---------- 请求访问日志(配置驱动:条数上限 / 保留天数 / 排除机器人 / 排除内部) ---------- */

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

  /** 读请求访问日志(按工作空间过滤 + 保留天数 + 条数上限,倒序返回) */
  async function loadLogs(cfg) {
    await ensureMigrated();
    const logging = (cfg && cfg.logging) || DEFAULT_LOGGING;
    const ws = await resolveWorkspace();
    const cutoff = Date.now() - (Number(logging.retentionDays) || 7) * 86400000;
    const rows = await db.query(
      'SELECT method, path, status, ts, ip, ua, ms FROM apihub_logs WHERE workspace_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?',
      [ws, cutoff, Number(logging.maxLogs) || 500]
    );
    return (rows || []).map(normalizeLogEntry).filter(Boolean);
  }

  /** 追加一条请求访问日志(INSERT → 清理过期与超出上限的旧行) */
  async function appendLog(entry, cfg) {
    await ensureMigrated();
    const clean = normalizeLogEntry(entry);
    if (!clean) return;
    const logging = (cfg && cfg.logging) || DEFAULT_LOGGING;
    const ws = await resolveWorkspace();
    await db.run(
      'INSERT INTO apihub_logs (workspace_id, method, path, status, ts, ip, ua, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ws, clean.method, clean.path, clean.status, clean.ts, clean.ip, clean.ua, clean.ms]
    );
    // 清理:保留天数 + 条数上限(保留最新 maxLogs 行)
    const cutoff = Date.now() - (Number(logging.retentionDays) || 7) * 86400000;
    const maxLogs = Number(logging.maxLogs) || 500;
    await db.run(
      'DELETE FROM apihub_logs WHERE workspace_id = ? AND (ts < ? OR id NOT IN (SELECT id FROM apihub_logs WHERE workspace_id = ? ORDER BY ts DESC LIMIT ?))',
      [ws, cutoff, ws, maxLogs]
    );
    return loadLogs(cfg);
  }

  /** 清空请求访问日志(当前工作空间) */
  async function clearLogs() {
    await ensureMigrated();
    const ws = await resolveWorkspace();
    await db.run('DELETE FROM apihub_logs WHERE workspace_id = ?', [ws]);
    return [];
  }




  /**
   * 读全量状态:config + secrets(secrets 解密失败回退 {};按当前工作空间)。
   * 短 TTL 内存缓存:handleApi 对每个 API 请求(含 Hub 代理转发)都调用本方法,
   * 避免每次都击穿 DB;saveAll 时显式失效;工作空间切换在 TTL 内(2s)生效。
   * 解密失败显式降级为空 secrets,且不缓存失败态,下次请求重试。
   */
  let stateCache = null; // { at, value }
  const STATE_TTL_MS = 2000;
  async function loadAll() {
    const now = Date.now();
    if (stateCache && now - stateCache.at < STATE_TTL_MS) return stateCache.value;
    await ensureMigrated();
    const ws = await resolveWorkspace();
    const row = await db.get('SELECT config, secrets FROM apihub_config WHERE workspace_id = ?', [ws]);
    let config = parseJson(row && row.config, null);
    if (!config || !isPlainObject(config)) config = defaultConfig();
    config = normalizeConfig(config);
    let secrets;
    try {
      secrets = row && row.secrets ? parseJson(decrypt(row.secrets), {}) : {};
    } catch (e) {
      secrets = {};
    }
    if (!isPlainObject(secrets)) secrets = {};
    if (!isPlainObject(secrets.apiKeys)) secrets.apiKeys = {};
    stateCache = { at: now, value: { config, secrets } };
    return stateCache.value;
  }





  /** 校验请求中的 key 与给定期望值常量时间比较 */
  function keyMatches(actual, expected) {
    if (typeof actual !== 'string' || !actual || typeof expected !== 'string' || !expected) {
      return false;
    }
    return safeEqual(actual, expected);
  }




  /**
   * 按策略校验请求。成功返回 { ok: true, session },失败返回 { ok:false, status, error, message }。
   * @param {object} req Node req / Worker Request
   * @param {string} routeKey "METHOD path"
   * @param {{ auth: string, customId?: string }} opts
   * @param {{ config: object, secrets: object }} state loadAll() 的结果
   */
  async function authorize(req, routeKey, opts, state) {
    const mode = opts.auth || 'session';
    const cfg = state.config;
    const secrets = state.secrets;

    if (mode === 'none') return { ok: true, session: null };

    if (mode === 'global-password') {
      const pwd = getHeader(req, 'x-auth-password');
      if (typeof pwd !== 'string' || !pwd) {
        return {
          ok: false,
          status: 401,
          error: 'unauthorized',
          message: '该路由使用全局密码鉴权,需要请求头 x-auth-password',
        };
      }
      try {
        if (!verifyPassword(pwd)) {
          return { ok: false, status: 401, error: 'unauthorized', message: '全局密码错误' };
        }
      } catch (e) {
        return {
          ok: false,
          status: 500,
          error: 'no_auth_password',
          message: String((e && e.message) || e),
        };
      }
      return { ok: true, session: null };
    }

    if (mode === 'api-key') {
      const key = getHeader(req, 'x-api-key');
      const expected = apiKeyFor(routeKey, opts.customId, secrets);
      if (typeof key !== 'string' || !key || !expected) {
        return {
          ok: false,
          status: 401,
          error: 'unauthorized',
          message: '该路由使用 API Key 鉴权,需要请求头 x-api-key(请在 API Hub 中配置密钥)',
        };
      }
      if (!keyMatches(key, expected)) {
        return { ok: false, status: 401, error: 'unauthorized', message: 'API Key 无效' };
      }
      return { ok: true, session: null };
    }

    // session / bearer:均解析为会话令牌
    const token =
      mode === 'bearer'
        ? parseBearer(getHeader(req, 'authorization'))
        : typeof getHeader(req, 'x-auth-token') === 'string'
          ? getHeader(req, 'x-auth-token')
          : '';
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      return {
        ok: false,
        status: 401,
        error: 'unauthorized',
        message: '登录已失效,请重新登录',
      };
    }
    return { ok: true, session };
  }

  /** 保存配置与密钥(校验 + 公开级联 + 写库;密钥加密落库) */
  async function saveAll(payload) {
    if (!isPlainObject(payload)) throw new Error('需要 { config, secrets }');
    const cfg = normalizeConfig(payload.config);
    // 自定义路由不得与内置路由重名(避免覆盖管理接口 / 歧义)
    const staticKeys = deps.staticRouteKeys || [];
    for (const c of cfg.customRoutes) {
      const key = c.method + ' ' + c.path;
      if (staticKeys.indexOf(key) !== -1) {
        throw new Error('自定义路由 ' + key + ' 与内置路由冲突');
      }
    }
    const secrets = isPlainObject(payload.secrets) ? payload.secrets : {};
    const apiKeys = isPlainObject(secrets.apiKeys) ? secrets.apiKeys : {};
    const cleanKeys = {};
    Object.keys(apiKeys).forEach(function (k) {
      if (typeof apiKeys[k] === 'string' && apiKeys[k]) cleanKeys[k] = apiKeys[k].slice(0, 256);
    });
    const cleanSecrets = { apiKeys: cleanKeys };

    await ensureMigrated();
    const ws = await resolveWorkspace();
    await db.run(
      'INSERT INTO apihub_config (workspace_id, config, secrets, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET config = excluded.config, secrets = excluded.secrets, updated_at = excluded.updated_at',
      [ws, JSON.stringify(cfg), encrypt(JSON.stringify(cleanSecrets)), new Date().toISOString()]
    );
    stateCache = null; // 配置变更后立即失效 loadAll 缓存
    return { config: cfg, secrets: cleanSecrets };
  }


  return {
    HUB_CONFIG_KEY,
    HUB_SECRETS_KEY,
    HUB_HISTORY_KEY,
    HUB_LOGS_KEY,
    AUTH_MODES,
    METHODS,
    DEFAULT_LOGGING,
    defaultConfig,
    normalizeConfig,
    loadAll,
    saveAll,
    loadHistory,
    saveHistory,
    loadLogs,
    appendLog,
    clearLogs,
    shouldLogRequest,
    isBotUa,
    clientIp,
    policyFor,
    authorize,
    handleCustom,
    groupIsPublic,
  };
}

module.exports = {
  createHub,
  defaultConfig,
  AUTH_MODES,
  DEFAULT_LOGGING,
  HUB_CONFIG_KEY,
  HUB_SECRETS_KEY,
  HUB_HISTORY_KEY,
  HUB_LOGS_KEY,
};
