/* ============================================================
 * db-turso.js — 远程 Turso/libSQL 驱动(HTTP v2 pipeline API)
 * ------------------------------------------------------------
 * 通过 libsql server 的 HTTP 接口访问远程数据库(与本地 sqlite 同一接口):
 *   DB_DRIVER=turso
 *   DATABASE_URL=https://<db>-<org>.turso.io
 *   DATABASE_AUTH_TOKEN=<token>
 * 依赖全局 fetch(Node >= 18)。部署到 Vercel/Cloudflare 时可将
 * 同样的 SQL 与命名规范用于 D1(新增一个 adapter 即可,见 README)。
 * 注意:参数绑定按位置数组,args 形状为 [{ type, value }]。
 * ============================================================ */
'use strict';

const { migrateAppSettings } = require('../schema');

function init(opts) {
  const env = (opts && opts.env) || process.env;
  let baseUrl = (env.DATABASE_URL || '').trim().replace(/\/+$/, '');
  const token = env.DATABASE_AUTH_TOKEN || '';
  if (!baseUrl) {
    throw new Error('[db-turso] 缺少 DATABASE_URL(如 https://<db>-<org>.turso.io)');
  }
  // Turso 控制台常给 libsql:// 形式(仅驱动原生支持),Node fetch 只认 http(s),
  // 这里把 libsql:// 归一化为 https://,避免 fetch 抛 "fetch failed"。
  // (http:// 保留原样,便于本地 libsql dev server 调试。)
  if (baseUrl.startsWith('libsql://')) {
    baseUrl = 'https://' + baseUrl.slice('libsql://'.length);
  }
  const endpoint = baseUrl + '/v2/pipeline';

  function bindArgs(params) {
    return (params || []).map(function (p) {
      if (p === null || p === undefined) return { type: 'null', value: null };
      if (typeof p === 'number') return { type: 'integer', value: p };
      return { type: 'text', value: String(p) };
    });
  }

  /** 兼容两种响应形状:
   *  旧版: { type:'execute', response: { cols, rows: [[v,..],..] } }(裸值)
   *  新版(Turso 云端当前): { type:'ok', response: { type:'execute', result: { cols, rows: [[{type,value},..],..] } } }
   */
  function unwrapValue(v) {
    if (v && typeof v === 'object' && 'value' in v) {
      // 新版协议 integer/real 的 value 是字符串,转回数字与旧版行为保持一致
      if (v.type === 'integer' || v.type === 'real') return Number(v.value);
      return v.value;
    }
    return v;
  }

  function rowsFrom(result) {
    let resp = result && result.response;
    if (resp && resp.result) resp = resp.result; // 新版形状
    if (!resp || !Array.isArray(resp.cols)) return [];
    return resp.rows.map(function (row) {
      const obj = {};
      resp.cols.forEach(function (col, i) {
        const v = unwrapValue(row[i]);
        obj[col.name] = v === null ? null : v;
      });
      return obj;
    });
  }

  async function pipeline(requests) {
    let r;
    try {
      r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ requests }),
      });
    } catch (e) {
      // 常见原因:DATABASE_URL 配错 / 网络不通 / libsql:// 未归一化(此处已自动转换)。
      // 不回显 endpoint 与底层错误对象——其中可能携带库地址/凭据,避免落入日志。
      throw new Error('[db-turso] 无法连接(请检查 DATABASE_URL 与网络)');
    }
    if (!r.ok) {
      // 不回显远端响应体(可能包含 SQL 语句或查询数据),仅保留状态码
      await r.text().catch(function () {}); // 消费剩余 body,释放连接
      throw new Error('[db-turso] HTTP ' + r.status + '(远端拒绝,详情已脱敏)');
    }
    const body = await r.json();
    const results = Array.isArray(body) ? body : body.results;
    if (!Array.isArray(results)) {
      throw new Error('[db-turso] 响应格式异常(详情已脱敏)');
    }
    return results;
  }

  return {
    name: 'turso',
    path: baseUrl,

    async query(sql, params) {
      const results = await pipeline([{ type: 'execute', stmt: { sql, args: bindArgs(params) } }]);
      return rowsFrom(results[0]);
    },

    async get(sql, params) {
      const rows = await this.query(sql, params);
      return rows.length ? rows[0] : null;
    },

    async run(sql, params) {
      const results = await pipeline([{ type: 'execute', stmt: { sql, args: bindArgs(params) } }]);
      let resp = results[0] && results[0].response;
      if (resp && resp.result) resp = resp.result; // 新版形状
      return {
        changes: Number((resp && (resp.rows_affected ?? resp.affected_row_count)) || 0) || 0,
        lastInsertRowid: Number((resp && (resp.last_insert_rowid ?? 0)) || 0) || 0,
      };
    },

    /** 建表(远程驱动初始化时执行;随后补齐工作空间迁移) */
    async initSchema(schema) {
      const statements = schema
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sql of statements) {
        await this.run(sql + ';');
      }
      await migrateAppSettings(this);
    },
  };
}

module.exports = { init };
