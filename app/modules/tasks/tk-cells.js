/* ============================================================
 * tk-cells.js — tasks 模块·单元格渲染域
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为表格单元格渲染:
 * labelBadge / statusCell / priorityCell 与行操作下拉菜单
 * rowActionsHtml(含标签子菜单,事件由 tk-events 委托)。
 * 依赖:tk-data.js(选项与转义),App.ui / App.icon。
 * 方向:data ← cells。
 * ============================================================ */
'use strict';

import { esc, LABELS, STATUSES, PRIORITIES, byValue } from './tk-data.js';

var icon = function () {
  return App.icon;
};

export function labelBadge(value) {
  var l = byValue(LABELS, value);
  return l
    ? '<span class="' + App.ui.badgeClass('outline') + '">' + l.label + '</span>'
    : '';
}

export function statusCell(t) {
  var s = byValue(STATUSES, t.status);
  if (!s) return '';
  return (
    '<div class="flex w-28 items-center gap-2">' +
    icon().iconSvg(s.icon, { class: 'size-4 text-muted-foreground' }) +
    '<span>' +
    s.label +
    '</span></div>'
  );
}

export function priorityCell(t) {
  var p = byValue(PRIORITIES, t.priority);
  if (!p) return '';
  return (
    '<div class="flex items-center gap-2">' +
    icon().iconSvg(p.icon, { class: 'size-4 text-muted-foreground' }) +
    '<span>' +
    p.label +
    '</span></div>'
  );
}

/* ---------- 行操作菜单(业务部分,事件仍由本模块委托) ---------- */
export function rowActionsHtml(t, row) {
  var sub = LABELS.map(function (l) {
    return (
      '<button type="button" data-task-row-label="' +
      row.id +
      '" data-value="' +
      l.value +
      '" class="' +
      App.ui.dropdownItemClass(row.label === l.value ? ' bg-accent text-accent-foreground' : '') +
      '">' +
      l.label +
      (row.label === l.value ? icon().iconSvg('check', { class: 'size-4' }) : '') +
      '</button>'
    );
  }).join('');
  return (
    '<div class="relative text-right" data-dropdown>' +
    '<button type="button" data-dropdown-trigger data-slot="button" data-task-row-menu="' +
    row.id +
    '" aria-label="' +
    t('tasks.openMenu') +
    '" class="' +
    App.ui.buttonClass('ghost', 'icon', 'size-8') +
    '">' +
    icon().iconSvg('ellipsis', { class: 'size-4' }) +
    '</button>' +
    '<div data-dropdown-menu class="' +
    App.ui.dropdownContentClass('w-40 right-0!') +
    '">' +
    '<button type="button" data-task-row-edit="' +
    row.id +
    '" class="' +
    App.ui.dropdownItemClass() +
    '">' +
    t('tasks.row.edit') +
    '</button>' +
    '<button type="button" disabled class="' +
    App.ui.dropdownItemClass('data-[disabled]:opacity-50') +
    '">' +
    t('tasks.row.copy') +
    '</button>' +
    '<button type="button" disabled class="' +
    App.ui.dropdownItemClass('data-[disabled]:opacity-50') +
    '">' +
    t('tasks.row.favorite') +
    '</button>' +
    App.ui.dropdownSeparator() +
    '<div class="relative" data-dropdown>' +
    '<button type="button" data-dropdown-trigger class="' +
    App.ui.dropdownItemClass('w-full') +
    '">' +
    t('tasks.row.labels') +
    icon().iconSvg('chevron-right', { class: 'ms-auto size-4' }) +
    '</button>' +
    '<div data-dropdown-menu class="' +
    App.ui.dropdownContentClass('w-36') +
    '">' +
    sub +
    '</div>' +
    '</div>' +
    App.ui.dropdownSeparator() +
    '<button type="button" data-task-row-delete="' +
    row.id +
    '" class="' +
    App.ui.dropdownItemClass(
      'text-destructive! focus-visible:text-destructive! data-[highlighted]:text-destructive!'
    ) +
    '">' +
    t('tasks.row.delete') +
    icon().iconSvg('trash-2', { class: 'ms-auto size-4' }) +
    '</button>' +
    '</div></div>'
  );
}
