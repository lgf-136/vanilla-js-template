/* ============================================================
 * chat-md.test.js — 流式 Markdown 安全渲染测试
 * 覆盖:XSS 转义、代码块/行内代码、链接/图片 URL 白名单
 *       (javascript: 丢弃)、列表/标题/引用/删除线/加粗。
 * 依赖 shared/escape.js 副作用(App.escape)。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../../../shared/escape.js';
import { mdToHtml, textToHtml } from './chat-md.js';

test('mdToHtml: XSS 一律转义,不产生未受控标签', () => {
  const html = mdToHtml('<script>alert(1)</script>');
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('mdToHtml: 段落与换行', () => {
  const html = mdToHtml('a\nb');
  assert.equal(html, '<p>a<br />b</p>');
});

test('mdToHtml: 加粗/斜体/删除线/行内代码', () => {
  const html = mdToHtml('**bold** *em* ~~del~~ `code`');
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<em>em</em>'));
  assert.ok(html.includes('<del>del</del>'));
  assert.ok(html.includes('<code>code</code>'));
});

test('mdToHtml: 未闭合的加粗/行内代码原样输出(不吞字)', () => {
  const html = mdToHtml('半截 **bold');
  assert.ok(html.includes('**bold'));
});

test('mdToHtml: 代码块带语言标签与复制按钮', () => {
  const html = mdToHtml('```js\nconst a = 1;\n```');
  assert.ok(html.includes('ch-code'));
  assert.ok(html.includes('lang-js'));
  assert.ok(html.includes('copy-code'));
  assert.ok(html.includes('<pre>'));
});

test('mdToHtml: 链接 URL 白名单,javascript: 丢弃', () => {
  const ok = mdToHtml('[safe](https://example.com/a)');
  assert.ok(ok.includes('<a href="https://example.com/a"'));
  const js = mdToHtml('[bad](javascript:alert(1))');
  assert.ok(!js.includes('<a href="javascript:'));
});

test('mdToHtml: 图片渲染,危险协议回退为文字', () => {
  const img = mdToHtml('![alt](https://x.com/a.png)');
  assert.ok(img.includes('<img src="https://x.com/a.png" alt="alt"'));
  const bad = mdToHtml('![alt](data:text/html,x)');
  assert.ok(!bad.includes('<img'));
});

test('mdToHtml: 列表 / 标题 / 引用 / 分割线', () => {
  assert.equal(mdToHtml('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(mdToHtml('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(mdToHtml('## 标题'), '<h2>标题</h2>');
  assert.equal(mdToHtml('> 引用'), '<blockquote><p>引用</p></blockquote>');
  assert.equal(mdToHtml('---'), '<hr />');
});

test('textToHtml: 纯文本换行 → <br />,内容转义', () => {
  assert.equal(textToHtml('a<b>\nc'), '<p>a&lt;b&gt;<br />c</p>');
});
