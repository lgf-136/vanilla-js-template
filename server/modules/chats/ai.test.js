'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const AI = require('./ai');

test('toTokens: 无单位/k/M 与小数自动换算', () => {
  assert.equal(AI.toTokens(1024), 1024);
  assert.equal(AI.toTokens('2048'), 2048);
  assert.equal(AI.toTokens('2k'), 2048);
  assert.equal(AI.toTokens('0.5k'), 512);
  assert.equal(AI.toTokens('1.5k'), 1536);
  assert.equal(AI.toTokens('1m'), 1024 * 1024);
  assert.equal(AI.toTokens('1M'), 1024 * 1024);
  assert.equal(AI.toTokens(''), 0);
  assert.equal(AI.toTokens('abc'), 0);
});

test('catalog: 内置供应商 base_url 免填且含校验常用供应商', () => {
  for (const key of ['openai', 'anthropic', 'gemini', 'deepseek', 'grok', 'groq', 'kimi', 'glm', 'qwen', 'siliconflow', 'openrouter', 'huggingface', 'cerebras', 'ollama', 'opencode']) {
    const c = AI.catalog(key);
    assert.ok(c, key + ' 应在目录中');
    assert.ok(/^https?:\/\//.test(c.baseUrl), key + ' 应有默认 baseUrl');
    assert.ok(['openai', 'anthropic', 'gemini'].indexOf(c.type) !== -1);
  }
});

test('describeProvider: 合并目录信息且暴露 hasApiKey(不含明文)', () => {
  const row = {
    id: 'pv-1',
    key: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    base_url: '',
    api_key: 'enc:v1:xxx',
    enabled: 1,
    models: '["deepseek-v4-flash"]',
    sort: 0,
  };
  const p = AI.describeProvider(row);
  assert.equal(p.key, 'deepseek');
  assert.equal(p.builtin, true);
  assert.equal(p.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(p.hasApiKey, true);
  assert.equal(p.apiKey, undefined);
  assert.deepEqual(p.models, ['deepseek-v4-flash']);
});

test('normalizeHistory: 解析 thinking/toolCalls/parts', () => {
  const rows = [
    { id: 1, role: 'user', content: 'hi', parts: JSON.stringify([{ type: 'text', text: 'hi' }]), thinking: null, tool_calls: '[]' },
    { id: 2, role: 'assistant', content: 'ok', parts: '[]', thinking: JSON.stringify({ content: 'think' }), tool_calls: JSON.stringify([{ id: 'c1', name: 'tool', arguments: '{}' }]) },
  ];
  const norm = AI.normalizeHistory(rows);
  assert.equal(norm[0].role, 'user');
  assert.equal(norm[1].thinking, 'think');
  assert.equal(norm[1].toolCalls.length, 1);
});

test('readSse: 空行切帧、TCP 分包、\\r\\n 行尾与注释行(回归:帧缓冲到流结束导致无事件)', async () => {
  const frames = [
    'event: reasoning\ndata: {"delta":"想"}\n\n',
    'data: {"delta":"A"}\ndata: {"delta":"B"}\n\n',
    ': keep-alive\n\n',
    'event: text\r\ndata: {"delta":"win"}\r\n\r\n',
  ];
  // 模拟 TCP 分包:逐字节推送
  const chunks = [];
  for (const f of frames) {
    for (const ch of f) chunks.push(new TextEncoder().encode(ch));
  }
  const body = new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
  const res = new Response(body);
  const out = [];
  for await (const ev of AI.readSse(res)) out.push(ev);
  assert.equal(out.length, 3);
  assert.equal(out[0].event, 'reasoning');
  assert.deepEqual(JSON.parse(out[0].data), { delta: '想' });
  assert.equal(out[1].data, '{"delta":"A"}\n{"delta":"B"}');
  assert.equal(out[2].event, 'text');
  assert.deepEqual(JSON.parse(out[2].data), { delta: 'win' });
});

