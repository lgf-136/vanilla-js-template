/* ============================================================
 * dialog.js — 通用确认弹窗族（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责（拆分设计总览见 index.js 头注）：
 *   - openDialog / closeDialog：全屏遮罩确认弹窗（tp-overlay，
 *     自研实现，禁用 window.confirm/prompt），当前仅删除确认使用
 *   - openDeleteDialog：删除标签二次确认，确认后回调 opts.onDelete
 *   - overlay 为本文件私有单例（全组件唯一一份）；外点遮罩关闭的
 *     document click 监听随单例在此注册
 * 注意：新建/重命名标签走 popover.js 的锚定 Popover（无全屏遮罩），
 * 不经过本文件。本文件被 events.js 消费（doManagerAction → del）。
 * ============================================================ */
'use strict';

import { esc, ic } from './model.js';

  /* ---------- 弹窗(自研,禁用 window.prompt/confirm) ---------- */
  var overlay = null;
  function openDialog(opts) {
    closeDialog();
    overlay = document.createElement('div');
    overlay.className = 'tp-overlay';
    overlay.innerHTML =
      '<div class="tp-dialog">' +
      '<div class="tp-dialog-head">' +
      '<span class="tp-dialog-title">' +
      opts.title +
      '</span>' +
      '<button type="button" class="tp-dlg-x" data-tp-dlg-close aria-label="">' +
      ic('x') +
      '</button>' +
      '</div>' +
      (opts.desc ? '<div class="tp-dialog-desc">' + opts.desc + '</div>' : '') +
      '<div class="tp-dialog-body">' +
      (opts.body || '') +
      '</div>' +
      '<div class="tp-dialog-foot">' +
      '<button type="button" class="tp-btn" data-tp-dlg-close>' +
      esc(opts.cancelLabel || '') +
      '</button>' +
      '<button type="button" class="tp-btn tp-btn-primary" data-tp-dlg-ok>' +
      esc(opts.okLabel || '') +
      '</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }
  function closeDialog() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }
  document.addEventListener('click', function (e) {
    if (overlay && e.target && (!e.target.closest || !e.target.closest('.tp-dialog'))) {
      closeDialog();
    }
  });

  function openDeleteDialog(inst, tag) {
    var L = inst.labels();
    var overlayEl = openDialog({
      title: L.deleteConfirm || '',
      desc: L.deleteTagMsg || '',
      body: '',
      okLabel: L.delete || '',
      cancelLabel: L.cancel || '',
    });
    overlayEl.querySelector('[data-tp-dlg-ok]').classList.add('tp-btn-danger');
    overlayEl.querySelector('[data-tp-dlg-ok]').addEventListener('click', function () {
      closeDialog();
      if (typeof inst.opts.onDelete === 'function') inst.opts.onDelete(tag.id);
    });
  }

export { openDeleteDialog };
