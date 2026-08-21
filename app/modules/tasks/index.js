/* ============================================================
 * tasks 模块 — 实现(懒加载,首次访问 #/tasks 时下载)
 * 复刻参考项目 shadcn-admin 的 Tasks 页(数据表格):
 * - 表格本体(搜索/过滤/排序/选择/批量/分页)已提取为公共组件
 *   App.ui.dataTable(见 app/components/ui/data-table.js)
 * - 本模块只保留业务:任务数据、行操作菜单、新建/编辑抽屉、导入/删除确认弹窗
 * 零依赖自研,数据为固定种子生成的 100 条任务。
 * ============================================================ */
(function () {
  'use strict';

  var icon = function () {
    return App.icon;
  };

  /* ---------- 选项定义(与参考项目一致) ---------- */
  var LABELS = [
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
    { value: 'documentation', label: 'Documentation' },
  ];
  var STATUSES = [
    { value: 'backlog', label: 'Backlog', icon: 'circle-help' },
    { value: 'todo', label: 'Todo', icon: 'circle' },
    { value: 'in progress', label: 'In Progress', icon: 'timer' },
    { value: 'done', label: 'Done', icon: 'circle-check' },
    { value: 'canceled', label: 'Canceled', icon: 'circle-off' },
  ];
  var PRIORITIES = [
    { value: 'low', label: 'Low', icon: 'arrow-down' },
    { value: 'medium', label: 'Medium', icon: 'arrow-right' },
    { value: 'high', label: 'High', icon: 'arrow-up' },
    { value: 'critical', label: 'Critical', icon: 'circle-alert' },
  ];
  var PAGE_SIZES = [10, 20, 30, 40, 50];

  function byValue(arr, v) {
    for (var i = 0; i < arr.length; i++) if (arr[i].value === v) return arr[i];
    return null;
  }

  /* ---------- 固定种子任务数据(100 条,每次加载一致) ---------- */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(20240817);
  function pick(arr) {
    return arr[Math.floor(rnd() * arr.length)];
  }
  function int(min, max) {
    return Math.floor(rnd() * (max - min + 1)) + min;
  }
  var WORDS = [
    'implement',
    'design',
    'review',
    'refactor',
    'optimize',
    'document',
    'fix',
    'integrate',
    'migrate',
    'configure',
    'validate',
    'monitor',
    'dashboard',
    'checkout',
    'payment',
    'auth',
    'session',
    'webhook',
    'notification',
    'search',
    'filter',
    'pagination',
    'sidebar',
    'layout',
    'theme',
    'component',
    'table',
    'form',
    'dialog',
    'toast',
    'export',
    'import',
    'endpoint',
    'database',
    'schema',
    'migration',
    'index',
    'caching',
    'rate-limit',
    'logging',
    'error-handling',
    'responsive',
    'accessibility',
    'dark-mode',
    'onboarding',
    'billing',
    'subscription',
    'reporting',
    'analytics',
    'sync',
    'batch',
    'queue',
    'upload',
    'preview',
  ];
  var VERBS = [
    'flow',
    'page',
    'system',
    'module',
    'service',
    'view',
    'pipeline',
    'workflow',
    'API',
    'UX',
    'UI',
    'panel',
    'modal',
    'card',
    'screen',
  ];
  function title() {
    var w = pick(WORDS);
    var v = pick(VERBS);
    return w.charAt(0).toUpperCase() + w.slice(1) + ' ' + v + ' #' + int(1, 99);
  }
  var TASKS = [];
  var usedIds = {};
  for (var i = 0; i < 100; i++) {
    var id;
    do {
      id = 'TASK-' + int(1000, 9999);
    } while (usedIds[id]);
    usedIds[id] = true;
    TASKS.push({
      id: id,
      title: title(),
      status: pick(STATUSES).value,
      label: pick(LABELS).value,
      priority: pick(PRIORITIES).value,
    });
  }

  /* ---------- 转义 ---------- */
  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;

  /* ---------- 单元格渲染 ---------- */
  function labelBadge(value) {
    var l = byValue(LABELS, value);
    return l
      ? '<span class="' + App.ui.badgeClass('outline') + '">' + l.label + '</span>'
      : '';
  }

  function statusCell(t) {
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

  function priorityCell(t) {
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
  function rowActionsHtml(t, row) {
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

  /* ---------- 表格实例(公共组件) ---------- */
  var table = App.ui.dataTable({
    id: 'tasks',
    data: function () {
      return TASKS;
    },
    rowKey: 'id',
    searchPlaceholder: function (t) {
      return t('tasks.searchPlaceholder');
    },
    searchKeys: ['id', 'title'],
    columns: [
      {
        key: 'id',
        label: function (t) {
          return t('tasks.col.task');
        },
        sortable: false,
        hideable: false,
        cellClass: 'w-20 text-muted-foreground',
        render: function (r) {
          return esc(r.id);
        },
      },
      {
        key: 'title',
        label: function (t) {
          return t('tasks.col.title');
        },
        render: function (r) {
          return (
            '<div class="flex items-center space-x-2">' +
            labelBadge(r.label) +
            '<span class="truncate font-medium">' +
            esc(r.title) +
            '</span></div>'
          );
        },
      },
      {
        key: 'status',
        label: function (t) {
          return t('tasks.col.status');
        },
        render: function (r) {
          return statusCell(r);
        },
      },
      {
        key: 'priority',
        label: function (t) {
          return t('tasks.col.priority');
        },
        render: function (r) {
          return priorityCell(r);
        },
      },
    ],
    filters: [
      {
        key: 'status',
        label: function (t) {
          return t('tasks.filter.status');
        },
        options: STATUSES,
      },
      {
        key: 'priority',
        label: function (t) {
          return t('tasks.filter.priority');
        },
        options: PRIORITIES,
      },
    ],
    pageSizeOptions: PAGE_SIZES,
    bulk: {
      groups: [
        {
          action: 'status',
          label: function (t) {
            return t('tasks.bulkStatus');
          },
          icon: 'circle-arrow-up',
          options: STATUSES,
        },
        {
          action: 'priority',
          label: function (t) {
            return t('tasks.bulkPriority');
          },
          icon: 'arrow-up-down',
          options: PRIORITIES,
        },
      ],
      items: [
        {
          action: 'export',
          label: function (t) {
            return t('tasks.bulkExport');
          },
          icon: 'download',
        },
        {
          action: 'delete',
          label: function (t) {
            return t('tasks.bulkDelete');
          },
          icon: 'trash-2',
          variant: 'destructive',
        },
      ],
      onGroup: function (action, value, rows) {
        rows.forEach(function (r) {
          mutateRow(r.id, action === 'status' ? { status: value } : { priority: value });
        });
        table.clearSelection();
        App.ui.toast(
          (action === 'status'
            ? 'Status updated to "' + (byValue(STATUSES, value) || {}).label + '" for '
            : 'Priority updated to "' + (byValue(PRIORITIES, value) || {}).label + '" for ') +
            rows.length +
            (rows.length > 1 ? ' tasks.' : ' task.'),
          'default'
        );
      },
      onItem: function (action, rows) {
        if (action === 'export') {
          table.clearSelection();
          App.ui.toast(
            'Exported ' + rows.length + (rows.length > 1 ? ' tasks' : ' task') + ' to CSV.',
            'default'
          );
        } else if (action === 'delete') {
          state.dialog = 'bulk-delete';
          bulkDeleteInput = '';
          renderDialog();
        }
      },
    },
    rowActionsHtml: function (row, t) {
      return rowActionsHtml(t, row);
    },
  });

  /* ---------- 弹层状态 ---------- */
  var state = {
    dialog: null, // create | update | import | delete | bulk-delete
    currentRow: null,
  };

  /* ---------- 渲染:主区域 ---------- */
  function render(route, ctx) {
    var t = ctx.t;
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
  var draft = { title: '', status: '', label: '', priority: '' };
  var draftError = {};

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

  function openDrawer(mode, row) {
    state.dialog = mode;
    state.currentRow = row || null;
    draft = {
      title: row ? row.title : '',
      status: row ? row.status : '',
      label: row ? row.label : '',
      priority: row ? row.priority : '',
    };
    draftError = {};
    renderDialog();
  }

  /* ---------- 弹层:确认(单删/多删)与导入 ---------- */
  var bulkDeleteInput = '';

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

  function renderDialog() {
    var holder = document.querySelector('[data-tasks-dialog-root]');
    if (!holder) return;
    if (!state.dialog) {
      App.ui.closeDialog();
      holder.innerHTML = '';
      return;
    }
    var locale = App.getShellContext().settings.locale;
    var t = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.tasks);
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

  /* ---------- 数据变更 ---------- */
  function mutateRow(id, patch) {
    for (var i = 0; i < TASKS.length; i++) {
      if (TASKS[i].id === id) {
        TASKS[i] = Object.assign({}, TASKS[i], patch);
        break;
      }
    }
  }

  /* ---------- 事件委托(仅保留业务部分;表格交互由 data-table 组件托管) ---------- */
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var inDialog = !!target.closest('[data-tasks-dialog-root]');

    // 打开弹层
    var openBtn = target.closest('[data-task-open]');
    if (openBtn) {
      if (openBtn.getAttribute('data-task-open') === 'create') openDrawer('create', null);
      else state.dialog = 'import';
      renderDialog();
      return;
    }
    // 行操作
    var rowEdit = target.closest('[data-task-row-edit]');
    if (rowEdit) {
      var editId = rowEdit.getAttribute('data-task-row-edit');
      var editRow = null;
      for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === editId) editRow = TASKS[i];
      if (editRow) openDrawer('update', editRow);
      return;
    }
    var rowDelete = target.closest('[data-task-row-delete]');
    if (rowDelete) {
      var delId = rowDelete.getAttribute('data-task-row-delete');
      var delRow = null;
      for (var j = 0; j < TASKS.length; j++) if (TASKS[j].id === delId) delRow = TASKS[j];
      if (delRow) {
        state.dialog = 'delete';
        state.currentRow = delRow;
        renderDialog();
      }
      return;
    }
    var rowLabel = target.closest('[data-task-row-label]');
    if (rowLabel) {
      mutateRow(rowLabel.getAttribute('data-task-row-label'), {
        label: rowLabel.getAttribute('data-value'),
      });
      table.refresh();
      return;
    }
    // 抽屉保存
    var drawerSave = target.closest('[data-task-drawer-save]');
    if (drawerSave) {
      saveDraft();
      return;
    }
    var dialogField = target.closest('[data-draft-field]');
    if (dialogField) {
      draft[dialogField.getAttribute('data-draft-field')] = dialogField.getAttribute('data-value');
      renderDialog();
      return;
    }
    // 弹层关闭/确认
    var dialogClose = target.closest('[data-task-dialog-close]');
    if (dialogClose) {
      state.dialog = null;
      state.currentRow = null;
      renderDialog();
      return;
    }
    var confirmDelete = target.closest('[data-task-confirm-delete]');
    if (confirmDelete) {
      var delRow2 = state.currentRow;
      TASKS = TASKS.filter(function (x) {
        return x.id !== delRow2.id;
      });
      state.dialog = null;
      state.currentRow = null;
      renderDialog();
      table.clearSelection();
      App.ui.toast('The task ' + delRow2.id + ' has been deleted.', 'default');
      return;
    }
    var confirmBulk = target.closest('[data-task-confirm-bulk-delete]');
    if (confirmBulk) {
      if (bulkDeleteInput !== 'DELETE') {
        App.ui.toast('Please type "DELETE" to confirm.', 'error');
        return;
      }
      var rows3 = table.selected();
      var ids3 = rows3.map(function (r) {
        return r.id;
      });
      TASKS = TASKS.filter(function (x) {
        return ids3.indexOf(x.id) === -1;
      });
      state.dialog = null;
      state.currentRow = null;
      renderDialog();
      table.clearSelection();
      App.ui.toast('Deleted ' + rows3.length + (rows3.length > 1 ? ' tasks.' : ' task.'), 'default');
      return;
    }
    var confirmImport = target.closest('[data-task-confirm-import]');
    if (confirmImport) {
      var fileInput = document.querySelector('[data-task-import-file]');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        App.ui.toast('Please upload a file.', 'error');
        return;
      }
      if (!/csv/.test((file.type || file.name).toLowerCase())) {
        App.ui.toast('Please upload csv format.', 'error');
        return;
      }
      state.dialog = null;
      renderDialog();
      App.ui.toast('Imported "' + file.name + '" (' + file.size + ' bytes).', 'default');
      return;
    }
    var overlay = target.closest('[data-task-overlay]');
    if (overlay && inDialog && target === overlay) {
      state.dialog = null;
      state.currentRow = null;
      renderDialog();
      return;
    }
  });

  /* ---------- 输入事件委托(草稿/确认词;搜索与过滤搜索由组件托管) ---------- */
  document.addEventListener('input', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-draft-title]')) {
      draft.title = target.value;
      return;
    }
    if (target.closest('[data-task-bulk-delete-input]')) {
      bulkDeleteInput = target.value;
      var root = target.closest('[data-tasks-dialog-root]');
      var btn = root ? root.querySelector('[data-task-confirm-bulk-delete]') : null;
      if (btn) btn.disabled = bulkDeleteInput !== 'DELETE';
      return;
    }
  });

  /* 草稿单选框(change 事件,label 包裹隐藏 input) */
  document.addEventListener('change', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-draft-radio]')) {
      draft[target.getAttribute('data-draft-radio')] = target.value;
      renderDialog();
    }
  });

  function saveDraft() {
    var t = App.i18n.makeT(
      App.getShellContext().settings.locale,
      window.__moduleI18n && window.__moduleI18n.tasks
    );
    draftError = {};
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
      var used = {};
      TASKS.forEach(function (x) {
        used[x.id] = true;
      });
      var nid;
      do {
        nid = 'TASK-' + (Math.floor(Math.random() * 9000) + 1000);
      } while (used[nid]);
      TASKS.unshift({
        id: nid,
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

  App.defineModule({ id: 'tasks', render: render });
})();
