import { test } from 'node:test';
import assert from 'node:assert/strict';

/** 副作用导入：escape.js 无 export，加载后经 globalThis.App.escape 暴露 */
import './escape.js';

const { escHtml, escAttr } = globalThis.App.escape;

test('escHtml: 转义 & < > " \' 五类字符', () => {
  assert.equal(
    escHtml('<a href="x" data-y=\'z\'>&'),
    '&lt;a href=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;'
  );
});

test('escHtml: null/undefined 归一为空串', () => {
  assert.equal(escHtml(null), '');
  assert.equal(escHtml(undefined), '');
  assert.equal(escHtml(''), '');
});

test('escHtml: 数字与对象按 String() 处理', () => {
  assert.equal(escHtml(123), '123');
  assert.equal(escHtml({ toString: () => '<b>' }), '&lt;b&gt;');
});

test('escAttr: 与 escHtml 同实现（属性值务必写在引号内）', () => {
  assert.equal(escAttr('" onmouseover="x'), '&quot; onmouseover=&quot;x');
  assert.equal(escAttr("'"), '&#39;');
});

test('重复转义幂等性：&amp; 再次转义为 &amp;amp;（防双重编码误用提示）', () => {
  assert.equal(escHtml('&amp;'), '&amp;amp;');
});
