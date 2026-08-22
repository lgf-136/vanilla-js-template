/* ============================================================
 * chat-util.test.js — 工具域测试
 * 覆盖:maxTokens 组合框换算(k/M/小数)、文本/图片文件判定、
 *       大小格式化。依赖 shared/escape.js 副作用(App.escape)。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../../../shared/escape.js';
import { esc } from './chat-util.js';
import { parseMaxTokens, formatMaxTokens, isTextFile, isImageFile, fmtSize } from './chat-util.js';

test('parseMaxTokens: 无单位', () => {
  assert.equal(parseMaxTokens('8192'), 8192);
  assert.equal(parseMaxTokens(4096), 4096);
});

test('parseMaxTokens: k / M 后缀与小数自动换算', () => {
  assert.equal(parseMaxTokens('8k'), 8192);
  assert.equal(parseMaxTokens('1.5k'), 1536);
  assert.equal(parseMaxTokens('0.5M'), 524288);
  assert.equal(parseMaxTokens('2K'), 2048); // 大小写不敏感
  assert.equal(parseMaxTokens(' 16k '), 16384); // 容忍空白
});

test('parseMaxTokens: 非法输入返回 0', () => {
  assert.equal(parseMaxTokens(''), 0);
  assert.equal(parseMaxTokens(null), 0);
  assert.equal(parseMaxTokens('abc'), 0);
  assert.equal(parseMaxTokens('1.5kk'), 0);
});

test('formatMaxTokens: 8192 → 8k,1536 → 1.5k,524288 → 512k,1M/2M', () => {
  assert.equal(formatMaxTokens(8192), '8k');
  assert.equal(formatMaxTokens(1536), '1.5k');
  assert.equal(formatMaxTokens(524288), '512k');
  assert.equal(formatMaxTokens(1048576), '1M');
  assert.equal(formatMaxTokens(2097152), '2M');
  assert.equal(formatMaxTokens(1024), '1k');
  assert.equal(formatMaxTokens(512), '512');
});

test('formatMaxTokens 与 parseMaxTokens 往返一致', () => {
  [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 393216, 524288, 1048576].forEach((n) => {
    assert.equal(parseMaxTokens(formatMaxTokens(n)), n);
  });
});

test('isTextFile / isImageFile: 扩展名判定', () => {
  assert.equal(isTextFile('note.md'), true);
  assert.equal(isTextFile('a.py'), true);
  assert.equal(isTextFile('archive.zip'), false);
  assert.equal(isTextFile('noext'), false);
  assert.equal(isImageFile('photo.PNG'), true);
  assert.equal(isImageFile('a.jpeg'), true);
  assert.equal(isImageFile('a.txt'), false);
});

test('fmtSize: B / KB / MB', () => {
  assert.equal(fmtSize(512), '512 B');
  assert.equal(fmtSize(2048), '2.0 KB');
  assert.equal(fmtSize(3 * 1024 * 1024), '3.0 MB');
});

test('esc 转发 shared/escape.js(App.escape)', () => {
  assert.equal(esc('<b>&'), '&lt;b&gt;&amp;');
});
