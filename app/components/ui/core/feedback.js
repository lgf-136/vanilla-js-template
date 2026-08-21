/* ============================================================
 * feedback.js — 轻提示与模态弹窗（ui.js ESM 拆分，拆分设计总览见 ../index.js 头注）
 * ------------------------------------------------------------
 * 职责：toast 轻提示（类 shadcn sonner）/ dialog 模态弹窗
 *       （类 shadcn Dialog，替代 window.confirm/prompt）/ closeDialog。
 * 副作用：document keydown 全局单例监听（Esc 关闭弹窗与上下文菜单），
 *       随本文件 import 即注册；contextMenuClose 经 import 自
 *       context-menu.js（无循环依赖）。
 * 依赖 utils.js 的 escAttr；对外挂载统一由 core/index.js 完成。
 * ============================================================ */
'use strict';

import { escAttr } from './utils.js';
import { contextMenuClose } from './context-menu.js';

  // ---------- Toast(轻提示,类 shadcn sonner 风格;各模块共用) ----------
  function toast(message, type) {
    if (!document.body) return;
    var holder = document.querySelector('[data-toast-region]');
    if (!holder) {
      holder = document.createElement('div');
      holder.setAttribute('data-toast-region', '');
      holder.className =
        'fixed top-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2';
      document.body.appendChild(holder);
    }
    var el = document.createElement('div');
    el.setAttribute('data-toast', '');
    el.setAttribute('data-variant', type === 'error' ? 'error' : 'default');
    el.className =
      'flex items-start gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10';
    el.innerHTML =
      '<svg class="mt-0.5 size-4 shrink-0 ' +
      (type === 'error' ? 'text-destructive' : 'text-primary') +
      '" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>' +
      '<span class="flex-1 leading-5">' +
      String(message == null ? '' : message)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;') +
      '</span>';
    holder.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    }, 2600);
  }

  // ---------- Dialog(模态弹窗,类 shadcn Dialog;替代 window.confirm/prompt) ----------
  /** opts: { head, body, foot, closeLabel } — 返回 overlay 元素,调用方可继续绑定事件 */
  function dialog(opts) {
    var hadOpen = !!document.querySelector('[data-dialog-overlay]');
    closeDialog();
    var o = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.setAttribute('data-dialog-overlay', '');
    overlay.innerHTML =
      '<div class="ui-dialog" role="dialog" aria-modal="true">' +
      '<div class="ui-dialog-head">' +
      '<div class="ui-dialog-head-main">' +
      (o.head || '') +
      '</div>' +
      '<button type="button" class="ui-dialog-close" data-dialog-close aria-label="' +
      escAttr(o.closeLabel || 'Close') +
      '">' +
      App.icon.iconSvg('x', { class: 'size-4' }) +
      '</button>' +
      '</div>' +
      (o.body != null ? '<div class="ui-dialog-body">' + o.body + '</div>' : '') +
      (o.foot != null ? '<div class="ui-dialog-foot">' + o.foot + '</div>' : '') +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (
        e.target === overlay ||
        (e.target.closest && e.target.closest('[data-dialog-close]'))
      ) {
        closeDialog();
      }
    });
    if (!hadOpen) {
      var focusable = overlay.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) focusable.focus();
    }
    return overlay;
  }

  /** 关闭当前弹窗(幂等) */
  function closeDialog() {
    var ov = document.querySelector('[data-dialog-overlay]');
    if (ov) ov.remove();
  }

  // Esc 关闭弹窗/上下文菜单(全局单例监听;仅在存在浮层时生效)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeDialog();
      contextMenuClose();
    }
  });

export { toast, dialog, closeDialog };
