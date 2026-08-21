/* ============================================================
 * render.js — 分组树·行渲染与图标/Emoji 解析（自 index.js 拆出）
 * ------------------------------------------------------------
 * 职责：iconHtml / colorCss / visibleSet / rowHtml / treeHtml
 *       等纯 HTML 字符串渲染，以及图标库名册 allIcons、Emoji 表
 *       EMOJIS、展开态 expandedOf 等渲染辅助（供 dialog 复用）。
 *       组件只渲染树本体；区块标题与「+」等由宿主模块排版。
 * 依赖：model.js（descendants/treeChildren）；App.icon.iconSvg、
 *       App.ui.searchInput、App.escape（运行时全局）。
 * ============================================================ */
'use strict';

import { descendants, treeChildren } from './model.js';

  /* ---------- 图标 / Emoji 数据 ---------- */
  function allIcons() {
    try {
      var data = window.__iconData || {};
      return Object.keys(data).sort();
    } catch (e) {
      return [];
    }
  }
  var EMOJIS = [
    '📁', '📂', '🗂️', '📌', '⭐', '🔥', '✅', '💡', '🚀', '🎯',
    '📊', '📈', '💰', '🔑', '🔒', '🛠️', '⚙️', '📦', '📚', '🧪',
    '🐛', '🌐', '🧠', '🎨', '🎵', '🎮', '📱', '💻', '🖥️', '☁️',
    '🔮', '🧩', '🎁', '⏰', '📅', '👥', '🏆', '💎', '🌱', '🌙',
    '☀️', '🍀', '🔔', '🚦', '🧭', '🎬', '💬', '🔗',
  ];

  function isEmoji(v) {
    if (typeof v !== 'string' || !v) return false;
    for (var i = 0; i < v.length; i++) if (v.charCodeAt(i) > 127) return true;
    return false;
  }

  /* ---------- 渲染 ---------- */
  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;
  var escAttr = App.escape.escAttr;
  function ic(name, cls) {
    try {
      return App.icon.iconSvg(name, { class: cls || 'size-3.5' });
    } catch (e) {
      return '';
    }
  }
  function iconHtml(node) {
    var raw = node && node.icon;
    if (isEmoji(raw)) return '<span class="gt-emoji">' + esc(raw) + '</span>';
    var name = raw && allIcons().indexOf(raw) !== -1 ? raw : 'folder';
    return ic(name);
  }
  function colorCss(node) {
    try {
      return App.ui.color.resolveColor(node && node.color);
    } catch (e) {
      return '';
    }
  }
  function expandedOf(inst, id) {
    return inst.expanded[id] !== false;
  }

  /** 过滤后可见节点集(命中节点 + 祖先 + 子孙) */
  function visibleSet(inst) {
    var nodes = inst.nodes();
    var q = (inst.filter || '').trim().toLowerCase();
    if (!q) return null;
    var hit = {};
    nodes.forEach(function (n) {
      if ((n.name || '').toLowerCase().indexOf(q) !== -1) hit[n.id] = true;
    });
    // 祖先
    var changed = true;
    while (changed) {
      changed = false;
      nodes.forEach(function (n) {
        if (hit[n.id] && n.parentId && !hit[n.parentId]) {
          hit[n.parentId] = true;
          changed = true;
        }
      });
    }
    // 子孙
    Object.keys(hit).forEach(function (id) {
      descendants(nodes, id).forEach(function (did) {
        hit[did] = true;
      });
    });
    return hit;
  }

  function rowHtml(inst, node, depth, visible) {
    var nodes = inst.nodes();
    var children = treeChildren(nodes, node.id);
    var expanded = expandedOf(inst, node.id) || !!visible;
    var active = inst.opts.activeId === node.id;
    var L = inst.labels();
    var count = typeof inst.opts.count === 'function' ? inst.opts.count(node) : 0;
    var extra = typeof inst.opts.rowExtra === 'function' ? inst.opts.rowExtra(node) : '';
    var color = colorCss(node);
    var html =
      '<div class="gt-row' +
      (active ? ' is-active' : '') +
      '" data-gt-id="' +
      esc(node.id) +
      '" draggable="true" style="padding-left:' +
      Math.min(depth * 0.875, 4) +
      'rem">' +
      '<span class="gt-caret' +
      (children.length ? '' : ' is-leaf') +
      (expanded ? ' is-open' : '') +
      '" data-gt-caret="' +
      esc(node.id) +
      '" aria-label="' +
      (expanded ? esc(L.collapse || '') : esc(L.expand || '')) +
      '">' +
      ic('chevron-right') +
      '</span>' +
      '<span class="gt-ic" data-gt-icon="' +
      esc(node.id) +
      '" style="' +
      (color ? 'color:' + color + ';' : '') +
      '">' +
      iconHtml(node) +
      '</span>' +
      '<span class="gt-name" data-gt-name="' +
      esc(node.id) +
      '" data-tip="' +
      (L.renameHint || '') +
      '">' +
      esc(node.name) +
      '</span>' +
      (count ? '<span class="gt-count">' + count + '</span>' : '') +
      extra +
      '<button type="button" class="gt-more" data-gt-more="' +
      esc(node.id) +
      '" aria-label="' +
      esc(L.menu || '') +
      '" data-tip="' +
      esc(L.menu || '') +
      '">' +
      ic('ellipsis') +
      '</button>' +
      '</div>';
    if (children.length && expanded) {
      html +=
        '<div class="gt-children">' +
        children
          .map(function (c) {
            return rowHtml(inst, c, depth + 1, visible && visible[c.id]);
          })
          .join('') +
        '</div>';
    }
    return html;
  }

  function treeHtml(inst) {
    var nodes = inst.nodes();
    var visible = visibleSet(inst);
    var roots = visible
      ? nodes.filter(function (n) {
          return !n.parentId && visible[n.id];
        })
      : treeChildren(nodes, '');
    var L = inst.labels();
    var rootActive = !inst.opts.activeId || inst.opts.activeId === 'root';
    var html =
      '<div class="gt-tree" data-gt-tree="' +
      inst.uid +
      '">' +
      (inst.opts.showFilter === false
        ? ''
        : '<div class="gt-filter">' +
          App.ui.searchInput.html({
            placeholder: L.search || '',
            value: inst.filter,
            attrs: 'data-gt-filter',
            class: 'is-compact',
            clearLabel: L.clear || '',
          }) +
          '</div>') +
      '<div class="gt-scroll" data-gt-body>' +
      (inst.opts.rootLabel
        ? '<div class="gt-row gt-root' +
          (rootActive ? ' is-active' : '') +
          '" data-gt-clear><span class="gt-caret is-leaf"></span>' +
          '<span class="gt-ic">' +
          ic('layers') +
          '</span><span class="gt-name">' +
          esc(inst.opts.rootLabel) +
          '</span></div>'
        : '');
    if (!roots.length) {
      html +=
        '<div class="gt-empty">' +
        (inst.filter ? esc(L.noMatch || '') : esc(L.empty || '')) +
        '</div>';
    } else {
      html += roots
        .map(function (n) {
          return rowHtml(inst, n, 0, visible);
        })
        .join('');
    }
    html += '</div></div>';
    return html;
  }

export { allIcons, EMOJIS, ic, iconHtml, expandedOf, treeHtml };
