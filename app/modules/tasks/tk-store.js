/* ============================================================
 * tk-store.js — tasks 模块·状态域(可变状态 + 表格实例 + 数据变更)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件收敛全部可变状态:
 * - TASKS 数组(种子生成,增删改入口:mutateRow/deleteRowByIds/createTask)
 * - 弹层状态 state{ dialog, currentRow }、草稿 draft、draftError、bulkDeleteInput
 * - 表格实例 table(App.ui.dataTable 公共组件,单例注册表放最底层防循环)
 * 跨域回调用装配期注入:renderDialog 由 index.js 经 setDialogRenderer 注入,
 * 本文件不 import view,方向保持单向 data ← cells ← store ← view/events。
 * ============================================================ */
'use strict';

import { esc, LABELS, STATUSES, PRIORITIES, PAGE_SIZES, byValue, generateTasks } from './tk-data.js';
import { labelBadge, statusCell, priorityCell, rowActionsHtml } from './tk-cells.js';

var icon = function () {
  return App.icon;
};

/* ---------- 数据(种子生成 100 条,与拆分前行为一致) ---------- */
export var TASKS = generateTasks();

/* ---------- 弹层状态 ---------- */
export var state = {
  dialog: null, // create | update | import | delete | bulk-delete
  currentRow: null,
};

export var draft = { title: '', status: '', label: '', priority: '' };
export var draftError = {};
export var bulkDeleteInput = '';
export function getBulkDeleteInput() {
  return bulkDeleteInput;
}
export function setBulkDeleteInput(v) {
  bulkDeleteInput = v;
}

/** 视图回调注入(装配期由 index.js 调用;避免 store → view 反向依赖) */
var renderDialogRef = null;
export function setDialogRenderer(fn) {
  renderDialogRef = fn;
}
export function renderDialogRefFn() {
  if (renderDialogRef) renderDialogRef();
}

/* ---------- 数据变更 ---------- */
export function mutateRow(id, patch) {
  for (var i = 0; i < TASKS.length; i++) {
    if (TASKS[i].id === id) {
      TASKS[i] = Object.assign({}, TASKS[i], patch);
      break;
    }
  }
}

export function findRow(id) {
  for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === id) return TASKS[i];
  return null;
}

export function deleteRowByIds(ids) {
  for (var i = TASKS.length - 1; i >= 0; i--) {
    if (ids.indexOf(TASKS[i].id) !== -1) TASKS.splice(i, 1);
  }
}

export function createTask(data) {
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
    title: data.title,
    status: data.status,
    label: data.label,
    priority: data.priority,
  });
  return nid;
}

/* ---------- 表格实例(公共组件) ---------- */
export var table = App.ui.dataTable({
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
        renderDialogRefFn();
      }
    },
  },
  rowActionsHtml: function (row, t) {
    return rowActionsHtml(t, row);
  },
});
