/* ============================================================
 * routes.js — 设置 KV API 路由（薄路由，AGENTS §6）
 * ------------------------------------------------------------
 * GET    /api/settings[?workspace=<id>]  返回全局注册表 + 指定/当前工作空间的设置
 * PUT    /api/settings                   批量写入(按键归属作用域落库)
 * DELETE /api/settings                   批量删除(按当前工作空间定位)
 *
 * 本文件只做参数校验、状态码映射与调用 service（SQL/加解密在 ./service.js）；
 * 业务错误由 service 抛出带 status/code 的 Error，这里统一捕获映射。
 * 所有接口默认经过 server/core/api.js 的会话门禁(x-auth-token)。
 * 依赖由 server/core/api.js 注入 { db, encrypt, decrypt }。
 * ============================================================ */
'use strict';

const { sendJson, readBody } = require('../../core/http/json');
const { createSettingsService } = require('./service');

function settingsRoutes(ctx) {
  const service = createSettingsService(ctx);

  /** 统一业务错误映射：service 抛出的 status/code → JSON 响应 */
  function sendError(res, e) {
    return sendJson(res, e && e.status ? e.status : 500, {
      error: (e && e.code) || 'internal_error',
      message: String((e && e.message) || e),
    });
  }

  async function getSettings(req, res) {
    let requestedWs = '';
    try {
      requestedWs = new URL(req.url || '/', 'http://localhost').searchParams.get('workspace') || '';
    } catch (e) {
      requestedWs = '';
    }
    try {
      const out = await service.getSettings(requestedWs);
      return sendJson(res, 200, out);
    } catch (e) {
      return sendError(res, e);
    }
  }

  async function putSettings(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'bad_json' });
    }
    const entries = body && typeof body.settings === 'object' ? body.settings : null;
    if (!entries) return sendJson(res, 400, { error: 'bad_body', message: '需要 { settings: {...} }' });
    // 切工作空间时,负载自带新的 settings:activeWorkspace,按新值归属工作空间键
    const declared =
      typeof entries['settings:activeWorkspace'] === 'string' && entries['settings:activeWorkspace']
        ? entries['settings:activeWorkspace']
        : '';
    try {
      const { written } = await service.putSettings(entries, declared);
      return sendJson(res, 200, { ok: true, written });
    } catch (e) {
      return sendError(res, e);
    }
  }

  async function deleteSettings(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'bad_json' });
    }
    // 支持 ?workspace=<id>:删除非当前工作空间时精确定位(如删除工作空间前的数据清理)
    let requestedWs = '';
    try {
      requestedWs = new URL(req.url || '/', 'http://localhost').searchParams.get('workspace') || '';
    } catch (e) {
      requestedWs = '';
    }
    const keys = Array.isArray(body && body.keys) ? body.keys : [];
    try {
      const { removed } = await service.deleteSettings(keys, requestedWs);
      return sendJson(res, 200, { ok: true, removed });
    } catch (e) {
      return sendError(res, e);
    }
  }

  return [
    {
      method: 'GET',
      path: '/api/settings',
      desc: '读取全部应用设置 KV(按工作空间隔离,敏感键解密返回)',
      handler: getSettings,
    },
    {
      method: 'PUT',
      path: '/api/settings',
      desc: '批量写入设置 KV({ settings: { key: value } },敏感键加密落库)',
      handler: putSettings,
    },
    {
      method: 'DELETE',
      path: '/api/settings',
      desc: '批量删除设置 KV({ keys: [ ... ] })',
      handler: deleteSettings,
    },
  ];
}

module.exports = settingsRoutes;
