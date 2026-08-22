/* ============================================================
 * chat-dialogs-util.js — chats 模块·弹窗域·共享表单工具
 * ------------------------------------------------------------
 * fieldHtml(label, control):带 label 的表单字段容器;
 * inputValue(selector):读取当前弹窗输入框值(空 → '')。
 * 供 chat-dialogs / chat-dialogs-skill / chat-dialogs-mcp 复用。
 * ============================================================ */
'use strict';

import { esc } from './chat-store.js';

export function fieldHtml(label, control) {
  return (
    '<div class="ch-dlg-field">' +
    '<label class="ch-dlg-label">' +
    esc(label) +
    '</label>' +
    control +
    '</div>'
  );
}
export function inputValue(selector) {
  var el = document.querySelector(selector);
  return el ? String(el.value || '') : '';
}
