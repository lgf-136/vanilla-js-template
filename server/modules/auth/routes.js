/* ============================================================
 * routes/auth.js — 鉴权相关 API 路由
 * ------------------------------------------------------------
 * POST /api/auth/login    登录(公开)
 * GET  /api/auth/verify   校验会话
 * POST /api/auth/logout   登出
 * 依赖由 server/core/api.js 注入 { db, verifyPassword }。
 * ============================================================ */
'use strict';

const crypto = require('crypto');
const { EXPIRY_MS } = require('../../core/auth/expiry');
const { sha256 } = require('../../core/auth/session');
const { createThrottle } = require('../../core/auth/throttle');
const { sendJson, readBody } = require('../../core/http/json');
const { clientIp } = require('../../core/http/client-ip');

/* 登录暴力破解限流:只统计密码错误次数,成功登录后清空 */
const loginThrottle = createThrottle();

/* 会话表上限:超出删除最旧会话,防止表无限增长(结合过期清理) */
const MAX_SESSIONS = 50;

function authRoutes({ db, verifyPassword }) {
  async function login(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: 'bad_json' });
    }
    const password = typeof body.password === 'string' ? body.password : '';
    const expiry = typeof body.expiry === 'string' ? body.expiry : '24h';
    const ttl = EXPIRY_MS[expiry];
    if (!ttl) return sendJson(res, 400, { error: 'bad_expiry', message: '不支持的失效选项' });

    const ip = clientIp(req, 'unknown');
    if (loginThrottle.isBlocked(ip)) {
      return sendJson(res, 429, {
        error: 'too_many_attempts',
        message: '登录尝试过于频繁,请稍后再试',
      });
    }

    let ok;
    try {
      ok = verifyPassword(password); // 与 AUTH_PASSWORD 环境变量常量时间比较
    } catch (e) {
      return sendJson(res, 500, {
        error: 'no_auth_password',
        message: String((e && e.message) || e),
      });
    }
    if (!ok) {
      loginThrottle.recordFailure(ip);
      return sendJson(res, 401, { error: 'bad_password', message: '密码错误' });
    }
    loginThrottle.clear(ip);

    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + ttl).toISOString();
    // 数据库仅存 SHA-256 哈希,明文令牌只在响应中返回给客户端
    // 三条写合并为单次批量(远程 DB 1 次往返;sqlite 事务原子)
    await db.batch([
      {
        sql: 'INSERT INTO auth_sessions (token_hash, expires_at, note) VALUES (?, ?, ?)',
        params: [sha256(token), expiresAt, expiry],
      },
      {
        sql: 'DELETE FROM auth_sessions WHERE expires_at IS NOT NULL AND expires_at <= ?',
        params: [new Date().toISOString()],
      },
      {
        sql: 'DELETE FROM auth_sessions WHERE token_hash NOT IN (SELECT token_hash FROM auth_sessions ORDER BY created_at DESC LIMIT ?)',
        params: [MAX_SESSIONS],
      },
    ]);
    return sendJson(res, 200, { token, expiresAt, expiry });
  }

  return [
    {
      method: 'POST',
      path: '/api/auth/login',
      public: true,
      desc: '使用全局密码登录,换取会话令牌 x-auth-token',
      handler: login,
    },
    {
      method: 'GET',
      path: '/api/auth/verify',
      desc: '校验当前会话令牌是否有效,返回剩余有效时长',
      // session 可能为空(公开 / 全局密码 / API Key 鉴权),容忍处理
      handler(req, res, ctx) {
        return sendJson(res, 200, {
          ok: true,
          expiry: ctx.session ? ctx.session.note : null,
        });
      },
    },
    {
      method: 'POST',
      path: '/api/auth/logout',
      desc: '注销当前会话令牌(按请求头 x-auth-token 定位)',
      async handler(req, res) {
        const token = req.headers['x-auth-token'];
        if (typeof token === 'string' && token) {
          await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [sha256(token)]);
        }
        return sendJson(res, 200, { ok: true });
      },
    },
  ];
}

module.exports = authRoutes;
