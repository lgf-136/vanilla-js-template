'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { clientIp } = require('./client-ip');

function nodeReq(remoteAddress, headers) {
  return { socket: { remoteAddress }, headers };
}

function workerReq(headers) {
  return { headers: new Headers(headers || {}) };
}

test('Node 直连:优先真实 socket.remoteAddress,忽略伪造的 x-forwarded-for', () => {
  const req = nodeReq('203.0.113.7', { 'x-forwarded-for': '1.2.3.4' });
  assert.strictEqual(clientIp(req, 'unknown'), '203.0.113.7');
});

test('Node 直连:xff 多值伪造串也不影响 socket 优先级', () => {
  const req = nodeReq('198.51.100.9', { 'x-forwarded-for': '6.6.6.6, 7.7.7.7' });
  assert.strictEqual(clientIp(req, 'unknown'), '198.51.100.9');
});

test('serverless:无 socket 时取 cf-connecting-ip(Cloudflare)', () => {
  const req = workerReq({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '1.2.3.4, 203.0.113.5' });
  assert.strictEqual(clientIp(req, 'unknown'), '203.0.113.5');
});

test('serverless:无 cf 头时取 x-forwarded-for 末位(平台追加的真实 IP),而非客户端可控首值', () => {
  // 攻击者伪造首值,平台追加真实 IP 在末位
  const req = workerReq({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 203.0.113.42' });
  assert.strictEqual(clientIp(req, 'unknown'), '203.0.113.42');
});

test('serverless:单值 x-forwarded-for 直接作为来源', () => {
  const req = workerReq({ 'x-forwarded-for': '203.0.113.42' });
  assert.strictEqual(clientIp(req, 'unknown'), '203.0.113.42');
});

test('serverless:伪造 xff 首值与 socket 占位值共存时取末位', () => {
  // makeNodeRequest 不再用 xff 填充 socket.remoteAddress;此处模拟旧形态的 'request' 占位
  const req = nodeReq('request', { 'x-forwarded-for': '6.6.6.6, 198.51.100.8' });
  assert.strictEqual(clientIp(req, 'unknown'), '198.51.100.8');
});

test('无任何可信来源时返回 fallback', () => {
  assert.strictEqual(clientIp({ headers: {} }, 'unknown'), 'unknown');
  assert.strictEqual(clientIp(null, 'unknown'), 'unknown');
  assert.strictEqual(clientIp({ headers: {} }), '');
});
