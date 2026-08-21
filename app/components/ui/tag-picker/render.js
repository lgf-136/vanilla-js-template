/* ============================================================
 * render.js — 标签 HTML 渲染（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责（拆分设计总览见 index.js 头注）：
 *   - managerHtml：侧栏标签管理列表（全部/未标记/搜索过滤/
 *     颜色过滤条/计数角标/标签行），纯函数 inst → HTML 字符串
 *   - pickerHtml：Gmail 式多选下拉（模糊搜索 + 高亮 + 创建项 +
 *     已选计数），纯函数 (inst, pickedIds) → HTML 字符串
 * 只拼字符串、不碰 DOM、不注册监听器；事件交互见 events.js。
 * 依赖 model.js 的 PALETTE/fuzzyMatch/highlight 与共享访问器；
 * App.ui.searchInput 为全局公共组件（运行时注入）。
 * ============================================================ */
'use strict';

import {
  PALETTE,
  esc,
  escAttr,
  escapeHtml,
  fuzzyMatch,
  highlight,
  ic,
  resolveColor,
} from './model.js';

  /* ---------- 侧栏管理列表 ---------- */
  function managerHtml(inst) {
    var L = inst.labels();
    var tags = inst.nodes();
    var filter = inst.managerFilter;
    var colorF = inst.managerColor;
    var activeId = inst.opts.activeId || '';
    var taggedCount = 0;
    var untaggedCount = 0;
    var byColor = {};
    var list = tags
      .filter(function (t) {
        if (colorF && (t.color || '') !== colorF) return false;
        if (filter && !fuzzyMatch(t.name, filter)) return false;
        return true;
      })
      .slice()
      .sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
    if (typeof inst.opts.count === 'function') {
      tags.forEach(function (t) {
        byColor[t.color || ''] = (byColor[t.color || ''] || 0) + 1;
        taggedCount += inst.opts.count(t.id) || 0;
      });
      untaggedCount = inst.opts.count(null) || 0;
    }
    var html =
      '<div class="tp" data-tp="' +
      inst.uid +
      '">' +
      '<div class="tp-manager">' +
      '<div class="tp-search">' +
      App.ui.searchInput.html({
        placeholder: L.searchTags || '',
        value: filter,
        attrs: 'data-tp-search',
        class: 'is-compact',
        clearLabel: L.clear || '',
      }) +
      '</div>' +
      '<div class="tp-colorbar" data-tp-colorbar>' +
      '<button type="button" class="tp-swatch' +
      (colorF === '' ? ' is-on' : '') +
      '" data-tp-color="" data-tip="' +
      escAttr(L.allColors || '') +
      '" style="background:conic-gradient(from 0deg,var(--nova-palette-rose),var(--nova-palette-amber),var(--nova-palette-lime),var(--nova-palette-cyan),var(--nova-palette-indigo),var(--nova-palette-purple),var(--nova-palette-rose))" aria-label=""></button>' +
      PALETTE.map(function (name) {
        return (
          '<button type="button" class="tp-swatch' +
          (colorF === name ? ' is-on' : '') +
          '" data-tp-color="' +
          name +
          '" data-tip="' +
          name +
          (byColor[name] ? ' (' + byColor[name] + ')' : '') +
          '" style="background:' +
          resolveColor(name) +
          '" aria-label=""></button>'
        );
      }).join('') +
      '</div>' +
      '<div class="tp-body" data-tp-body>' +
      '<div class="tp-row tp-root' +
      (activeId === '' ? ' is-active' : '') +
      '" data-tp-clear>' +
      '<span class="tp-hash tp-hash-root">#</span>' +
      '<span class="tp-name">' +
      esc(L.allTags || '') +
      '</span>' +
      '<span class="tp-count">' +
      taggedCount +
      '</span>' +
      '</div>' +
      '<div class="tp-row tp-root' +
      (activeId === '__none__' ? ' is-active' : '') +
      '" data-tp-none>' +
      '<span class="tp-hash tp-hash-root">#</span>' +
      '<span class="tp-name">' +
      esc(L.untagged || '') +
      '</span>' +
      '<span class="tp-count">' +
      untaggedCount +
      '</span>' +
      '</div>';
    if (!list.length) {
      html +=
        '<div class="tp-empty">' +
        (filter || colorF ? esc(L.noMatch || '') : esc(L.empty || '')) +
        '</div>';
    } else {
      list.forEach(function (t) {
        html += tagRowHtml(inst, t, activeId);
      });
    }
    html += '</div></div></div>';
    return html;
  }

  function tagRowHtml(inst, t, activeId) {
    var L = inst.labels();
    var count = typeof inst.opts.count === 'function' ? inst.opts.count(t.id) : 0;
    var col = resolveColor(t.color);
    return (
      '<div class="tp-row' +
      (activeId === t.id ? ' is-active' : '') +
      '" data-tp-tag="' +
      escAttr(t.id) +
      '" data-tip="' +
      escAttr(L.renameHint || '') +
      '">' +
      '<span class="tp-hash" style="' +
      (col ? 'color:' + col + ';' : '') +
      '">#</span>' +
      '<span class="tp-name" data-tp-rename="' +
      escAttr(t.id) +
      '">' +
      esc(t.name) +
      '</span>' +
      (count ? '<span class="tp-count">' + count + '</span>' : '') +
      '<button type="button" class="tp-more" data-tp-more="' +
      escAttr(t.id) +
      '" aria-label="' +
      escAttr(L.menu || '') +
      '" data-tip="' +
      escAttr(L.menu || '') +
      '">' +
      ic('ellipsis') +
      '</button>' +
      '</div>'
    );
  }

  /* ---------- Gmail 式多选下拉 ---------- */
  function pickerHtml(inst, pickedIds) {
    var L = inst.labels();
    pickedIds = pickedIds || [];
    var q = inst.pickerSearch;
    var tags = inst.nodes();
    var list = tags.filter(function (t) {
      return fuzzyMatch(t.name, q);
    });
    var exact = list.some(function (t) {
      return t.name.toLowerCase() === q.trim().toLowerCase();
    });
    var canCreate = q.trim() && !exact;
    var html =
      '<div class="tp-picker" data-tp-picker="' +
      inst.uid +
      '">' +
      '<div class="tp-picker-search">' +
      App.ui.searchInput.html({
        placeholder: L.searchCreate || '',
        value: q,
        attrs: 'data-tp-pick-search',
        class: 'is-compact',
        clearLabel: L.clear || '',
      }) +
      '</div>' +
      '<div class="tp-pick-list" data-tp-pick-list>';
    if (canCreate) {
      html +=
        '<button type="button" class="tp-opt tp-opt-create" data-tp-create>' +
        '<span class="tp-opt-plus">' +
        ic('plus') +
        '</span>' +
        '<span class="tp-opt-name">' +
        esc(L.createTag || '') +
        ' "<b>' +
        escapeHtml(q.trim()) +
        '</b>"</span>' +
        '</button>';
    }
    if (!list.length && !canCreate) {
      html += '<div class="tp-empty">' + esc(L.empty || '') + '</div>';
    } else {
      list.forEach(function (t) {
        var on = pickedIds.indexOf(t.id) !== -1;
        var col = resolveColor(t.color);
        html +=
          '<button type="button" class="tp-opt' +
          (on ? ' is-on' : '') +
          '" data-tp-pick="' +
          escAttr(t.id) +
          '">' +
          '<span class="tp-check">' +
          (on ? ic('check') : '') +
          '</span>' +
          '<span class="tp-hash" style="' +
          (col ? 'color:' + col + ';' : '') +
          '">#</span>' +
          '<span class="tp-opt-name">' +
          highlight(t.name, q, escapeHtml) +
          '</span>' +
          '</button>';
      });
    }
    html +=
      '</div>' +
      '<div class="tp-pick-foot">' +
      '<span class="tp-pick-count">' +
      (pickedIds.length ? pickedIds.length + ' ' + esc(L.selected || '') : esc(L.noneSelected || '')) +
      '</span>' +
      '<button type="button" class="tp-btn" data-tp-done>' +
      esc(L.done || '') +
      '</button>' +
      '</div>' +
      '</div>';
    return html;
  }

export { managerHtml, pickerHtml };
