'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const ORIG_FETCH = globalThis.fetch;

/** 临时替换全局 fetch,用后还原 */
function withFetch(stub, fn) {
  globalThis.fetch = stub;
  return fn()
    .catch((e) => e)
    .finally(() => {
      globalThis.fetch = ORIG_FETCH;
    });
}

test('turso:连接失败错误不包含端点 URL 与底层错误对象', async () => {
  const { init } = require('./turso.adapter');
  const db = init({ env: { DATABASE_URL: 'https://secret-db-org.turso.io' } });
  const err = await withFetch(
    () => Promise.reject(new TypeError('fetch failed, url https://secret-db-org.turso.io/v2/pipeline')),
    () => db.query('SELECT 1')
  );
  assert.ok(err instanceof Error);
  assert.match(err.message, /无法连接/);
  assert.doesNotMatch(err.message, /secret-db-org|fetch failed|pipeline/);
});

test('turso:HTTP 错误不包含远端响应体', async () => {
  const { init } = require('./turso.adapter');
  const db = init({ env: { DATABASE_URL: 'https://db.example.turso.io' } });
  const stub = () =>
    Promise.resolve({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized: SELECT * FROM auth_sessions -- 敏感语句'),
    });
  const err = await withFetch(stub, () => db.query('SELECT 1'));
  assert.ok(err instanceof Error);
  assert.match(err.message, /HTTP 401/);
  assert.doesNotMatch(err.message, /auth_sessions|敏感语句|unauthorized/);
});

test('turso:响应格式异常不包含响应体内容', async () => {
  const { init } = require('./turso.adapter');
  const db = init({ env: { DATABASE_URL: 'https://db.example.turso.io' } });
  const stub = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ weird: { secret: 'enc:v1:...' } }),
    });
  const err = await withFetch(stub, () => db.query('SELECT 1'));
  assert.ok(err instanceof Error);
  assert.match(err.message, /响应格式异常/);
  assert.doesNotMatch(err.message, /secret|enc:v1/);
});
