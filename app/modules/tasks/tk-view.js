/* ============================================================
 * tk-view.js — tasks 模块·视图域(主区域渲染 + 抽屉/弹窗 + 保存编排)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为视图控制:
 * - renderTasks(t):主区域(标题/操作按钮/表格容器/弹层挂载点)
 * - drawerBody / confirmHtml / renderDialog:抽屉与确认弹窗
 * - openDrawer / saveDraft:弹窗流程编排(数据变更经 tk-store)
 * 依赖:tk-data.js(转义/选项)、tk-store.js(状态/表格/变更)。
 * 方向:data ← cells ← store ← view。
 * ============================================================ */
'use strict';

import {
  esc,
  LABELS,
  STATUSES,
  PRIORITIES,
  byValue,
} from './tk-data.js';
import {
  state,
  draft,
  draftError,
  bulkDeleteInput,
  table,
  mutateRow,
  createTask,
} from './tk-store.js';

var icon = function () {
  return App.icon;
};

function moduleT(locale) {
  return App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.tasks);
}

/* ---------- 渲染:主区域 ---------- */
export function renderTasks(t) {
  return (
    '<div class="mx-auto flex max-w-6xl flex-1 flex-col gap-4 sm:gap-6">' +
    '<div class="flex flex-wrap items-end justify-between gap-2">' +
    '<div>' +
    '<h2 class="text-2xl font-bold tracking-tight font-heading">' +
    t('tasks.title') +
    '</h2>' +
    '<p class="text-muted-foreground">' +
    t('tasks.desc') +
    '</p>' +
    '</div>' +
    '<div class="flex gap-2">' +
    '<button type="button" data-task-open="import" data-slot="button" class="' +
    App.ui.buttonClass('outline') +
    '">' +
    '<span>' +
    t('tasks.import') +
    '</span> ' +
    icon().iconSvg('download', { class: 'size-4' }) +
    '</button>' +
    '<button type="button" data-task-open="create" data-slot="button" class="' +
    App.ui.buttonClass('default') +
    '">' +
    '<span>' +
    t('tasks.create') +
    '</span> ' +
    icon().iconSvg('plus', { class: 'size-4' }) +
    '</button>' +
    '</div></div>' +
    '<div class="flex flex-1 flex-col gap-4" data-dt-id="tasks">' +
    table.render(t) +
    '</div>' +
    '<div data-tasks-dialog-root></div>' +
    '</div>'
  );
}

/* ---------- 弹层:抽屉(新建/编辑) ---------- */
function drawerBody(t) {
  var isUpdate = !!state.currentRow;
  var statusDd = STATUSES.map(function (s) {
    return (
      '<button type="button" data-draft-field="status" data-value="' +
      s.value +
      '" class="' +
      App.ui.dropdownItemClass(
        draft.status === s.value ? ' bg-accent text-accent-foreground' : ''
      ) +
      '">' +
      (s.icon
        ? '<span class="text-muted-foreground">' +
          icon().iconSvg(s.icon, { class: 'size-4' }) +
          '</span>'
        : '') +
      s.label +
      (draft.status === s.value ? icon().iconSvg('check', { class: 'size-4' }) : '') +
      '</button>'
    );
  }).join('');
  var labelRadio = LABELS.map(function (l) {
    return (
      '<label class="tk-radio">' +
      '<input type="radio" name="tk-label" data-draft-radio="label" value="' +
      l.value +
      '"' +
      (draft.label === l.value ? ' checked' : '') +
      ' />' +
      '<span class="tk-radio-dot"></span>' +
      '<span class="text-sm">' +
      l.label +
      '</span>' +
      '</label>'
    );
  }).join('');
  var priRadio = PRIORITIES.map(function (p) {
    return (
      '<label class="tk-radio">' +
      '<input type="radio" name="tk-priority" data-draft-radio="priority" value="' +
      p.value +
      '"' +
      (draft.priority === p.value ? ' checked' : '') +
      ' />' +
      '<span class="tk-radio-dot"></span>' +
      '<span class="text-sm">' +
      p.label +
      '</span>' +
      '</label>'
    );
  }).join('');
  return (
    '<div class="flex flex-1 flex-col overflow-hidden">' +
    '<div class="px-6 pt-6">' +
    '<h3 class="text-lg font-semibold">' +
    (isUpdate ? t('tasks.drawer.updateTitle') : t('tasks.drawer.createTitle')) +
    '</h3>' +
    '<p class="mt-1 text-sm text-muted-foreground">' +
    (isUpdate ? t('tasks.drawer.updateDesc') : t('tasks.drawer.createDesc')) +
    '</p>' +
    '</div>' +
    '<div class="tk-drawer-body">' +
    '<div class="tk-field">' +
    '<label class="tk-label">' +
    t('tasks.drawer.title') +
    '</label>' +
    '<input type="text" data-draft-title value="' +
    esc(draft.title) +
    '" placeholder="' +
    t('tasks.drawer.titlePlaceholder') +
    '" class="' + App.ui.inputClass() + '" />' +
    (draftError.title ? '<p class="tk-error">' + draftError.title + '</p>' : '') +
    '</div>' +
    '<div class="tk-field">' +
    '<label class="tk-label">' +
    t('tasks.drawer.status') +
    '</label>' +
    '<div class="relative" data-dropdown>' +
    '<button type="button" data-dropdown-trigger class="' + App.ui.inputClass('tk-select-trigger') + '">' +
    '<span class="' +
    (draft.status ? '' : 'tk-placeholder') +
    '">' +
    (draft.status
      ? (byValue(STATUSES, draft.status) || {}).label
      : t('tasks.drawer.statusPlaceholder')) +
    '</span>' +
    icon().iconSvg('chevrons-up-down', { class: 'size-3.5 text-muted-foreground' }) +
    '</button>' +
    '<div data-dropdown-menu class="' +
    App.ui.dropdownContentClass('w-full min-w-40') +
    '">' +
    statusDd +
    '</div>' +
    '</div>' +
    (draftError.status ? '<p class="tk-error">' + draftError.status + '</p>' : '') +
    '</div>' +
    '<div class="tk-field">' +
    '<label class="tk-label">' +
    t('tasks.drawer.label') +
    '</label>' +
    '<div class="flex flex-col space-y-1">' +
    labelRadio +
    '</div>' +
    (draftError.label ? '<p class="tk-error">' + draftError.label + '</p>' : '') +
    '</div>' +
    '<div class="tk-field">' +
    '<label class="tk-label">' +
    t('tasks.drawer.priority') +
    '</label>' +
    '<div class="flex flex-col space-y-1">' +
    priRadio +
    '</div>' +
    (draftError.priority ? '<p class="tk-error">' + draftError.priority + '</p>' : '') +
    '</div>' +
    '</div>' +
    '<div class="tk-drawer-footer">' +
    '<button type="button" data-task-dialog-close data-slot="button" class="' +
    App.ui.buttonClass('outline') +
    '">' +
    t('tasks.drawer.close') +
    '</button>' +
    '<button type="button" data-task-drawer-save data-slot="button" class="' +
    App.ui.buttonClass('default') +
    '">' +
    t('tasks.drawer.save') +
    '</button>' +
    '</div>' +
    '</div>'
  );
}

export function openDrawer(mode, row) {
  state.dialog = mode;
  state.currentRow = row || null;
  draft.title = row ? row.title : '';
  draft.status = row ? row.status : '';
  draft.label = row ? row.label : '';
  draft.priority = row ? row.priority : '';
  Object.keys(draftError).forEach(function (k) {
    delete draftError[k];
  });
  renderDialog();
}

/* ---------- 弹层:确认(单删/多删)与导入 ---------- */
function confirmHtml(t) {
  if (state.dialog === 'delete') {
    var row = state.currentRow;
    return {
      head:
        '<span class="flex size-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">' +
        icon().iconSvg('triangle-alert', { class: 'size-4' }) +
        '</span>' +
        '<h3 class="text-base font-semibold text-destructive">' +
        t('tasks.deleteTitle', row.id) +
        '</h3>',
      body:
        '<p class="text-sm text-muted-foreground">' +
        t('tasks.deleteDescBefore') +
        ' <strong>' +
        row.id +
        '</strong>. ' +
        t('tasks.deleteDescAfter') +
        '</p>',
      foot:
        '<button type="button" data-task-dialog-close data-slot="button" class="' +
        App.ui.buttonClass('outline') +
        '">' +
        t('tasks.deleteCancel') +
        '</button>' +
        '<button type="button" data-task-confirm-delete data-slot="button" class="' +
        App.ui.buttonClass('destructive') +
        '">' +
        t('tasks.deleteConfirm') +
        '</button>',
    };
  }
  if (state.dialog === 'bulk-delete') {
    var n = table.selectedCount();
    return {
      head:
        '<span class="flex size-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">' +
        icon().iconSvg('triangle-alert', { class: 'size-4' }) +
        '</span>' +
        '<h3 class="text-base font-semibold text-destructive">' +
        t(n > 1 ? 'tasks.bulkDeleteTitlePlural' : 'tasks.bulkDeleteTitle', n) +
        '</h3>',
      body:
        '<p class="mb-4 text-sm text-muted-foreground">' +
        t('tasks.bulkDeleteDesc') +
        '</p>' +
        '<label class="tk-field">' +
        '<span class="tk-label">' +
        t('tasks.bulkDeleteType', 'DELETE') +
        '</span>' +
        '<input type="text" data-task-bulk-delete-input value="' +
        esc(bulkDeleteInput) +
        '" placeholder="' +
        t('tasks.bulkDeletePlaceholder') +
        '" class="' + App.ui.inputClass() + '" />' +
        '</label>' +
        '<div class="tk-alert">' +
        '<strong>' +
        t('tasks.warningTitle') +
        '</strong>' +
        '<p class="text-sm">' +
        t('tasks.warningDesc') +
        '</p>' +
        '</div>',
      foot:
        '<button type="button" data-task-dialog-close data-slot="button" class="' +
        App.ui.buttonClass('outline') +
        '">' +
        t('tasks.deleteCancel') +
        '</button>' +
        '<button type="button" data-task-confirm-bulk-delete data-slot="button" class="' +
        App.ui.buttonClass('destructive') +
        '"' +
        (bulkDeleteInput !== 'DELETE' ? ' disabled' : '') +
        '>' +
        t('tasks.deleteConfirm') +
        '</button>',
    };
  }
  if (state.dialog === 'import') {
    return {
      head: '<h3 class="text-base font-semibold">' + t('tasks.importTitle') + '</h3>',
      body:
        '<p class="text-sm text-muted-foreground">' +
        t('tasks.importDesc') +
        '</p>' +
        '<div class="tk-field">' +
        '<label class="tk-label">' +
        t('tasks.importFile') +
        '</label>' +
        '<input type="file" data-task-import-file accept=".csv,text/csv" class="' + App.ui.inputClass('tk-file') + '" />' +
        '<p class="tk-file-hint">' +
        t('tasks.importHint') +
        '</p>' +
        '</div>',
      foot:
        '<button type="button" data-task-dialog-close data-slot="button" class="' +
        App.ui.buttonClass('outline') +
        '">' +
        t('tasks.importClose') +
        '</button>' +
        '<button type="button" data-task-confirm-import data-slot="button" class="' +
        App.ui.buttonClass('default') +
        '">' +
        t('tasks.importConfirm') +
        '</button>',
    };
  }
  return '';
}

export function renderDialog() {
  var holder = document.querySelector('[data-tasks-dialog-root]');
  if (!holder) return;
  if (!state.dialog) {
    App.ui.closeDialog();
    holder.innerHTML = '';
    return;
  }
  var t = moduleT(App.getShellContext().settings.locale);
  if (state.dialog === 'create' || state.dialog === 'update') {
    holder.innerHTML =
      '<div class="tk-overlay tk-overlay-drawer" data-task-overlay>' +
      '<div class="tk-drawer" role="dialog" aria-modal="true">' +
      drawerBody(t) +
      '</div></div>';
    return;
  }
  var dlg = confirmHtml(t);
  App.ui.dialog({ head: dlg.head, body: dlg.body, foot: dlg.foot });
}

/* ---------- 保存草稿(新建/更新编排) ---------- */
export function saveDraft() {
  var t = moduleT(App.getShellContext().settings.locale);
  Object.keys(draftError).forEach(function (k) {
    delete draftError[k];
  });
  if (!draft.title.trim()) draftError.title = t('tasks.drawer.errTitle');
  if (!draft.status) draftError.status = t('tasks.drawer.errStatus');
  if (!draft.label) draftError.label = t('tasks.drawer.errLabel');
  if (!draft.priority) draftError.priority = t('tasks.drawer.errPriority');
  if (Object.keys(draftError).length) {
    renderDialog();
    return;
  }
  if (state.currentRow) {
    mutateRow(state.currentRow.id, {
      title: draft.title.trim(),
      status: draft.status,
      label: draft.label,
      priority: draft.priority,
    });
    App.ui.toast('Task ' + state.currentRow.id + ' has been updated.', 'default');
  } else {
    var nid = createTask({
      title: draft.title.trim(),
      status: draft.status,
      label: draft.label,
      priority: draft.priority,
    });
    table.setPage(1);
    App.ui.toast('Task ' + nid + ' has been created.', 'default');
  }
  state.dialog = null;
  state.currentRow = null;
  renderDialog();
  table.refresh();
}
