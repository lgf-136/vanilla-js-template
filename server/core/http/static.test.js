'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { acceptsGzip, shouldGzip, etag, cacheControl } = require('./static');

test('acceptsGzip:识别 gzip 标识(含 q 权重)', () => {
  assert.equal(acceptsGzip('gzip, deflate, br'), true);
  assert.equal(acceptsGzip('gzip'), true);
  assert.equal(acceptsGzip('br'), false);
  assert.equal(acceptsGzip(undefined), false);
  assert.equal(acceptsGzip(''), false);
});

test('shouldGzip:可压缩 MIME + 体积达标 + 客户端接受 三条件缺一不可', () => {
  // CSS/JS/JSON 且 ≥512B → 压缩
  assert.equal(shouldGzip('text/css', 100000, 'gzip'), true);
  assert.equal(shouldGzip('application/javascript', 2048, 'gzip'), true);
  assert.equal(shouldGzip('application/json', 2048, 'gzip'), true);
  assert.equal(shouldGzip('image/svg+xml', 2048, 'gzip'), true);
  // 字体 / 图片本身已压缩,不重复压缩
  assert.equal(shouldGzip('font/woff2', 50000, 'gzip'), false);
  assert.equal(shouldGzip('image/png', 50000, 'gzip'), false);
  // 体积过小不压缩(CPU 开销 > 收益)
  assert.equal(shouldGzip('text/css', 100, 'gzip'), false);
  // 客户端不接受 → 不压缩
  assert.equal(shouldGzip('text/css', 100000, 'br'), false);
  assert.equal(shouldGzip('text/css', 100000, undefined), false);
});

test('gzip 往返:压缩后可解压还原(gzipSync 一致性)', () => {
  const data = Buffer.from('body { color: red; } '.repeat(2000));
  const gz = zlib.gzipSync(data);
  assert.ok(gz.length < data.length, '压缩后应显著变小');
  assert.deepStrictEqual(zlib.gunzipSync(gz), data);
});

test('etag:弱 ETag 基于 size + mtime,目录/文件变化即变化', () => {
  const a = etag({ size: 1000, mtimeMs: 1700000000000 });
  const b = etag({ size: 1001, mtimeMs: 1700000000000 });
  const c = etag({ size: 1000, mtimeMs: 1700000000001 });
  assert.match(a, /^W\//);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test('cacheControl:入口 no-store,静态资源条件缓存', () => {
  assert.equal(cacheControl('/'), 'no-store');
  assert.equal(cacheControl('/index.html'), 'no-store');
  assert.equal(cacheControl('/app/styles/tokens.css'), 'public, no-cache');
});
