/* ============================================================
 * context-menu.js — 右键/⋯ 按钮浮层菜单族（ui.js ESM 拆分，见 ../index.js 头注）
 * ------------------------------------------------------------
 * 职责：ctxMenu 菜单项/分隔线/子菜单/空态渲染 + 浮层开关
 *       （body 级 fixed 单例，分组/标签赋值等通用）。
 * 副作用：document click 全局单例监听（点击浮层外关闭；
 *       keepOpenOn 命中不关闭，交由宿主切换），随本文件 import 即注册。
 * Esc 关闭由 feedback.js 的全局 keydown 监听调用 contextMenuClose 完成。
 * 依赖 utils.js 的转义别名；对外挂载统一由 core/index.js 完成。
 * ============================================================ */
'use strict';

import { escAttr, escHtml } from './utils.js';

  var ctxPop = null;
  /** 菜单项:opts = { attrs, isOn, danger, check, caret, hashColor } */
  function ctxItem(iconName, label, opts) {
    var o = opts || {};
    return (
      '<button type="button" class="ui-ctxitem' +
      (o.isOn ? ' is-on' : '') +
      (o.danger ? ' is-danger' : '') +
      '"' +
      (o.attrs ? ' ' + o.attrs : '') +
      '>' +
      (o.hashColor
        ? '<span class="ui-ctx-hash" style="color:' + escAttr(o.hashColor) + '">#</span>'
        : iconName
          ? App.icon.iconSvg(iconName, { class: 'size-3.5' })
          : '') +
      escHtml(label) +
      (o.check ? '<span class="ui-ctx-check">' + App.icon.iconSvg('check') + '</span>' : '') +
      (o.caret ? '<span class="ui-ctx-caret">' + App.icon.iconSvg('chevron-right') + '</span>' : '') +
      '</button>'
    );
  }
  function ctxSeparator() {
    return '<div class="ui-ctxsep"></div>';
  }
  /** 子菜单:父项 hover 展开右侧子面板 */
  function ctxSubmenu(label, iconName, itemsHtml) {
    return (
      '<div class="ui-ctxwrap">' +
      '<button type="button" class="ui-ctxitem ui-ctxparent" tabindex="-1">' +
      (iconName ? App.icon.iconSvg(iconName, { class: 'size-3.5' }) : '') +
      escHtml(label) +
      '<span class="ui-ctx-caret">' +
      App.icon.iconSvg('chevron-right') +
      '</span>' +
      '</button>' +
      '<div class="ui-ctxsubmenu">' +
      itemsHtml +
      '</div>' +
      '</div>'
    );
  }
  function ctxEmpty(text) {
    return '<div class="ui-ctxempty">' + escHtml(text) + '</div>';
  }
  /** 打开浮层菜单:opts = { anchorEl, x, y, className, keepOpenOn, onClose };返回 popup 元素 */
  function contextMenuOpen(html, opts) {
    contextMenuClose();
    var o = opts || {};
    ctxPop = document.createElement('div');
    ctxPop.className = 'ui-ctxpop' + (o.className ? ' ' + o.className : '');
    ctxPop.setAttribute('data-ctxpop', '');
    ctxPop.innerHTML = html;
    // keepOpenOn:该选择器内点击不触发外部关闭(交由宿主切换收起);onClose:关闭后回调(宿主清理状态)
    ctxPop._keepOpenOn = o.keepOpenOn || '';
    ctxPop._onClose = typeof o.onClose === 'function' ? o.onClose : null;
    document.body.appendChild(ctxPop);
    var w = ctxPop.offsetWidth || 200;
    var h = ctxPop.offsetHeight || 260;
    var left, top;
    if (o.anchorEl && o.anchorEl.getBoundingClientRect) {
      var rect = o.anchorEl.getBoundingClientRect();
      left = rect.right - w;
      top = rect.bottom + 4;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4);
    } else {
      left = Math.max(4, o.x || 0);
      top = Math.max(4, o.y || 0);
    }
    ctxPop.style.left = left + 'px';
    ctxPop.style.top = top + 'px';
    return ctxPop;
  }
  function contextMenuClose() {
    if (ctxPop && ctxPop.parentNode) ctxPop.parentNode.removeChild(ctxPop);
    var cb = ctxPop && ctxPop._onClose;
    ctxPop = null;
    if (cb) cb();
  }
  // 点击浮层外 → 关闭(全局单例,多实例互斥;keepOpenOn 命中不关闭,交由宿主切换)
  document.addEventListener('click', function (e) {
    if (
      ctxPop &&
      e.target &&
      (!e.target.closest || !e.target.closest('[data-ctxpop]')) &&
      !(ctxPop._keepOpenOn && e.target.closest && e.target.closest(ctxPop._keepOpenOn))
    ) {
      contextMenuClose();
    }
  });

export { ctxItem, ctxSeparator, ctxSubmenu, ctxEmpty, contextMenuOpen, contextMenuClose };
