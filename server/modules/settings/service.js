/* ============================================================
 * service.js — 设置 KV 业务逻辑（自 routes.js 拆出，AGENTS §6）
 * ------------------------------------------------------------
 * 职责：工作空间解析、敏感键加解密、app_settings 读写删的 SQL 编排。
 * 路由层（./routes.js）只做参数校验与状态码映射，不写 SQL / 不碰加解密。
 * 错误约定：抛出带 status/code 的 Error，由路由层捕获后按码返回 JSON。
 * 依赖注入：{ db, encrypt, decrypt } 由 server/core/api.js 提供。
 * 敏感键判定与保留键前缀复用 server/core/security/sensitive.js（单一来源）。
 * 工作空间隔离规则见 server/db/scope.js：
 *   - settings:workspaces / settings:activeWorkspace 始终落在 global 作用域;
 *   - 其余 settings:* 键落在当前工作空间(workspace_id = 活跃 id)。
 * ============================================================ */
'use strict';

const { RESERVED_SETTINGS_PREFIX, isSensitiveKey } = require('../../core/security/sensitive');
const { GLOBAL_WORKSPACE_ID, workspaceIdForKey } = require('../../db/scope');

/** 构造带状态码与错误码的业务错误（路由层据此映射响应） */
function fail(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/**
 * @param {object} deps 依赖注入
 * @param {object} deps.db SQLite/Turso/D1 统一接口(get/query/run)
 * @param {function} deps.encrypt 敏感值加密（server/core/security）
 * @param {function} deps.decrypt 敏感值解密
 */
function createSettingsService({ db, encrypt, decrypt }) {
  /** 解析当前活跃工作空间:优先查询参数(切换场景),否则读全局指针,再回退 global */
  async function resolveActiveWorkspace(queryWorkspace) {
    if (queryWorkspace) return queryWorkspace;
    const row = await db.get(
      "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
      [GLOBAL_WORKSPACE_ID]
    );
    return (row && row.value) || GLOBAL_WORKSPACE_ID;
  }

  /** 读取全部应用设置 KV(全局键 + 当前工作空间键;敏感键解密,保留键跳过) */
  async function getSettings(requestedWs) {
    const activeWs = await resolveActiveWorkspace(requestedWs);
    // 全局键 + 当前工作空间键一并返回(前端据此重建注册表与当前工作空间数据)
    const rows = await db.query(
      'SELECT workspace_id, key, value FROM app_settings WHERE workspace_id IN (?, ?) ORDER BY key',
      [GLOBAL_WORKSPACE_ID, activeWs]
    );
    const out = {};
    rows.forEach((r) => {
      if (r.key.indexOf(RESERVED_SETTINGS_PREFIX) === 0) return;
      if (!isSensitiveKey(r.key)) {
        out[r.key] = r.value;
        return;
      }
      // 敏感键解密失败(密钥轮换/密文损坏)时显式降级为空串,
      // 不让单个坏值拖垮整个设置加载;后续保存会以新密钥重写覆盖
      try {
        out[r.key] = decrypt(r.value) || '';
      } catch (e) {
        out[r.key] = '';
      }
    });
    return out;
  }

  /** 批量写入设置 KV(按键归属作用域落库;敏感键加密;保留键拒绝) */
  async function putSettings(entries, declaredWs) {
    const keys = Object.keys(entries);
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        throw fail(403, 'reserved_key', k + ' 为保留键,请走专用鉴权接口');
      }
    }
    // 切工作空间时,负载自带新的 settings:activeWorkspace,按新值归属工作空间键
    const activeWs = await resolveActiveWorkspace(declaredWs);
    const now = new Date().toISOString();
    // 单次批量写入(远程 DB 1 次往返;sqlite 事务原子)——避免 N 个 key N 次往返
    const statements = [];
    for (const k of keys) {
      const wsId = workspaceIdForKey(k, activeWs);
      let v = typeof entries[k] === 'string' ? entries[k] : JSON.stringify(entries[k]);
      // 敏感键:落库前加密,数据库不以明文存放
      if (isSensitiveKey(k)) v = encrypt(v);
      statements.push({
        sql: 'INSERT INTO app_settings (workspace_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        params: [wsId, k, v, now],
      });
    }
    await db.batch(statements);
    return { written: keys.length };
  }

  /** 批量删除设置 KV(逐键按归属作用域精确删除;保留键拒绝) */
  async function deleteSettings(keys, requestedWs) {
    const activeWs = await resolveActiveWorkspace(requestedWs);
    for (const k of keys) {
      if (k.indexOf(RESERVED_SETTINGS_PREFIX) === 0) {
        throw fail(403, 'reserved_key', k + ' 为保留键');
      }
      await db.run('DELETE FROM app_settings WHERE workspace_id = ? AND key = ?', [
        workspaceIdForKey(k, activeWs),
        k,
      ]);
    }
    return { removed: keys.length };
  }

  return { resolveActiveWorkspace, getSettings, putSettings, deleteSettings };
}

module.exports = { createSettingsService };
