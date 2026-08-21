/* ============================================================
 * toolbar.js — 工具栏渲染：搜索框 / 分面过滤 / 列显隐(视图) / 过滤显隐切换
 *               （自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责：表格上方控件区的 HTML 构建；并托管本组件渲染层公共小工具
 *      esc / ic / text（供 parts.js、render.js 复用，避免私有转义副本）。
 * 依赖 store.filteredRows 计算过滤选项计数；不触碰 DOM。
 * ============================================================ */
'use strict';

import { filteredRows } from './store.js';

  /** 统一转义（shared/escape.js，红线 13） */
  export var esc = App.escape.escHtml;
  export function ic(name, cls) {
    return App.icon.iconSvg(name, { class: cls || '' });
  }
  /** 标签支持字符串或函数(t) */
  export function text(v, t) {
    return typeof v === 'function' ? v(t) : v;
  }

  /* ---------- 渲染:分面过滤器 ---------- */
  export function filterListHtml(inst, t, key) {
    var f = null;
    (inst.opts.filters || []).forEach(function (x) {
      if (x.key === key) f = x;
    });
    if (!f) return '';
    var sel = inst.state.filterSel[key] || [];
    var q = (inst.state.filterSearch[key] || '').toLowerCase();
    var visible = (f.options || []).filter(function (o) {
      return String(o.label).toLowerCase().indexOf(q) !== -1;
    });
    var get = f.getValue || function (r) {
      return r[f.key];
    };
    var rows = filteredRows(inst);
    var html = visible
      .map(function (o) {
        var isSel = sel.indexOf(o.value) !== -1;
        var count = rows.filter(function (r) {
          return get(r) === o.value;
        }).length;
        return (
          '<button type="button" data-dt-filter-opt="' +
          key +
          '" data-value="' +
          esc(o.value) +
          '" class="' +
          App.ui.dropdownItemClass('') +
          '">' +
          '<span class="dt-check' +
          (isSel ? ' is-checked' : '') +
          '">' +
          ic('check', 'size-3') +
          '</span>' +
          (o.icon ? '<span class="text-muted-foreground">' + ic(o.icon, 'size-4') + '</span>' : '') +
          '<span>' +
          esc(o.label) +
          '</span>' +
          '<span class="ms-auto font-mono text-xs">' +
          count +
          '</span>' +
          '</button>'
        );
      })
      .join('');
    if (!html) html = '<div class="dt-filter-empty">' + t('dataTable.noFilterResults') + '</div>';
    return html;
  }

  export function filterBtnHtml(inst, t, f) {
    var sel = inst.state.filterSel[f.key] || [];
    var optSearch = inst.state.filterSearch[f.key] || '';
    var title = text(f.label, t);
    var badges = '';
    if (sel.length) {
      badges =
        '<span class="mx-2 h-4 w-px bg-border"></span>' +
        sel
          .map(function (v) {
            var o = null;
            (f.options || []).forEach(function (x) {
              if (x.value === v) o = x;
            });
            return o
              ? '<span class="hidden rounded-sm bg-secondary px-1.5 text-xs font-normal text-secondary-foreground lg:inline-block">' +
                esc(o.label) +
                '</span>'
              : '';
          })
          .join('') +
        (sel.length > 2
          ? '<span class="rounded-sm bg-secondary px-1.5 text-xs font-normal text-secondary-foreground">' +
            sel.length +
            ' selected</span>'
          : '');
    }
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" data-dt-filter="' +
      f.key +
      '" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8 border-dashed') +
      '">' +
      ic('circle-plus', 'size-4') +
      title +
      badges +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-56') +
      '">' +
      App.ui.searchInput.html({
        placeholder: title,
        value: optSearch,
        attrs: 'data-dt-filter-search="' + f.key + '"',
        class: 'dt-filter-search-wrap',
      }) +
      '<div class="dt-filter-list">' +
      filterListHtml(inst, t, f.key) +
      '</div>' +
      (sel.length
        ? App.ui.dropdownSeparator() +
          '<button type="button" data-dt-filter-clear="' +
          f.key +
          '" class="' +
          App.ui.dropdownItemClass('justify-center! text-center') +
          '">' +
          t('dataTable.clearFilters') +
          '</button>'
        : '') +
      '</div></div>'
    );
  }

  /* ---------- 渲染:列显隐(视图) ---------- */
  export function viewBtnHtml(inst, t) {
    var cols = (inst.opts.columns || []).filter(function (c) {
      return c.hideable !== false;
    });
    if (!cols.length) return '';
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-dt-view data-slot="button" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8') +
      '">' +
      ic('sliders-horizontal', 'size-4') +
      t('dataTable.view') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-48') +
      '">' +
      '<div class="' +
      App.ui.dropdownLabelClass('') +
      '">' +
      t('dataTable.toggleCols') +
      '</div>' +
      App.ui.dropdownSeparator() +
      cols
        .map(function (c) {
          var vis = inst.state.visibility[c.key] !== false;
          return (
            '<button type="button" data-dt-view-col="' +
            c.key +
            '" class="' +
            App.ui.dropdownItemClass('') +
            '">' +
            '<span class="dt-check' +
            (vis ? ' is-checked' : '') +
            '">' +
            ic('check', 'size-3') +
            '</span>' +
            '<span class="capitalize">' +
            esc(text(c.label, t)) +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  /* ---------- 渲染:过滤显隐切换(过滤) ---------- */
  export function filterToggleBtnHtml(inst, t) {
    var filters = inst.opts.filters || [];
    if (!filters.length) return '';
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-dt-filter-toggle data-slot="button" class="' +
      App.ui.buttonClass('outline', 'sm', 'h-8') +
      '">' +
      ic('list-filter', 'size-4') +
      t('dataTable.filterToggle') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('w-48') +
      '">' +
      '<div class="' +
      App.ui.dropdownLabelClass('') +
      '">' +
      t('dataTable.toggleFilters') +
      '</div>' +
      App.ui.dropdownSeparator() +
      filters
        .map(function (f) {
          var vis = inst.state.filterVisibility[f.key] !== false;
          return (
            '<button type="button" data-dt-filter-toggle-opt="' +
            f.key +
            '" class="' +
            App.ui.dropdownItemClass('') +
            '">' +
            '<span class="dt-check' +
            (vis ? ' is-checked' : '') +
            '">' +
            ic('check', 'size-3') +
            '</span>' +
            '<span class="capitalize">' +
            esc(text(f.label, t)) +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  /* ---------- 渲染:工具栏 ---------- */
  export function toolbarHtml(inst, t) {
    var opts = inst.opts;
    var isFiltered =
      inst.state.search !== '' ||
      (opts.filters || []).some(function (f) {
        return (inst.state.filterSel[f.key] || []).length;
      });
    return (
      '<div class="flex items-center justify-between">' +
      '<div class="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">' +
      '<div class="dt-search-wrap">' +
      App.ui.searchInput.html({
        placeholder: opts.searchPlaceholder ? text(opts.searchPlaceholder, t) : '',
        value: inst.state.search,
        attrs: 'data-dt-search',
        clearLabel: opts.searchPlaceholder ? text(opts.searchPlaceholder, t) : '',
      }) +
      '</div>' +
      '<div class="flex gap-x-2">' +
      (opts.filters || [])
        .map(function (f) {
          return inst.state.filterVisibility[f.key] !== false ? filterBtnHtml(inst, t, f) : '';
        })
        .join('') +
      '</div>' +
      (isFiltered
        ? '<button type="button" data-dt-reset data-slot="button" class="' +
          App.ui.buttonClass('ghost', 'sm', 'h-8 px-2 lg:px-3') +
          '">' +
          t('dataTable.reset') +
          ic('x', 'ms-2 size-4') +
          '</button>'
        : '') +
      '</div>' +
      '<div class="ms-auto hidden items-center gap-2 lg:flex">' +
      viewBtnHtml(inst, t) +
      filterToggleBtnHtml(inst, t) +
      (opts.toolbarExtra ? text(opts.toolbarExtra, t) : '') +
      '</div>' +
      '</div>'
    );
  }
