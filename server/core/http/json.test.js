'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { readBody } = require('./json');

/** 简易 Node req 模拟:支持 on('data'|'end'|'error') 与 destroy */
function fakeReq({ contentLength, chunks }) {
  const listeners = {};
  let destroyCalled = false;
  const req = {
    headers: contentLength ? { 'content-length': String(contentLength) } : {},
    on(event, cb) {
      (listeners[event] = listeners[event] || []).push(cb);
      return req;
    },
    destroy() {
      destroyCalled = true;
    },
    get destroyCalled() {
      return destroyCalled;
    },
  };
  // 异步派发 data / end,模拟真实流
  setImmediate(() => {
    chunks.forEach((c) => (listeners.data || []).forEach((cb) => cb(c)));
    (listeners.end || []).forEach((cb) => cb());
  });
  return req;
}

test('readBody:正常 JSON 解析', async () => {
  const req = fakeReq({ chunks: ['{"a":1}'] });
  const body = await readBody(req);
  assert.deepStrictEqual(body, { a: 1 });
});

test('readBody:空 body 解析为 {}', async () => {
  const req = fakeReq({ chunks: [] });
  const body = await readBody(req);
  assert.deepStrictEqual(body, {});
});

test('readBody:content-length 超限立即拒绝且不消费请求体', async () => {
  const req = fakeReq({ contentLength: 2e6, chunks: ['x'.repeat(2e6)] });
  await assert.rejects(readBody(req), /body too large/);
  assert.equal(req.destroyCalled, true);
});

test('readBody:累积超限后停止消费并拒绝', async () => {
  const req = fakeReq({ chunks: ['a'.repeat(600000), 'b'.repeat(600000), 'c'.repeat(100000)] });
  await assert.rejects(readBody(req), /body too large/);
  assert.equal(req.destroyCalled, true);
});

test('readBody:非法 JSON 拒绝', async () => {
  const req = fakeReq({ chunks: ['not json'] });
  await assert.rejects(readBody(req), SyntaxError);
});
