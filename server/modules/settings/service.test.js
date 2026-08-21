/* ============================================================
 * service.test.js — 设置 KV 业务逻辑单元测试
 * ------------------------------------------------------------
 * 覆盖：工作空间解析回退、写入时敏感键加密/普通键明文、读取解密与
 * 保留键跳过、保留键读写删拒绝、删除的精确作用域。
 * db 以内存桩实现，只模拟本服务用到的 get/query/run 行为。
 * ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSettingsService } = require('./service');

const ENC_PREFIX = 'enc:test:';
const enc = (v) => ENC_PREFIX + Buffer.from(String(v), 'utf8').toString('base64');
const dec = (v) =>
  typeof v === 'string' && v.indexOf(ENC_PREFIX) === 0
    ? Buffer.from(v.slice(ENC_PREFIX.length), 'base64').toString('utf8')
    : null;

/** 内存 app_settings 桩：键为 "ws\u0000key" */
function makeDb() {
  const rows = new Map();
  const k = (ws, key) => ws + '\u0000' + key;
  return {
    rows,
    async get(sql, params) {
      if (sql.indexOf('settings:activeWorkspace') !== -1) {
        const r = rows.get(k(params[0], 'settings:activeWorkspace'));
        return r ? { value: r.value } : null;
      }
      return null;
    },
    async query(sql, params) {
      if (sql.indexOf('workspace_id IN') !== -1) {
        const out = [];
        for (const [key, r] of rows) {
          const ws = key.split('\u0000')[0];
          if (ws === params[0] || ws === params[1]) {
            out.push({ workspace_id: ws, key: key.split('\u0000')[1], value: r.value });
          }
        }
        return out.sort((a, b) => (a.key < b.key ? -1 : 1));
      }
      return [];
    },
    async run(sql, params) {
      if (sql.indexOf('INSERT INTO app_settings') !== -1) {
        rows.set(k(params[0], params[1]), { value: params[2] });
        return { changes: 1 };
      }
      if (sql.indexOf('DELETE FROM app_settings') !== -1) {
        rows.delete(k(params[0], params[1]));
        return { changes: 1 };
      }
      return { changes: 0 };
    },
  };
}

function makeService(db) {
  return createSettingsService({ db, encrypt: enc, decrypt: dec });
}

test('resolveActiveWorkspace: 无指针时回退 global', async () => {
  const svc = makeService(makeDb());
  assert.equal(await svc.resolveActiveWorkspace(''), 'global');
  assert.equal(await svc.resolveActiveWorkspace('ws-x'), 'ws-x');
});

test('putSettings: 普通键明文落库，敏感键以密文落库', async () => {
  const db = makeDb();
  const svc = makeService(db);
  const { written } = await svc.putSettings({ 'settings:display': 'dark', 'settings:profile': '{"email":"a@b.c"}' }, '');
  assert.equal(written, 2);
  let sawCipher = false;
  let sawPlain = false;
  for (const [key, r] of db.rows) {
    if (key.endsWith('settings:profile')) {
      assert.ok(r.value.startsWith(ENC_PREFIX), '敏感键必须密文落库');
      sawCipher = true;
    }
    if (key.endsWith('settings:display')) {
      assert.equal(r.value, 'dark');
      sawPlain = true;
    }
  }
  assert.ok(sawCipher && sawPlain);
});

test('getSettings: 敏感键解密返回，保留键跳过', async () => {
  const db = makeDb();
  const svc = makeService(db);
  await svc.putSettings({ 'settings:profile': 'secret@mail', 'settings:display': 'light' }, '');
  // 直塞一个保留键模拟历史数据
  db.rows.set('global\u0000settings:auth:x', { value: 'hashed' });
  const out = await svc.getSettings('');
  assert.equal(out['settings:profile'], 'secret@mail');
  assert.equal(out['settings:display'], 'light');
  assert.equal(out['settings:auth:x'], undefined);
});

test("putSettings/deleteSettings: 保留键 settings:auth:* 一律 403 拒绝", async () => {
  const svc = makeService(makeDb());
  await assert.rejects(
    () => svc.putSettings({ 'settings:auth:password_hash': 'x' }, ''),
    (e) => e.status === 403 && e.code === 'reserved_key'
  );
  await assert.rejects(
    () => svc.deleteSettings(['settings:auth:password_hash'], ''),
    (e) => e.status === 403 && e.code === 'reserved_key'
  );
});

test('deleteSettings: 按归属工作空间精确删除并计数', async () => {
  const db = makeDb();
  const svc = makeService(db);
  await svc.putSettings({ 'settings:display': 'dark', 'settings:notifications': '{}' }, 'ws-a');
  const { removed } = await svc.deleteSettings(['settings:display'], 'ws-a');
  assert.equal(removed, 1);
  const out = await svc.getSettings('ws-a');
  assert.equal(out['settings:display'], undefined);
  assert.equal(out['settings:notifications'], '{}');
});
