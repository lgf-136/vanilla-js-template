/* ============================================================
 * shared/escape.js — HTML 转义唯一实现（AGENTS.md 红线 13）
 * ------------------------------------------------------------
 * 浏览器：bootstrap.js 把本文件作为首个脚本注入，挂载 App.escape；
 * Node：根 package.json 为 ESM，本文件刻意不含 import/export，
 *       node --test 可直接 import（副作用：写入 globalThis.App）。
 * 规则：任何用户数据/外部数据拼入 HTML 模板前必须经本模块转义；
 *       HTML 属性值必须转义并加引号；禁止在 app/ 各处再定义
 *       私有 esc()/escHtml()/escAttr()（just lint 强制检查）。
 * ============================================================ */
(function (global) {
  'use strict';

  /** HTML 文本/属性统一转义（含单引号；属性值务必写在引号内） */
  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 属性位置转义别名：与 escHtml 同实现，按语义选用 */
  function escAttr(v) {
    return escHtml(v);
  }

  global.App = global.App || {};
  global.App.escape = { escHtml: escHtml, escAttr: escAttr };
})(typeof globalThis !== 'undefined' ? globalThis : this);
