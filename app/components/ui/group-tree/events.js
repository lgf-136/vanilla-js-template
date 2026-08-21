/* ============================================================
 * events.js — 分组树·document 级事件委托（自 index.js 拆出）
 * ------------------------------------------------------------
 * 职责：click / contextmenu / dblclick / input / keydown /
 *       dragstart / dragover / drop / dragend 全部 document 级
 *       委托，作用域限定 [data-gt-tree]，多实例共存；含 doAction
 *       菜单动作分发、commitInline 内联重命名、clearDropIndicators
 *       拖拽指示清理。
 * ⚠️ 副作用模块（仅注册监听器、无导出）：必须由 index.js 显式
 *     import 本文件，否则 ESM 不求值、监听器全部静默失效。
 * 依赖：model.js（INSTANCES/instOf/nodeOf/resolveDrop）；render.js
 *       （expandedOf）；menu.js；dialog.js；App.escape（运行时全局）。
 * ============================================================ */
'use strict';

import { INSTANCES, instOf, nodeOf, resolveDrop } from './model.js';
import { expandedOf } from './render.js';
import {
  closeDialog,
  openColorDialog,
  openCreateDialog,
  openDeleteDialog,
  openIconDialog,
  openMoveDialog,
  openRenameDialog,
} from './dialog.js';
import { hideCtxMenu, showCtxMenu, toggleMoreMenu } from './menu.js';

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;

  /* ---------- 拖拽 ---------- */
  function clearDropIndicators() {
    document.querySelectorAll('[data-gt-zone]').forEach(function (el) {
      el.removeAttribute('data-gt-zone');
    });
    document.querySelectorAll('.gt-row.gt-dragging').forEach(function (el) {
      el.classList.remove('gt-dragging');
    });
  }

  /* ---------- 事件委托(全部 document 级,按 [data-gt-tree] 作用域) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // 右键浮层挂在 body 下,先尝试从浮层取实例,再回退到树内解析
    var ctxpop = t.closest('.gt-ctxpop');
    var inst = ctxpop && ctxpop._gtInst ? ctxpop._gtInst : instOf(t);
    if (!inst) return;
    // ⋯ 按钮 → 与右键同款 body 级浮层;再次点击收起
    var more = t.closest('[data-gt-more]');
    if (more) {
      toggleMoreMenu(inst, more.getAttribute('data-gt-more'), more);
      return;
    }
    // 菜单项(⋯ 浮层 / 右键浮层共用)
    var ctx = t.closest('[data-gt-ctx]');
    if (ctx) {
      doAction(inst, ctx.getAttribute('data-gt-ctx'), ctx.getAttribute('data-id'));
      return;
    }
    // 全部清除(根行)
    if (t.closest('[data-gt-clear]')) {
      if (typeof inst.opts.onSelect === 'function') inst.opts.onSelect(null);
      return;
    }
    // 箭头展开/折叠
    var caret = t.closest('[data-gt-caret]');
    if (caret) {
      var cid = caret.getAttribute('data-gt-caret');
      inst.expanded[cid] = !expandedOf(inst, cid);
      if (typeof inst.opts.onToggle === 'function') inst.opts.onToggle(cid, inst.expanded[cid]);
      rerender(inst);
      return;
    }
    // 节点选中(名称/图标;按钮/输入框/下拉内点击不触发)
    var row = t.closest('[data-gt-id]');
    if (row && !t.closest('button, input, textarea, [data-dropdown]')) {
      var id = row.getAttribute('data-gt-id');
      if (typeof inst.opts.onSelect === 'function') inst.opts.onSelect(id);
      return;
    }
  });

  function rerender(inst) {
    if (typeof inst.opts.onRender === 'function') inst.opts.onRender();
  }

  function doAction(inst, act, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    hideCtxMenu();
    if (act === 'newchild') openCreateDialog(inst, id);
    else if (act === 'newsibling') openCreateDialog(inst, node.parentId || '');
    else if (act === 'rename') openRenameDialog(inst, id);
    else if (act === 'move') openMoveDialog(inst, id);
    else if (act === 'icon') openIconDialog(inst, id);
    else if (act === 'color') openColorDialog(inst, id);
    else if (act === 'del') openDeleteDialog(inst, id);
  }

  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var row = t.closest('[data-gt-id]');
    if (!row) return;
    var inst = instOf(row);
    if (!inst) return;
    e.preventDefault();
    showCtxMenu(inst, row.getAttribute('data-gt-id'), e.clientX, e.clientY);
  });

  document.addEventListener('dblclick', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var name = t.closest('[data-gt-name]');
    if (!name) return;
    var inst = instOf(name);
    if (!inst) return;
    var id = name.getAttribute('data-gt-name');
    var node = nodeOf(inst, id);
    if (!node) return;
    name.innerHTML =
      '<input type="text" class="gt-inline" data-gt-inline value="' +
      esc(node.name) +
      '" />';
    var inp = name.querySelector('[data-gt-inline]');
    inp.focus();
    inp.select();
    inp._gtId = id;
    inp._gtDone = false;
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var inst = instOf(t);
    if (!inst) return;
    if (t.hasAttribute('data-gt-filter')) {
      inst.setFilter(t.value);
      rerender(inst);
    }
  });

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (e.key === 'Escape') {
      hideCtxMenu();
      closeDialog();
    }
    if (t.hasAttribute('data-gt-inline')) {
      if (e.key === 'Enter') commitInline(instOf(t), t, false);
      else if (e.key === 'Escape') commitInline(instOf(t), t, true);
    }
  });

  function commitInline(inst, inp, cancel) {
    if (!inp || inp._gtDone) return;
    inp._gtDone = true;
    var id = inp._gtId;
    if (cancel) {
      rerender(inst);
      return;
    }
    var val = inp.value.trim();
    if (val && typeof inst.opts.onRename === 'function') inst.opts.onRename(id, val);
    else rerender(inst);
  }

  /* ---------- 拖拽事件 ---------- */
  document.addEventListener('dragstart', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var row = t.closest('[data-gt-id]');
    if (!row) return;
    var inst = instOf(row);
    if (!inst) return;
    inst.dragId = row.getAttribute('data-gt-id');
    row.classList.add('gt-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', inst.dragId);
    }
  });

  document.addEventListener('dragover', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var inst = instOf(t);
    if (!inst || !inst.dragId) return;
    var row = t.closest('[data-gt-id]');
    clearDropIndicators();
    if (row) {
      var targetId = row.getAttribute('data-gt-id');
      var valid = resolveDrop(inst.nodes(), inst.dragId, targetId, 'inside');
      if (!valid) {
        row.setAttribute('data-gt-zone', 'no');
        return;
      }
      var rect = row.getBoundingClientRect();
      var ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
      var zone = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside';
      var v2 = resolveDrop(inst.nodes(), inst.dragId, targetId, zone);
      if (!v2) {
        row.setAttribute('data-gt-zone', 'no');
        return;
      }
      row.setAttribute('data-gt-zone', zone);
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      e.preventDefault();
      return;
    }
    if (t.closest('[data-gt-body]')) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      e.preventDefault();
    }
  });

  document.addEventListener('drop', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var inst = instOf(t);
    if (!inst || !inst.dragId) return;
    e.preventDefault();
    var row = t.closest('[data-gt-id]');
    var dragId = inst.dragId;
    inst.dragId = null;
    clearDropIndicators();
    if (row) {
      var zone = row.getAttribute('data-gt-zone') || 'inside';
      if (zone !== 'no' && typeof inst.opts.onMove === 'function') {
        inst.opts.onMove(dragId, row.getAttribute('data-gt-id'), zone);
      }
      return;
    }
    if (t.closest('[data-gt-body]') && typeof inst.opts.onMove === 'function') {
      inst.opts.onMove(dragId, '', 'inside');
    }
  });

  document.addEventListener('dragend', function () {
    Object.keys(INSTANCES).forEach(function (key) {
      INSTANCES[key].dragId = null;
    });
    clearDropIndicators();
  });
