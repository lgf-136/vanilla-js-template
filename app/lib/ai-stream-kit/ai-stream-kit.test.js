/* ============================================================
 * ai-stream-kit.test.js — 本地 vendor 的 ai-stream-kit 能力测试
 * 覆盖(任务「单元测试」要求):
 *   - SSEParser:TCP 分包、三种行尾(\r\n / \r / \n)、BOM、
 *     注释行、事件 id 断点(lastEventId)、[DONE] 事件
 *   - 重试策略:指数退避(1s→2s→4s)、抖动边界、maxRetries 上限、
 *     Abort 不重试(waitForRetry 拒绝)
 *   - autoClose:粗体/斜体/删除线/行内代码/代码块/链接/图片
 *     自动闭合,嵌套与转义
 *   - SSEClientError:5xx 可重试 / 4xx 不可重试
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SSEParser,
  autoClose,
  calculateDelay,
  shouldRetry,
  waitForRetry,
  resolveRetryOptions,
  SSEClientError,
  StreamMarkdownRenderer,
  createSSEClient,
} from './index.js';

/* ---------- SSE 解析 ---------- */
function collect(chunks, feedEnd = true) {
  const events = [];
  const parser = new SSEParser((e) => events.push(e));
  chunks.forEach((c) => parser.feed(c));
  if (feedEnd) parser.feedEnd();
  return { events, parser };
}

test('SSEParser: 完整事件解析(data + id + event)', () => {
  const { events } = collect(['id: 7\ndata: hello\n\n']);
  assert.equal(events.length, 1);
  assert.equal(events[0].data, 'hello');
  assert.equal(events[0].id, '7');
});

test('SSEParser: 多行 data 拼接 + 注释行忽略 + retry 字段', () => {
  const { events } = collect([': keep-alive comment\n', 'data: a\n', 'data: b\n', 'retry: 3000\n', '\n']);
  assert.equal(events.length, 1);
  assert.equal(events[0].data, 'a\nb');
  assert.equal(events[0].retry, 3000);
});

test('SSEParser: 三种行尾 \\r\\n / \\r / \\n 等价分隔', () => {
  const { events } = collect(['data: one\r\ndata: two\rdata: three\n\n']);
  assert.equal(events.length, 1);
  assert.equal(events[0].data, 'one\ntwo\nthree');
});

test('SSEParser: TCP 分包 — 一个事件被切成任意小块仍完整解析', () => {
  const chunk = 'id: 1\nevent: delta\ndata: {"text":"hi"}\n\n';
  const pieces = [];
  for (let i = 0; i < chunk.length; i += 3) pieces.push(chunk.slice(i, i + 3));
  const { events } = collect(pieces);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { data: '{"text":"hi"}', id: '1', event: 'delta' });
});

test('SSEParser: BOM 前缀被剥离', () => {
  const { events } = collect(['\uFEFFdata: ok\n\n']);
  assert.equal(events[0].data, 'ok');
});

test('SSEParser: lastEventId 断点游标跟踪(Last-Event-ID 续传基础)', () => {
  const { parser, events } = collect([
    'id: 1\ndata: a\n\n',
    'id: 2\ndata: b\n\n',
    'id: 3\ndata: c\n',
  ]);
  assert.equal(events.length, 2);
  assert.equal(parser.lastEventId, '2'); // 未收到完整空行的事件不计
  parser.feed('\n');
  assert.equal(parser.lastEventId, '3');
  assert.equal(events[2].id, '3');
});

test('SSEParser: OpenAI [DONE] 约定作为普通事件透传', () => {
  const { events } = collect(['data: [DONE]\n\n']);
  assert.equal(events[0].data, '[DONE]');
});

test('SSEParser: 事件 id 去重来源(id 字段带 \\0 被忽略)', () => {
  const { events } = collect(['id: a\u0000b\ndata: x\n\n']);
  assert.equal(events[0].id, undefined);
});

/* ---------- 重试策略 ---------- */
test('calculateDelay: 指数退避 1s→2s→4s(抖动叠加但不超过 maxDelay)', () => {
  const opts = resolveRetryOptions({ baseDelay: 1000, jitter: true, maxDelay: 30000 });
  // 抖动范围 [0, baseDelay),关闭抖动时精确为 2^attempt * baseDelay
  const noJitter = resolveRetryOptions({ baseDelay: 1000, jitter: false });
  assert.equal(calculateDelay(0, noJitter), 1000);
  assert.equal(calculateDelay(1, noJitter), 2000);
  assert.equal(calculateDelay(2, noJitter), 4000);
  assert.equal(calculateDelay(3, noJitter), 8000);
  for (let i = 0; i < 50; i++) {
    const d = calculateDelay(2, opts);
    assert.ok(d >= 4000 && d < 5000, `attempt=2 抖动应在 [4s, 5s),实际 ${d}`);
  }
  // maxDelay 上限
  const capped = resolveRetryOptions({ baseDelay: 20000, jitter: false, maxDelay: 30000 });
  assert.equal(calculateDelay(1, capped), 30000);
});

test('shouldRetry: attempt < maxRetries(上限 5 次重试)', () => {
  const opts = resolveRetryOptions({ maxRetries: 5 });
  assert.equal(shouldRetry(0, opts), true);
  assert.equal(shouldRetry(4, opts), true);
  assert.equal(shouldRetry(5, opts), false);
});

test('waitForRetry: 已中止信号直接拒绝(Abort 不重试)', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(waitForRetry(0, resolveRetryOptions({}), ac.signal));
});

test('waitForRetry: 等待期间中止立即拒绝', async () => {
  const ac = new AbortController();
  const p = waitForRetry(1, resolveRetryOptions({ baseDelay: 1000, jitter: false }), ac.signal);
  ac.abort();
  await assert.rejects(p);
});

test('SSEClientError: retryable 显式控制;createSSEClient 对 5xx/429 重试、4xx 不重试', async () => {
  // 构造器默认 retryable=true,显式 false 生效
  assert.equal(new SSEClientError('x', { statusCode: 401, retryable: false }).retryable, false);
  assert.equal(new SSEClientError('x').retryable, true);

  const originalFetch = globalThis.fetch;
  try {
    // 500 → 可重试:maxRetries=1 时 fetch 两次(初次 + 1 次重试)后放弃
    let calls500 = 0;
    globalThis.fetch = async () => {
      calls500++;
      return new Response('boom', { status: 500 });
    };
    await new Promise((resolve) => {
      createSSEClient({ url: 'http://x/sse', retry: { maxRetries: 1, baseDelay: 1, jitter: false }, onClose: resolve });
    });
    assert.equal(calls500, 2);

    // 401 → 业务错误,不重试:只 fetch 一次
    let calls401 = 0;
    globalThis.fetch = async () => {
      calls401++;
      return new Response('no key', { status: 401 });
    };
    await new Promise((resolve) => {
      createSSEClient({ url: 'http://x/sse', retry: { maxRetries: 3, baseDelay: 1 }, onClose: resolve });
    });
    assert.equal(calls401, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* ---------- autoClose(流式半截 Markdown 自动闭合) ---------- */
test('autoClose: 粗体/斜体/删除线/行内代码未闭合时自动补全', () => {
  assert.equal(autoClose('**bold'), '**bold**');
  assert.equal(autoClose('*em'), '*em*');
  assert.equal(autoClose('~~del'), '~~del~~');
  assert.equal(autoClose('`code'), '`code`');
  assert.equal(autoClose('_u_'), '_u_');
});

test('autoClose: 嵌套标记按栈顺序逆序闭合', () => {
  assert.equal(autoClose('**bold *em'), '**bold *em***');
});

test('autoClose: 转义符后的标记不误判', () => {
  assert.equal(autoClose('\\*not em'), '\\*not em');
});

test('autoClose: 代码块未闭合时补围栏', () => {
  assert.equal(autoClose('```js\nconst a = 1'), '```js\nconst a = 1\n```');
  assert.equal(autoClose('~~~\ntext'), '~~~\ntext\n~~~');
});

test('autoClose: 已闭合代码块不受影响', () => {
  assert.equal(autoClose('```\nx\n```'), '```\nx\n```');
});

test('autoClose: 链接/图片自动闭合', () => {
  assert.equal(autoClose('[text](url'), '[text](url)');
  assert.equal(autoClose('[text'), '[text]()');
  assert.equal(autoClose('![alt](url'), '![alt](url)');
});

test('autoClose: 普通文本不动', () => {
  assert.equal(autoClose('hello world'), 'hello world');
});

/* ---------- StreamMarkdownRenderer(增量渲染) ---------- */
test('StreamMarkdownRenderer: append 增量渲染 + getRawMarkdown 原文', () => {
  const r = new StreamMarkdownRenderer();
  r.append('**bo');
  r.append('ld**');
  assert.equal(r.getRawMarkdown(), '**bold**');
  assert.equal(r.getPatchedMarkdown(), '**bold**');
});
