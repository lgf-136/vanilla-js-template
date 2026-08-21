/* ============================================================
 * parts.js — 表格外围部件渲染：分页（页码省略号）+ 批量操作浮动条
 *             （自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责：paginationHtml / bulkBarHtml 及页码省略号纯函数 pageNumbers。
 * 依赖 store 的 pageCount / selectedCount 派生；esc/ic/text 复用 toolbar 导出。
 * ============================================================ */
'use strict';

import { pageCount, selectedCount } from './store.js';
import { esc, ic, text } from './toolbar.js';

  /* ---------- 页码省略号 ---------- */
  function pageNumbers(current, total) {
    var max = 5;
    var out = [];
    if (total <= max) {
      for (var i = 1; i <= total; i++) out.push(i);
    } else {
      out.push(1);
      if (current <= 3) {
        for (var j = 2; j <= 4; j++) out.push(j);
        out.push('...', total);
      } else if (current >= total - 2) {
        out.push('...');
        for (var k = total - 3; k <= total; k++) out.push(k);
      } else {
        out.push('...');
        for (var m = current - 1; m <= current + 1; m++) out.push(m);
        out.push('...', total);
      }
    }
    return out;
  }

  /* ---------- 渲染:分页 ---------- */
  export function paginationHtml(inst, t) {
    var current = inst.state.page;
    var total = pageCount(inst);
    var nums = pageNumbers(current, total);
    var btnBase =
      'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';
    return (
      '<div class="dt-pagination">' +
      '<div class="flex items-center gap-2">' +
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8 w-20') +
      '">' +
      '<span>' +
      inst.state.pageSize +
      '</span>' +
      ic('chevrons-up-down', 'size-3.5') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('min-w-16') +
      '">' +
      (inst.opts.pageSizeOptions || [10, 20, 30, 40, 50])
        .map(function (n) {
          return (
            '<button type="button" data-dt-page-size="' +
            n +
            '" class="' +
            App.ui.dropdownItemClass() +
            '">' +
            n +
            '</button>'
          );
        })
        .join('') +
      '</div></div>' +
      '<p class="hidden text-sm font-medium sm:block">' +
      t('dataTable.rowsPerPage') +
      '</p>' +
      '</div>' +
      '<div class="flex items-center gap-1 sm:space-x-1">' +
      '<span class="hidden w-28 text-center text-sm font-medium sm:block">' +
      t('dataTable.pageOf', current + ' / ' + total) +
      '</span>' +
      '<button type="button" data-dt-page="first" class="' +
      btnBase +
      '" ' +
      (current === 1 ? 'disabled' : '') +
      ' aria-label="' +
      t('dataTable.firstPage') +
      '">' +
      ic('chevrons-left', 'size-4') +
      '</button>' +
      '<button type="button" data-dt-page="prev" class="' +
      btnBase +
      '" ' +
      (current === 1 ? 'disabled' : '') +
      ' aria-label="' +
      t('dataTable.prevPage') +
      '">' +
      ic('chevron-left', 'size-4') +
      '</button>' +
      nums
        .map(function (n) {
          if (n === '...') {
            return '<span class="px-1 text-sm text-muted-foreground">...</span>';
          }
          return (
            '<button type="button" data-dt-page="' +
            n +
            '" class="' +
            btnBase +
            ' ' +
            (current === n
              ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80'
              : 'bg-background hover:bg-muted') +
            '" aria-label="' +
            t('dataTable.goToPage', n) +
            '">' +
            n +
            '</button>'
          );
        })
        .join('') +
      '<button type="button" data-dt-page="next" class="' +
      btnBase +
      '" ' +
      (current >= total ? 'disabled' : '') +
      ' aria-label="' +
      t('dataTable.nextPage') +
      '">' +
      ic('chevron-right', 'size-4') +
      '</button>' +
      '<button type="button" data-dt-page="last" class="' +
      btnBase +
      '" ' +
      (current >= total ? 'disabled' : '') +
      ' aria-label="' +
      t('dataTable.lastPage') +
      '">' +
      ic('chevrons-right', 'size-4') +
      '</button>' +
      '</div></div>'
    );
  }

  /* ---------- 渲染:批量操作浮动条 ---------- */
  export function bulkBarHtml(inst, t) {
    var opts = inst.opts;
    var bulk = opts.bulk;
    var count = selectedCount(inst);
    if (!count) return '';
    var groups = (bulk && bulk.groups) || [];
    var items = (bulk && bulk.items) || [];
    return (
      '<div role="toolbar" class="dt-bulk-bar">' +
      '<button type="button" data-dt-clear-selection data-slot="button" class="' +
      App.ui.buttonClass('outline', 'icon', 'size-6 rounded-full!') +
      '" aria-label="' +
      t('dataTable.clearSelection') +
      '" data-tip="' +
      t('dataTable.clearSelection') +
      '">' +
      ic('x', 'size-4') +
      '</button>' +
      '<span class="mx-1 h-5 w-px bg-border"></span>' +
      '<div class="flex items-center gap-1 text-sm">' +
      '<span class="rounded-lg bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">' +
      count +
      '</span>' +
      '<span class="hidden sm:inline">' +
      t(count > 1 ? 'dataTable.selectedMany' : 'dataTable.selectedOne', count) +
      '</span>' +
      '</div>' +
      '<span class="mx-1 h-5 w-px bg-border"></span>' +
      groups
        .map(function (g) {
          var gLabel = text(g.label, t);
          return (
            '<div class="relative" data-dropdown>' +
            '<button type="button" data-dropdown-trigger data-slot="button" class="' +
            App.ui.buttonClass('outline', 'icon', 'size-8 rounded-md!') +
            '" data-tip="' +
            esc(gLabel) +
            '" aria-label="' +
            esc(gLabel) +
            '">' +
            ic(g.icon, 'size-4') +
            '</button>' +
            '<div data-dropdown-menu class="' +
            App.ui.dropdownContentClass('min-w-40') +
            '">' +
            (g.options || [])
              .map(function (o) {
                return (
                  '<button type="button" data-dt-bulk-group="' +
                  g.action +
                  '" data-value="' +
                  esc(o.value) +
                  '" class="' +
                  App.ui.dropdownItemClass() +
                  '">' +
                  (o.icon
                    ? '<span class="text-muted-foreground">' + ic(o.icon, 'size-4') + '</span>'
                    : '') +
                  esc(o.label) +
                  '</button>'
                );
              })
              .join('') +
            '</div></div>'
          );
        })
        .join('') +
      items
        .map(function (it) {
          var itLabel = text(it.label, t);
          return (
            '<button type="button" data-dt-bulk-item="' +
            it.action +
            '" data-slot="button" class="' +
            App.ui.buttonClass(it.variant || 'outline', 'icon', 'size-8 rounded-md!') +
            '" data-tip="' +
            esc(itLabel) +
            '" aria-label="' +
            esc(itLabel) +
            '">' +
            ic(it.icon, 'size-4') +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }
