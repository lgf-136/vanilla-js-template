/* ============================================================
 * render.js — 表格主体渲染与渲染入口（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责：复选框 / 表头排序菜单 / 表格（表头+行+单元格）HTML 构建，
 *      以及渲染入口 render(inst,t) 与就地重绘 rerender(inst)。
 * 组合 toolbar（工具栏区）与 parts（分页/批量条）；数据派生来自 store。
 * ============================================================ */
'use strict';

import { pageRows } from './store.js';
import { esc, ic, text, toolbarHtml } from './toolbar.js';
import { bulkBarHtml, paginationHtml } from './parts.js';

  /* ---------- 渲染:复选框 ---------- */
  function checkboxHtml(checked, indeterminate, attrs) {
    return (
      '<span class="dt-check' +
      (checked || indeterminate ? ' is-checked' : '') +
      (indeterminate ? ' is-indeterminate' : '') +
      '" data-role="check">' +
      (indeterminate
        ? '<span class="dt-indeterminate"></span>'
        : ic('check', 'size-3')) +
      '</span>' +
      '<input type="checkbox" ' +
      attrs +
      (checked ? ' checked' : '') +
      ' class="dt-check-input" />'
    );
  }

  /* ---------- 渲染:表头排序菜单(默认 | 升序 | 降序 | 隐藏) ---------- */
  function sortBtnHtml(inst, t, col) {
    var s = inst.state.sort;
    var key = col.key;
    var arrow =
      s.key === key ? (s.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'chevrons-up-down';
    var opt = function (value, iconName, optLabel, active) {
      return (
        '<button type="button" data-dt-sort-opt="' +
        value +
        '" data-key="' +
        key +
        '" class="' +
        App.ui.dropdownItemClass() +
        '">' +
        ic(iconName, 'size-3.5 text-muted-foreground/70') +
        optLabel +
        (active ? ic('check', 'ms-auto size-4') : '') +
        '</button>'
      );
    };
    var noneActive = !(s.key === key);
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" data-dt-sort="' +
      key +
      '" class="' +
      App.ui.buttonClass('ghost', 'sm', 'h-8 px-2 font-semibold!') +
      '">' +
      '<span>' +
      text(col.label, t) +
      '</span>' +
      ic(arrow, 'size-3.5') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('min-w-44') +
      '">' +
      opt('default', 'rotate-ccw', t('dataTable.sortDefault'), noneActive) +
      opt('asc', 'arrow-up', t('dataTable.sortAsc'), s.key === key && s.dir === 'asc') +
      opt('desc', 'arrow-down', t('dataTable.sortDesc'), s.key === key && s.dir === 'desc') +
      App.ui.dropdownSeparator() +
      '<button type="button" data-dt-hide-col data-key="' +
      key +
      '" class="' +
      App.ui.dropdownItemClass() +
      '">' +
      ic('eye-off', 'size-3.5 text-muted-foreground/70') +
      t('dataTable.sortHide') +
      '</button>' +
      '</div></div>'
    );
  }

  /* ---------- 渲染:表格 ---------- */
  function tableHtml(inst, t) {
    var opts = inst.opts;
    var key = opts.rowKey || 'id';
    var rows = pageRows(inst);
    var visCols = (opts.columns || []).filter(function (c) {
      return inst.state.visibility[c.key] !== false;
    });
    var hasActions = typeof opts.rowActionsHtml === 'function';
    var allPageSelected =
      rows.length > 0 &&
      rows.every(function (r) {
        return inst.state.selection[r[key]];
      });
    var somePageSelected = rows.some(function (r) {
      return inst.state.selection[r[key]];
    });
    var colspan = 1 + visCols.length + (hasActions ? 1 : 0);

    var bodyHtml;
    if (!rows.length) {
      bodyHtml =
        '<tr><td colspan="' +
        colspan +
        '" class="h-24 text-center text-muted-foreground">' +
        t('dataTable.noResults') +
        '</td></tr>';
    } else {
      bodyHtml = rows
        .map(function (r) {
          var isSel = !!inst.state.selection[r[key]];
          return (
            '<tr class="dt-row' +
            (isSel ? ' is-selected' : '') +
            '" data-dt-row="' +
            esc(r[key]) +
            '">' +
            '<td class="dt-td w-12"><label class="dt-checkbox" data-dt-check="' +
            esc(r[key]) +
            '">' +
            checkboxHtml(isSel, false, 'data-dt-check="' + esc(r[key]) + '"') +
            '</label></td>' +
            visCols
              .map(function (c) {
                var content = c.render ? c.render(r, t) : esc(r[c.key]);
                return (
                  '<td class="dt-td' +
                  (c.cellClass ? ' ' + c.cellClass : '') +
                  '">' +
                  content +
                  '</td>'
                );
              })
              .join('') +
            (hasActions ? '<td class="dt-td">' + opts.rowActionsHtml(r, t) + '</td>' : '') +
            '</tr>'
          );
        })
        .join('');
    }

    return (
      '<div class="dt-table-wrap">' +
      '<table class="dt-table">' +
      '<thead><tr class="border-b">' +
      '<th class="dt-th w-12"><label class="dt-checkbox" data-dt-check-all>' +
      checkboxHtml(allPageSelected, !allPageSelected && somePageSelected, 'data-dt-check-all') +
      '</label></th>' +
      visCols
        .map(function (c) {
          var cls = 'dt-th' + (c.headerClass ? ' ' + c.headerClass : '');
          if (c.sortable === false) {
            return '<th class="' + cls + '">' + esc(text(c.label, t)) + '</th>';
          }
          return '<th class="' + cls + '">' + sortBtnHtml(inst, t, c) + '</th>';
        })
        .join('') +
      (hasActions ? '<th class="dt-th"></th>' : '') +
      '</tr></thead>' +
      '<tbody>' +
      bodyHtml +
      '</tbody>' +
      '</table></div>'
    );
  }

  /* ---------- 渲染入口 ---------- */
  export function render(inst, t) {
    return toolbarHtml(inst, t) + tableHtml(inst, t) + paginationHtml(inst, t) + bulkBarHtml(inst, t);
  }

  export function rerender(inst) {
    var root = document.querySelector('[data-dt-id="' + inst.id + '"]');
    if (root && inst.t) root.innerHTML = render(inst, inst.t);
  }
