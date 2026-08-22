/* ============================================================
 * service.test.js — API Hub service 纯逻辑单元测试
 * ------------------------------------------------------------
 * 覆盖:policyFor 策略计算(管理接口/内置覆盖/自定义路由/分组级联)、
 * authorize 四种鉴权模式、normalizeConfig 清洗、saveAll 冲突校验
 * 与 saveAll → loadAll 往返(密钥经 encrypt 落库)。
 * db 以内存桩实现,只模拟本服务用到的 get/run 行为。
 * ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHub } = require('./service');

/** 内存 db 桩:apihub_config 单表;app_settings 一律查空(走默认工作空间) */
function makeDb() {
  const rows = new Map();
  return {
    rows,
    async get(sql, params) {
      if (sql.indexOf('apihub_config') !== -1) {
        return rows.get(params[0]) || null;
      }
      return null;
    },
    async query() {
      return [];
    },
    async run(sql, params) {
      if (sql.indexOf('INSERT INTO apihub_config') !== -1) {
        rows.set(params[0], { config: params[1], secrets: params[2] });
      }
      return { changes: 1 };
    },
    async batch(statements) {
      for (const s of statements) await this.run(s.sql, s.params);
      return { changes: statements.length };
    },
  };
}

function makeDeps(db) {
  return {
    db,
    encrypt: (v) => 'enc:test:' + Buffer.from(String(v), 'utf8').toString('base64'),
    decrypt: (v) =>
      typeof v === 'string' && v.indexOf('enc:test:') === 0
        ? Buffer.from(v.slice('enc:test:'.length), 'base64').toString('utf8')
        : null,
    verifyPassword: (pwd) => pwd === 'letmein',
    staticRouteKeys: ['GET /api/settings'],
  };
}

function makeReq(headers) {
  return { headers: headers || {} };
}

test('defaultConfig: 默认鉴权为 session 且自定义路由为空数组', () => {
  const hub = createHub(makeDeps(makeDb()));
  const cfg = hub.defaultConfig();
  assert.equal(cfg.defaults.auth, 'session');
  assert.deepEqual(cfg.customRoutes, []);
});

test('normalizeConfig: 过滤非法分组并清洗合法字段', () => {
  const hub = createHub(makeDeps(makeDb()));
  const cfg = hub.normalizeConfig({
    groups: [
      { id: 'g1', name: '  生产环境  ', public: false },
      { id: '', name: '缺 id 应被丢弃' },
      { id: 'g2', name: '   ' },
    ],
  });
  assert.equal(cfg.groups.length, 1);
  assert.equal(cfg.groups[0].id, 'g1');
  assert.equal(cfg.groups[0].name, '生产环境');
});

test('policyFor: /api/hub/* 管理接口强制会话鉴权,忽略任何公开覆盖', () => {
  const hub = createHub(makeDeps(makeDb()));
  const cfg = hub.normalizeConfig({ routes: { 'GET /api/hub/state': { public: true } } });
  const p = hub.policyFor('GET /api/hub/state', null, cfg);
  assert.deepEqual(p, { public: false, auth: 'session', isHubMgmt: true });
});

test('policyFor: 内置路由默认 session,路由级 public 覆盖后放行', () => {
  const hub = createHub(makeDeps(makeDb()));
  const base = hub.normalizeConfig({});
  assert.equal(hub.policyFor('GET /api/tools/ping', null, base).auth, 'session');

  const cfg = hub.normalizeConfig({ routes: { 'GET /api/tools/ping': { public: true } } });
  const p = hub.policyFor('GET /api/tools/ping', null, cfg);
  assert.equal(p.public, true);
  assert.equal(p.auth, 'none');
});

test('policyFor: 自定义路由支持显式 auth 与分组公开级联', () => {
  const hub = createHub(makeDeps(makeDb()));
  const priv = { id: 'c1', method: 'GET', path: '/x', auth: 'bearer', public: false, groupIds: [] };
  const p1 = hub.policyFor('cr:c1', priv, hub.normalizeConfig({}));
  assert.equal(p1.auth, 'bearer');
  assert.equal(p1.public, false);

  const cfg = hub.normalizeConfig({ groups: [{ id: 'g1', name: 'G1', public: true }] });
  const shared = { id: 'c2', method: 'GET', path: '/y', auth: 'session', public: false, groupIds: ['g1'] };
  const p2 = hub.policyFor('cr:c2', shared, cfg);
  assert.equal(p2.public, true);
  assert.equal(p2.auth, 'none');
});

test('authorize: none 直接放行;session 缺令牌返回 401', async () => {
  const hub = createHub(makeDeps(makeDb()));
  const state = { config: hub.defaultConfig(), secrets: {} };
  assert.equal((await hub.authorize(makeReq(), 'GET /x', { auth: 'none' }, state)).ok, true);

  const denied = await hub.authorize(makeReq(), 'GET /x', { auth: 'session' }, state);
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 401);
});

test('authorize: global-password 三分支(缺头/错码/正确)', async () => {
  const hub = createHub(makeDeps(makeDb()));
  const state = { config: hub.defaultConfig(), secrets: {} };
  const opts = { auth: 'global-password' };

  assert.equal((await hub.authorize(makeReq(), 'k', opts, state)).status, 401);
  assert.equal((await hub.authorize(makeReq({ 'x-auth-password': 'nope' }), 'k', opts, state)).status, 401);
  assert.equal((await hub.authorize(makeReq({ 'x-auth-password': 'letmein' }), 'k', opts, state)).ok, true);
});

test('authorize: api-key 校验与自定义路由密钥优先级', async () => {
  const hub = createHub(makeDeps(makeDb()));
  const state = { config: hub.defaultConfig(), secrets: { apiKeys: { 'GET /api/x': 'k1', 'cr:c9': 'k2' } } };

  assert.equal((await hub.authorize(makeReq(), 'GET /api/x', { auth: 'api-key' }, state)).status, 401);
  assert.equal(
    (await hub.authorize(makeReq({ 'x-api-key': 'bad' }), 'GET /api/x', { auth: 'api-key' }, state)).status,
    401
  );
  assert.equal(
    (await hub.authorize(makeReq({ 'x-api-key': 'k1' }), 'GET /api/x', { auth: 'api-key' }, state)).ok,
    true
  );
  // 自定义路由优先取 cr:<id> 密钥而非同路径内置键
  assert.equal(
    (await hub.authorize(makeReq({ 'x-api-key': 'k2' }), 'GET /api/x', { auth: 'api-key', customId: 'c9' }, state)).ok,
    true
  );
  assert.equal(
    (await hub.authorize(makeReq({ 'x-api-key': 'k1' }), 'GET /api/x', { auth: 'api-key', customId: 'c9' }, state))
      .status,
    401
  );
});

test('saveAll: 非对象负载与内置路由冲突必须抛错', async () => {
  const hub = createHub(makeDeps(makeDb()));
  await assert.rejects(() => hub.saveAll(null));
  await assert.rejects(() =>
    hub.saveAll({
      config: { customRoutes: [{ id: 'c1', method: 'GET', path: '/api/settings' }] },
      secrets: {},
    })
  );
});

test('saveAll → loadAll 往返:配置规范化保留,密文经 encrypt 落库、decrypt 还原', async () => {
  const db = makeDb();
  const hub = createHub(makeDeps(db));
  await hub.saveAll({
    config: { routes: { 'GET /api/tools/ping': { name: 'ping', public: true } } },
    secrets: { apiKeys: { 'GET /api/x': 'secret-key' } },
  });

  // 落库的 secrets 必须是密文(桩加密器前缀)
  const stored = [...db.rows.values()][0];
  assert.ok(stored.secrets.startsWith('enc:test:'));

  const state = await hub.loadAll();
  assert.equal(state.config.routes['GET /api/tools/ping'].name, 'ping');
  assert.equal(state.config.routes['GET /api/tools/ping'].public, true);
  assert.equal(state.secrets.apiKeys['GET /api/x'], 'secret-key');
});

test('loadAll: 短 TTL 缓存命中;saveAll 后立即失效取新值', async () => {
  const db = makeDb();
  const hub = createHub(makeDeps(db));
  await hub.saveAll({ config: { routes: {} }, secrets: { apiKeys: { k: 'v1' } } });

  // 首次读取进入缓存
  const first = await hub.loadAll();
  assert.equal(first.secrets.apiKeys.k, 'v1');

  // 缓存期内直接改 db(模拟外部写入),loadAll 应命中缓存不感知
  const [stored] = [...db.rows.values()];
  db.rows.set('ws-default', { config: stored.config, secrets: stored.secrets });
  const cached = await hub.loadAll();
  assert.equal(cached.secrets.apiKeys.k, 'v1');

  // saveAll 后缓存失效,必须读到新值
  await hub.saveAll({ config: { routes: {} }, secrets: { apiKeys: { k: 'v2' } } });
  const after = await hub.loadAll();
  assert.equal(after.secrets.apiKeys.k, 'v2');
});
