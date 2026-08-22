'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const authRoutes = require('./routes');

/** 内存假 db:记录所有 run 调用 */
function fakeDb() {
  const calls = [];
  return {
    calls,
    async run(sql, params) {
      calls.push({ type: 'run', sql, params });
    },
    async batch(statements) {
      calls.push({ type: 'batch', statements });
    },
    async get() {
      return null;
    },
  };
}

/** 假 res:捕获状态码与响应体 */
function fakeRes() {
  let status = 0;
  let payload = null;
  return {
    get statusCode() {
      return status;
    },
    get body() {
      return payload;
    },
    writeHead(s) {
      status = s;
    },
    end(body) {
      payload = body ? JSON.parse(body) : null;
    },
  };
}

/** 假 req:携带 x-forwarded-for 与异步 body(data/end) */
function fakeReq({ body, ip }) {
  const listeners = {};
  const req = {
    headers: { 'x-forwarded-for': ip },
    on(event, cb) {
      (listeners[event] = listeners[event] || []).push(cb);
      return req;
    },
  };
  setImmediate(() => {
    if (body) (listeners.data || []).forEach((cb) => cb(JSON.stringify(body)));
    (listeners.end || []).forEach((cb) => cb());
  });
  return req;
}

/** 每次调用创建独立路由实例(登录限流为模块级,用独立 db 隔离 SQL 断言) */
function makeLogin(db) {
  const routes = authRoutes({ db, verifyPassword: (p) => p === 'correct-password' });
  return routes.find((r) => r.path === '/api/auth/login').handler;
}

test('登录成功:返回令牌,按序执行 插入 → 过期清理 → 上限裁剪', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await makeLogin(db)(fakeReq({ body: { password: 'correct-password', expiry: '24h' }, ip: '198.51.100.7' }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token && typeof res.body.token === 'string');
  assert.equal(res.body.expiry, '24h');
  // 三条 SQL 合并为单次批量:INSERT → 过期清理 → 上限裁剪
  assert.equal(db.calls.length, 1);
  const stmts = db.calls[0].statements;
  assert.equal(stmts.length, 3);
  assert.ok(stmts[0].sql.includes('INSERT INTO auth_sessions'));
  assert.ok(stmts[1].sql.includes('DELETE FROM auth_sessions WHERE expires_at IS NOT NULL'));
  assert.ok(stmts[2].sql.includes('ORDER BY created_at DESC LIMIT'));
});

test('登录失败:401 且不执行任何会话 SQL', async () => {
  const db = fakeDb();
  const res = fakeRes();
  await makeLogin(db)(fakeReq({ body: { password: 'wrong', expiry: '24h' }, ip: '198.51.100.8' }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'bad_password');
  assert.equal(db.calls.length, 0);
});

test('同一 IP 连续失败 8 次后返回 429 限流', async () => {
  const db = fakeDb();
  const handler = makeLogin(db);
  for (let i = 0; i < 8; i++) {
    const res = fakeRes();
    await handler(fakeReq({ body: { password: 'wrong', expiry: '24h' }, ip: '198.51.100.9' }), res);
    assert.equal(res.statusCode, 401, `第 ${i + 1} 次应为 401`);
  }
  const blocked = fakeRes();
  await handler(fakeReq({ body: { password: 'correct-password', expiry: '24h' }, ip: '198.51.100.9' }), blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error, 'too_many_attempts');
});

test('非法 expiry 选项返回 400', async () => {
  const res = fakeRes();
  await makeLogin(fakeDb())(fakeReq({ body: { password: 'correct-password', expiry: '999d' }, ip: '198.51.100.10' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'bad_expiry');
});
