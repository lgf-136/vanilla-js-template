/* ============================================================
 * index.test.js — 敏感数据加解密封装单元测试
 * ------------------------------------------------------------
 * 覆盖:AES-256-GCM 往返(ASCII/中文/JSON)、信封格式 enc:v1:、
 * 篡改/错误密钥/非法格式安全失败(返回 null 不抛出)。
 * 测试通过 ENCRYPTION_KEY 注入独立密钥,绝不读写 server/core/.secret-key。
 * ============================================================ */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const { encrypt, decrypt } = require('./index');
const { PREFIX, encryptWithKey, decryptWithKey } = require('./core');
const { isSensitiveKey, RESERVED_SETTINGS_PREFIX, SENSITIVE_WORDS } = require('./sensitive');

test('encrypt → decrypt 往返还原明文(ASCII / 中文 / JSON)', () => {
  for (const plain of ['hello', '用户@example.com', '{"apiKey":"sk-123","token":"abc"}']) {
    const stored = encrypt(plain);
    assert.ok(stored.startsWith(PREFIX));
    assert.equal(decrypt(stored), plain);
  }
});

test('信封格式:enc:v1:<iv>:<tag>:<ct> 共 5 段且随机 iv 导致密文不可预测', () => {
  const a = encrypt('same');
  const b = encrypt('same');
  assert.notEqual(a, b); // 随机 IV
  assert.equal(a.split(':').length, 5); // enc / v1 / iv / tag / ct
});

test('篡改密文返回 null(认证失败不抛出)', () => {
  const stored = encrypt('sensitive');
  const tampered = stored.slice(0, -2) + (stored.endsWith('AA') ? 'BB' : 'AA');
  assert.equal(decrypt(tampered), null);
});

test('错误密钥解密返回 null', () => {
  const stored = encryptWithKey(crypto.randomBytes(32), 'sensitive');
  assert.equal(decryptWithKey(crypto.randomBytes(32), stored), null);
});

test('非信封格式与残缺格式返回 null', () => {
  assert.equal(decrypt('plaintext'), null);
  assert.equal(decrypt(PREFIX + 'only-one-part'), null);
  assert.equal(decrypt(null), null);
});

test('isSensitiveKey: 关键词命中与保留前缀', () => {
  assert.equal(isSensitiveKey('settings:profile'), true);
  assert.equal(isSensitiveKey('settings:hub:secrets'), true);
  assert.equal(isSensitiveKey('user:email'), true);
  assert.equal(isSensitiveKey('accounts:llm:openai:api_key'), true);
  assert.equal(isSensitiveKey('accounts:webdav:password'), true);
  assert.equal(isSensitiveKey('gh:access_token'), true);
  assert.equal(isSensitiveKey('settings:display'), false);
  assert.equal(isSensitiveKey('apihub:history'), false);
  assert.equal(RESERVED_SETTINGS_PREFIX, 'settings:auth:');
  assert.ok(SENSITIVE_WORDS.includes('token'));
});
