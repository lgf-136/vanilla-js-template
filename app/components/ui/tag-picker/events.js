/* ============================================================
 * events.js — document 级事件委托（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责（拆分设计总览见 index.js 头注）：
 *   - click 委托：管理列表行选中/未标记/清除、颜色过滤条、⋯ 按钮
 *     （menu.toggleCtx）、菜单动作分发（doManagerAction）、多选下拉
 *     点选/创建/完成；实例解析经 model.instOf（含 body 级浮层回退）
 *   - input 委托：管理列表搜索过滤、多选下拉搜索（只重绘下拉保焦点）
 *   - keydown 委托：多选下拉 ↑↓ 导航 / Enter 选中或创建 / Esc 关闭
 *   - contextmenu 委托：标签行右键 → menu.showCtx
 * ⚠️ 副作用模块：无导出，仅注册监听器；必须由 index.js 显式导入，
 * 否则 ESM 不求值、监听器全部静默失效（ARCHITECTURE 2.3.1）。
 * 依赖方向：model（注册表/查找）← menu/dialog/popover ← 本文件 ← index。
 * ============================================================ */
'use strict';

import { INSTANCES, instOf, nodeOf } from './model.js';
import { hideCtx, showCtx, toggleCtx } from './menu.js';
import { openDeleteDialog } from './dialog.js';
import { openTagDialog } from './popover.js';

  /* ---------- 事件委托 ---------- */
  function doManagerAction(inst, el) {
    var act = el.getAttribute('data-tp-act');
    var id = el.getAttribute('data-id');
    var tag = nodeOf(inst, id);
    if (!tag) return;
    if (act === 'rename') openTagDialog(inst, tag, el);
    else if (act === 'color') {
      App.ui.colorPicker.pickerDialog(tag.color || '', function (val) {
        if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(tag.id, val || '');
      }, {
          title: inst.labels().color || '',
          cancelLabel: inst.labels().cancel || '',
          applyLabel: inst.labels().save || '',
          copiedLabel: inst.labels().copied || '',
          clearLabel: inst.labels().clear || '',
          copyTip: inst.labels().copyTip || '',
          hint: inst.labels().pickerHint || '',
          labels: inst.labels(),
        });
    } else if (act === 'del') openDeleteDialog(inst, tag);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // 右键浮层挂在 body 下,先尝试从浮层取实例,再回退到树内解析
    var ctxpop = t.closest('.tp-ctxpop');
    var inst = ctxpop && ctxpop._tpInst ? ctxpop._tpInst : instOf(t);
    if (!inst) return;

    // ⋯ 按钮 → 与右键同款 body 级浮层,锚定按钮下方(修复被侧栏遮挡);再次点击收起
    var more = t.closest('[data-tp-more]');
    if (more) {
      var mt = nodeOf(inst, more.getAttribute('data-tp-more'));
      if (mt) toggleCtx(inst, mt, more);
      return;
    }

    // 管理列表:标签行选中(筛选)/未标记/清除
    var clearRow = t.closest('[data-tp-clear]');
    if (clearRow) {
      if (typeof inst.opts.onSelect === 'function') inst.opts.onSelect('');
      return;
    }
    var noneRow = t.closest('[data-tp-none]');
    if (noneRow) {
      if (typeof inst.opts.onSelect === 'function') inst.opts.onSelect('__none__');
      return;
    }
    var tagRow = t.closest('[data-tp-tag]');
    if (tagRow && !t.closest('[data-tp-act], [data-tp-more]')) {
      if (typeof inst.opts.onSelect === 'function') {
        inst.opts.onSelect(tagRow.getAttribute('data-tp-tag'));
      }
      return;
    }
    // 行内 ⋯ 菜单动作 / 右键浮层项(先收起浮层,避免其盖住后续打开的弹窗)
    var actEl = t.closest('[data-tp-act]');
    if (actEl) {
      if (ctxpop) hideCtx();
      doManagerAction(inst, actEl);
      return;
    }
    // 颜色过滤条
    var colorBtn = t.closest('[data-tp-color]');
    if (colorBtn) {
      inst.setManagerColor(colorBtn.getAttribute('data-tp-color') || '');
      inst.refresh();
      return;
    }
    // 清除搜索由公共组件 search-input 处理(派发 input 事件)
    // 多选下拉:切换标签
    var pick = t.closest('[data-tp-pick]');
    if (pick) {
      if (typeof inst.opts.onToggle === 'function') {
        inst.opts.onToggle(pick.getAttribute('data-tp-pick'));
      }
      return;
    }
    // 多选下拉:创建新标签
    var createBtn = t.closest('[data-tp-create]');
    if (createBtn) {
      var q = inst.pickerSearch.trim();
      if (q) inst.openCreateDialog(createBtn);
      return;
    }
    // 完成
    var done = t.closest('[data-tp-done]');
    if (done) {
      try {
        App.ui.closeDropdowns ? App.ui.closeDropdowns() : null;
      } catch (err) {
        /* noop */
      }
      var wrap = t.closest('[data-dropdown]');
      var menu = wrap && wrap.querySelector('[data-dropdown-menu]');
      if (menu) menu.classList.remove('open');
      var trig = wrap && wrap.querySelector('[data-dropdown-trigger]');
      if (trig) trig.removeAttribute('aria-expanded');
      return;
    }
    // 右键菜单(管理列表行内)
    var ctx = t.closest('[data-tp-ctx]');
    if (ctx) {
      doManagerAction(inst, ctx);
      return;
    }
  });

  // 管理列表搜索输入
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var inst = instOf(t);
    if (!inst) return;
    if (t.hasAttribute('data-tp-search')) {
      inst.setManagerFilter(t.value);
      inst.refresh();
    }
  });

  // 多选下拉搜索输入(只重绘下拉内容,不重渲染整页以保焦点)
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (!t.hasAttribute('data-tp-pick-search')) return;
    var pickerRoot = t.closest('[data-tp-picker]');
    if (!pickerRoot) return;
    var inst = INSTANCES[pickerRoot.getAttribute('data-tp-picker')];
    if (!inst) return;
    inst.setPickerSearch(t.value);
    // 始终回调(标签 Popover 挂在 body 下,不在 [data-dropdown-menu] 内)
    if (typeof inst.opts.onRenderMenu === 'function') {
      inst.opts.onRenderMenu();
    }
  });

  // 键盘:多选下拉 ↑↓ 导航 / Enter 选中或创建 / Esc 关闭
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute || !t.hasAttribute('data-tp-pick-search')) return;
    var pickerRoot = t.closest('[data-tp-picker]');
    if (!pickerRoot) return;
    var inst = INSTANCES[pickerRoot.getAttribute('data-tp-picker')];
    if (!inst) return;
    var listEl = pickerRoot.querySelector('[data-tp-pick-list]');
    var opts = listEl ? listEl.querySelectorAll('[data-tp-pick]') : [];
    var createEl = listEl ? listEl.querySelector('[data-tp-create]') : null;
    var max = opts.length + (createEl ? 1 : 0);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var dir = e.key === 'ArrowDown' ? 1 : -1;
      inst.pickerIndex = ((inst.pickerIndex + dir) % max + max) % max;
      var target = inst.pickerIndex < opts.length ? opts[inst.pickerIndex] : createEl;
      if (target) {
        listEl.querySelectorAll('.is-hip').forEach(function (el) {
          el.classList.remove('is-hip');
        });
        target.classList.add('is-hip');
        target.scrollIntoView ? target.scrollIntoView({ block: 'nearest' }) : null;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (inst.pickerIndex >= 0 && inst.pickerIndex < opts.length) {
        if (typeof inst.opts.onToggle === 'function') inst.opts.onToggle(opts[inst.pickerIndex].getAttribute('data-tp-pick'));
      } else if (createEl && inst.pickerSearch.trim()) {
        inst.openCreateDialog(createEl);
      }
    } else if (e.key === 'Escape') {
      var wrap = t.closest('[data-dropdown]');
      var menu = wrap && wrap.querySelector('[data-dropdown-menu]');
      if (menu) menu.classList.remove('open');
      var trig = wrap && wrap.querySelector('[data-dropdown-trigger]');
      if (trig) trig.removeAttribute('aria-expanded');
      t.blur();
    }
  });

  // 右键:管理列表标签行 → body 级菜单浮层
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var inst = instOf(t);
    if (!inst) return;
    var row = t.closest('[data-tp-tag]');
    if (!row) return;
    e.preventDefault();
    var tag = nodeOf(inst, row.getAttribute('data-tp-tag'));
    if (!tag) return;
    showCtx(inst, tag, e.clientX, e.clientY);
  });
