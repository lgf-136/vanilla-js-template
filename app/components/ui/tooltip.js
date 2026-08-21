/* ============================================================
 * tooltip.js — 提示气泡(公共组件,替代浏览器原生 title)
 * ------------------------------------------------------------
 * 任意元素加 data-tip="提示文本" 即可获得 shadcn 风格提示气泡:
 *   - body 级 fixed 浮层,z-index 2000,不受容器裁剪/层叠影响
 *   - 默认显示在元素上方,空间不足自动翻转到下方,水平防溢出
 *   - 支持鼠标悬停 / 键盘聚焦;点击、滚动、缩放、Esc 时隐藏
 * 用法:
 *   <button data-tip="删除">×</button>
 *   或编程式:App.ui.tooltip.show(el, text) / App.ui.tooltip.hide()
 * 依赖:无(纯 DOM)。
 * ============================================================ */
(function () {
  'use strict';

  var tip = null;
  var tipAnchor = null;
  var hideTimer = null;

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;

  function show(anchor, text) {
    hide();
    if (!anchor || !text) return;
    tipAnchor = anchor;
    tip = document.createElement('div');
    tip.className = 'ui-tip';
    tip.setAttribute('data-ui-tip', '');
    tip.setAttribute('role', 'tooltip');
    tip.innerHTML = esc(text);
    document.body.appendChild(tip);
    position(anchor);
  }

  function position(anchor) {
    if (!tip) return;
    var w = tip.offsetWidth || 120;
    var h = tip.offsetHeight || 28;
    var rect = anchor.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - w / 2;
    var top = rect.top - h - 8;
    if (top < 8) top = rect.bottom + 8; // 上方放不下 → 下方
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (tip) {
      tip.remove();
      tip = null;
    }
    tipAnchor = null;
  }

  function tipOf(el) {
    return el && el.closest ? el.closest('[data-tip]') : null;
  }

  // 悬停显示(延迟 120ms 防抖动)
  document.addEventListener('mouseover', function (e) {
    var el = tipOf(e.target);
    if (!el) return;
    var text = el.getAttribute('data-tip');
    if (!text) return;
    if (tipAnchor === el) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      hideTimer = null;
      show(el, text);
    }, 120);
  });

  document.addEventListener('mouseout', function (e) {
    var el = tipOf(e.target);
    if (el) hide();
  });

  // 键盘焦点(无障碍)
  document.addEventListener('focusin', function (e) {
    var el = tipOf(e.target);
    if (!el) return;
    var text = el.getAttribute('data-tip');
    if (text) show(el, text);
  });

  document.addEventListener('focusout', function (e) {
    var el = tipOf(e.target);
    if (el) hide();
  });

  // 点击 / Esc / 滚动 / 缩放时隐藏
  document.addEventListener('click', function () {
    hide();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);

  /* ---------- 样式注入 ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.querySelector('[data-tooltip-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-tooltip-style', '');
    style.textContent =
      '.ui-tip{position:fixed;z-index:2000;max-width:18rem;padding:.3125rem .5625rem;border-radius:.375rem;' +
      'background:var(--nova-ink);color:var(--nova-white);font-size:.75rem;line-height:1.4;font-weight:500;' +
      'box-shadow:0 4px 12px var(--shadow-color-popover);border:1px solid color-mix(in oklab, var(--nova-white) 8%, transparent);' +
      'pointer-events:none;white-space:normal;word-break:break-word}';
    document.head.appendChild(style);
  }
  injectStyles();

  window.App = window.App || {};
  App.ui = App.ui || {};
  App.ui.tooltip = { show: show, hide: hide };
})();
