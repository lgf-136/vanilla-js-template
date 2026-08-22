/* ============================================================
 * tk-events.js — tasks 模块·事件域(document 事件委托)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为副作用模块:仅注册 document
 * 监听器(click/input/change)、无导出被消费,必须被 index.js 显式
 * import 才会求值(ESM 不 import 则监听器静默失效,架构 2.3.1)。
 * 表格交互(搜索/排序/分页/选择)由 data-table 组件托管,这里只
 * 保留业务部分:弹层开关、行操作、草稿、批量删除确认。
 * 依赖:tk-store.js(状态/表格/变更)、tk-view.js(弹窗编排)。
 * 方向:data ← cells ← store ← view ← events。
 * ============================================================ */
'use strict';

import {
  state,
  draft,
  table,
  mutateRow,
  findRow,
  deleteRowByIds,
  getBulkDeleteInput,
  setBulkDeleteInput,
} from './tk-store.js';
import { openDrawer, renderDialog, saveDraft } from './tk-view.js';

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
    var editRow = findRow(rowEdit.getAttribute('data-task-row-edit'));
    if (editRow) openDrawer('update', editRow);
    return;
  }
  var rowDelete = target.closest('[data-task-row-delete]');
  if (rowDelete) {
    var delRow = findRow(rowDelete.getAttribute('data-task-row-delete'));
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
    deleteRowByIds([delRow2.id]);
    state.dialog = null;
    state.currentRow = null;
    renderDialog();
    table.clearSelection();
    App.ui.toast('The task ' + delRow2.id + ' has been deleted.', 'default');
    return;
  }
  var confirmBulk = target.closest('[data-task-confirm-bulk-delete]');
  if (confirmBulk) {
    if (getBulkDeleteInput() !== 'DELETE') {
      App.ui.toast('Please type "DELETE" to confirm.', 'error');
      return;
    }
    var rows3 = table.selected();
    var ids3 = rows3.map(function (r) {
      return r.id;
    });
    deleteRowByIds(ids3);
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
    setBulkDeleteInput(target.value);
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
