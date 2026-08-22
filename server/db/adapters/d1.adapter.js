/* ============================================================
 * db-d1.js — Cloudflare D1 驱动(统一 query / run 接口)
 * ------------------------------------------------------------
 * 与 db-sqlite / db-turso 同一接口,两种运行模式:
 *
 * 模式一(推荐):Worker 内使用原生 D1 binding
 *   const { init } = require('./server/db-d1.js');
 *   const db = init({ binding: env.DB, schema: SCHEMA });
 *
 * 模式二:本地 Node 服务器直连 D1(REST API,DB_DRIVER=d1)
 *   环境变量(或 CLOUDFLARE_* 同名变量,见 .env.example):
 *     D1_ACCOUNT_ID     Cloudflare 账号 ID
 *     D1_DATABASE_ID    D1 数据库 ID(UUID)
 *     D1_API_TOKEN      API Token(权限:D1 Read / D1 Write)
 *   接口:POST /accounts/{account_id}/d1/database/{database_id}/query
 *   https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 *
 * D1 为 SQLite 兼容,SCHEMA / SQL 与本地完全一致;敏感键加密、
 * 密码哈希等格式也与本地互通(见 worker.js 说明)。
 * ============================================================ */
'use strict';

const { migrateAppSettings } = require('../schema');

/** 参数绑定兼容两种模式:null/string/number/boolean(bigint 转 number) */
function normalizeParams(params) {
  return (params || []).map(function (p) {
    if (p === null || p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'bigint') return Number(p);
    return p;
  });
}

/* ---------- 模式一:Worker 内 D1 binding(env.DB) ---------- */
function initBinding(opts) {
  const binding = opts.binding;
  return {
    name: 'd1-binding',
    path: 'cloudflare-d1 (binding: DB)',

    /** 查询 → 行数组(对象) */
    async query(sql, params) {
      const res = await binding
        .prepare(sql)
        .bind(...normalizeParams(params))
        .all();
      return res.results || [];
    },

    /** 单行查询 → 对象或 null */
    async get(sql, params) {
      return (
        (await binding
          .prepare(sql)
          .bind(...normalizeParams(params))
          .first()) || null
      );
    },

    /** 写操作 → { changes, lastInsertRowid } */
    async run(sql, params) {
      const res = await binding
        .prepare(sql)
        .bind(...normalizeParams(params))
        .run();
      const meta = res.meta || {};
      return {
        changes: Number(meta.changes || 0),
        lastInsertRowid: Number(meta.last_row_id || 0),
      };
    },

    /** 建表(逐条执行;CREATE TABLE IF NOT EXISTS 幂等,可反复调用) */
    async initSchema(schema) {
      const statements = schema
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sql of statements) await this.run(sql + ';');
      await migrateAppSettings(this);
    },
  };
}

/* ---------- 模式二:本地 Node 服务器走 D1 REST API ---------- */
function initRest(opts) {
  const env = (opts && opts.env) || process.env;
  const accountId = env.D1_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '';
  const databaseId = env.D1_DATABASE_ID || '';
  const token = env.D1_API_TOKEN || env.CLOUDFLARE_API_TOKEN || '';
  if (!accountId || !databaseId || !token) {
    throw new Error(
      '[db-d1] REST 模式需要 D1_ACCOUNT_ID / D1_DATABASE_ID / D1_API_TOKEN' +
        '(或 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN)'
    );
  }
  const endpoint =
    'https://api.cloudflare.com/client/v4/accounts/' +
    encodeURIComponent(accountId) +
    '/d1/database/' +
    encodeURIComponent(databaseId) +
    '/query';

  async function post(sql, params) {
    const body = { sql };
    const args = normalizeParams(params);
    // REST API 的 params 为字符串数组;无参数时省略
    if (args.length) body.params = args.map((p) => (p === null ? null : String(p)));
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      // 不回显远端响应体(可能包含 SQL 语句或查询数据),仅保留状态码
      await r.text().catch(function () {}); // 消费剩余 body,释放连接
      throw new Error('[db-d1] HTTP ' + r.status + '(远端拒绝,详情已脱敏)');
    }
    const data = await r.json();
    if (!data.success) {
      throw new Error('[db-d1] API 错误(详情已脱敏)');
    }
    return (data.result && data.result[0]) || null;
  }

  return {
    name: 'd1-rest',
    path: endpoint,

    async query(sql, params) {
      const r = await post(sql, params);
      return r && Array.isArray(r.results) ? r.results : [];
    },

    async get(sql, params) {
      const rows = await this.query(sql, params);
      return rows.length ? rows[0] : null;
    },

    async run(sql, params) {
      const r = await post(sql, params);
      const meta = (r && r.meta) || {};
      return {
        changes: Number(meta.changes || 0),
        lastInsertRowid: Number(meta.last_row_id || 0),
      };
    },

    /** 建表(REST API 的 sql 支持分号分隔的多条语句,按批次执行) */
    async initSchema(schema) {
      await post(schema, []);
      await migrateAppSettings(this);
    },
  };
}

/** 有 binding 走 Worker 原生模式;否则走 REST(本地 DB_DRIVER=d1) */
function init(opts) {
  return opts && opts.binding ? initBinding(opts) : initRest(opts);
}

module.exports = { init };
