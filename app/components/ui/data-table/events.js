/* ============================================================
 * events.js — 全局事件委托（document 级，仅绑定一次）（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责：bindEvents 注册 click/input 委托，按 [data-dt-*] 属性路由到实例状态
 *      变更（排序/显隐/过滤/分页/选择/批量回调），再经 rerender 就地重绘。
 * 副作用模块：必须由入口 index.js 显式导入并触发（ESM 不求值则监听器静默失效，
 * 见 ARCHITECTURE.md 2.3.1），绑定时机由 store.ensureEventsOnce 保证仅一次。
 * ============================================================ */
'use strict';

import { instances, pageCount, pageRows, selectedRows } from './store.js';
import { filterListHtml } from './toolbar.js';
import { rerender } from './render.js';

  /* ---------- 事件委托(全局仅绑定一次) ---------- */
  export function bindEvents() {
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      var root = target.closest('[data-dt-id]');
      if (!root) return;
      var inst = instances[root.getAttribute('data-dt-id')];
      if (!inst) return;
      var s = inst.state;
      var key;

      // 排序
      var sortOpt = target.closest('[data-dt-sort-opt]');
      if (sortOpt) {
        key = sortOpt.getAttribute('data-key');
        var dir = sortOpt.getAttribute('data-dt-sort-opt');
        s.sort = dir === 'default' ? { key: '', dir: '' } : { key: key, dir: dir };
        s.page = 1;
        rerender(inst);
        return;
      }
      var hideCol = target.closest('[data-dt-hide-col]');
      if (hideCol) {
        s.visibility[hideCol.getAttribute('data-key')] = false;
        rerender(inst);
        return;
      }
      // 列显隐
      var viewCol = target.closest('[data-dt-view-col]');
      if (viewCol) {
        key = viewCol.getAttribute('data-dt-view-col');
        s.visibility[key] = s.visibility[key] === false;
        rerender(inst);
        return;
      }
      // 分面过滤
      var filterOpt = target.closest('[data-dt-filter-opt]');
      if (filterOpt) {
        var fk = filterOpt.getAttribute('data-dt-filter-opt');
        var fv = filterOpt.getAttribute('data-value');
        var arr = s.filterSel[fk] || (s.filterSel[fk] = []);
        var idx = arr.indexOf(fv);
        if (idx === -1) arr.push(fv);
        else arr.splice(idx, 1);
        s.page = 1;
        rerender(inst);
        return;
      }
      var filterClear = target.closest('[data-dt-filter-clear]');
      if (filterClear) {
        var ck = filterClear.getAttribute('data-dt-filter-clear');
        s.filterSel[ck] = [];
        s.filterSearch[ck] = '';
        s.page = 1;
        rerender(inst);
        return;
      }
      // 过滤显隐切换
      var filterToggleOpt = target.closest('[data-dt-filter-toggle-opt]');
      if (filterToggleOpt) {
        var fvk = filterToggleOpt.getAttribute('data-dt-filter-toggle-opt');
        s.filterVisibility[fvk] = s.filterVisibility[fvk] === false;
        rerender(inst);
        return;
      }
      // 重置
      var reset = target.closest('[data-dt-reset]');
      if (reset) {
        s.search = '';
        s.filterSel = {};
        s.filterSearch = {};
        s.page = 1;
        rerender(inst);
        return;
      }
      // 分页
      var pageBtn = target.closest('[data-dt-page]');
      if (pageBtn) {
        var cmd = pageBtn.getAttribute('data-dt-page');
        if (cmd === 'first') s.page = 1;
        else if (cmd === 'prev') s.page = s.page - 1;
        else if (cmd === 'next') s.page = s.page + 1;
        else if (cmd === 'last') s.page = pageCount(inst);
        else s.page = parseInt(cmd, 10);
        var total = pageCount(inst);
        s.page = Math.max(1, Math.min(total, s.page));
        rerender(inst);
        return;
      }
      var pageSize = target.closest('[data-dt-page-size]');
      if (pageSize) {
        s.pageSize = parseInt(pageSize.getAttribute('data-dt-page-size'), 10);
        s.page = 1;
        rerender(inst);
        return;
      }
      // 行选择(label 点击与浏览器转发的 input 合成 click 都会到达,
      // 以 input 原生 checked 为准同步,避免双切换;非 input 目标直接翻转)
      var rowCheck = target.closest('[data-dt-check]');
      if (rowCheck) {
        var cid = rowCheck.getAttribute('data-dt-check');
        if (cid) {
          if (target.tagName === 'INPUT') s.selection[cid] = !!target.checked;
          else s.selection[cid] = !s.selection[cid];
          rerender(inst);
        }
        return;
      }
      var checkAll = target.closest('[data-dt-check-all]');
      if (checkAll) {
        var rows = pageRows(inst);
        var rkKey = inst.opts.rowKey || 'id';
        var selectAll = target.tagName === 'INPUT' ? target.checked : !(rows.length > 0 && rows.every(function (r) {
          return s.selection[r[rkKey]];
        }));
        rows.forEach(function (r) {
          if (selectAll) s.selection[r[rkKey]] = true;
          else delete s.selection[r[rkKey]];
        });
        rerender(inst);
        return;
      }
      var clearSel = target.closest('[data-dt-clear-selection]');
      if (clearSel) {
        s.selection = {};
        rerender(inst);
        return;
      }
      // 批量操作(选择保持,由宿主回调决定是否清空)
      var bulkGroup = target.closest('[data-dt-bulk-group]');
      if (bulkGroup) {
        var action = bulkGroup.getAttribute('data-dt-bulk-group');
        var value = bulkGroup.getAttribute('data-value');
        if (inst.opts.bulk && inst.opts.bulk.onGroup) {
          inst.opts.bulk.onGroup(action, value, selectedRows(inst));
        }
        return;
      }
      var bulkItem = target.closest('[data-dt-bulk-item]');
      if (bulkItem) {
        var ia = bulkItem.getAttribute('data-dt-bulk-item');
        if (inst.opts.bulk && inst.opts.bulk.onItem) {
          inst.opts.bulk.onItem(ia, selectedRows(inst));
        }
        return;
      }
    });

    document.addEventListener('input', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      var root = target.closest('[data-dt-id]');
      if (!root) return;
      var inst = instances[root.getAttribute('data-dt-id')];
      if (!inst) return;
      var s = inst.state;
      if (target.closest('[data-dt-search]')) {
        s.search = target.value;
        s.page = 1;
        rerender(inst);
        return;
      }
      if (target.closest('[data-dt-filter-search]')) {
        var fk = target.getAttribute('data-dt-filter-search');
        s.filterSearch[fk] = target.value;
        // 就地重绘过滤器列表(保持下拉打开)
        var menu = target.closest('[data-dropdown-menu]');
        var list = menu ? menu.querySelector('.dt-filter-list') : null;
        if (list && inst.t) list.innerHTML = filterListHtml(inst, inst.t, fk);
      }
    });
  }
