/* ============================================================
 * chat-events-helpers.js — chats 模块·事件域·共享辅助(副作用)
 * ------------------------------------------------------------
 * 供 chat-events.js 主 click 委托引用的辅助函数,以及会话右键
 * (contextmenu)菜单与「供应商/MCP 删除确认」两个独立监听器。
 * 本文件是副作用模块(注册监听器),必须被 chat-events.js 显式
 * 导入,否则 ESM 不求值、监听器静默失效。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon, activeConversation, effectiveDraft } from './chat-store.js';
import { rerenderCenter, rerenderRight } from './chat-view.js';
import { conversationMenuHtml } from './chat-left.js';
import { deleteCustomProvider, deleteMcpServer } from './chat-actions.js';

/* ---------- 会话右键菜单 ---------- */
export function convMenu(id, anchorEl) {
  App.ui.contextMenu.open(conversationMenuHtml(id), { anchorEl: anchorEl || null, className: 'ch-ctxpop' });
}

/* ============================================================
 * contextmenu 委托(会话行)
 * ============================================================ */
document.addEventListener('contextmenu', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var row = t.closest('[data-ch-conv]');
  if (!row) return;
  e.preventDefault();
  convMenu(row.getAttribute('data-ch-conv'), null);
});

/* ---------- 生效值辅助 ---------- */
export function effectiveWebSearch() {
  var d = effectiveDraft();
  return !!(d.webSearch);
}
export function effectiveMcpMaster() {
  var d = effectiveDraft();
  return !!d.mcpEnabled;
}

/* ---------- 消息展开/折叠 + 复制 ---------- */
export function toggleThinking(msgId) {
  var c = activeConversation();
  var msgs = (c && c.messages) || [];
  var m = msgs.filter(function (x) { return x.id === msgId; })[0];
  if (!m) return;
  m._thinkOpen = !m._thinkOpen;
  rerenderCenter();
}
export function toggleTool(msgId, index) {
  var c = activeConversation();
  var msgs = (c && c.messages) || [];
  var m = msgs.filter(function (x) { return x.id === msgId; })[0];
  if (!m) return;
  m._toolsOpen = m._toolsOpen || {};
  m._toolsOpen[index] = !m._toolsOpen[index];
  rerenderCenter();
}
export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () {
        App.ui.toast(t('chats.copied'));
      },
      function () {
        App.ui.toast(t('chats.copyFailed'), 'error');
      }
    );
  } else {
    App.ui.toast(t('chats.copyFailed'), 'error');
  }
}
export function inputValue(selector) {
  var el = document.querySelector(selector);
  return el ? String(el.value || '') : '';
}

/* ---------- 查找(编辑弹窗回填) ---------- */
export function findSkill(id) {
  var skills = (state.config && state.config.skills) || [];
  for (var i = 0; i < skills.length; i++) if (skills[i].id === id) return skills[i];
  return null;
}
export function findPrompt(id) {
  var prompts = (state.config && state.config.prompts) || [];
  for (var i = 0; i < prompts.length; i++) if (prompts[i].id === id) return prompts[i];
  return null;
}
export function findCustomProvider(id) {
  var list = (state.config && state.config.providers) || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
export function findMcp(id) {
  var list = (state.config && state.config.mcp) || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

/* ---------- 删除确认弹窗 ---------- */
export function deleteProviderWithConfirm(id) {
  var p = findCustomProvider(id);
  if (!p) return;
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(t('chats.delete')) + '</h3>',
    body: '<p class="ch-dlg-desc">' + esc(t('chats.deleteProviderMsg', p.name)) + '</p>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-danger" data-ch-act="provider-delete-confirm" data-id="' +
      escAttr(id) +
      '">' +
      esc(t('chats.delete')) +
      '</button>',
  });
}
export function deleteMcpWithConfirm(id) {
  var s = findMcp(id);
  if (!s) return;
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(t('chats.delete')) + '</h3>',
    body: '<p class="ch-dlg-desc">' + esc(t('chats.deleteMcpMsg', s.name)) + '</p>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-danger" data-ch-act="mcp-delete-confirm" data-id="' +
      escAttr(id) +
      '">' +
      esc(t('chats.delete')) +
      '</button>',
  });
}

/* ---------- MCP 弹窗 headers 行增删 ---------- */
export function addHeaderRow() {
  var wrap = document.querySelector('[data-ch-headers]');
  if (!wrap) return;
  var rows = wrap.querySelectorAll('[data-ch-header-key]').length;
  var row = document.createElement('div');
  row.className = 'ch-dlg-header-row';
  row.innerHTML =
    '<input type="text" class="ch-input-sm" data-ch-header-key="' +
    rows +
    '" placeholder="' +
    escAttr(t('chats.headerName')) +
    '" />' +
    '<input type="text" class="ch-input-sm" data-ch-header-val="' +
    rows +
    '" placeholder="' +
    escAttr(t('chats.headerValue')) +
    '" />' +
    '<button type="button" class="ch-icon-btn is-danger" data-ch-act="mcp-header-remove" data-index="' +
    rows +
    '" aria-label="' +
    escAttr(t('chats.remove')) +
    '">' +
    icon('x', 'size-3.5') +
    '</button>';
  wrap.insertBefore(row, wrap.querySelector('[data-ch-act="mcp-header-add"]'));
}
export function removeHeaderRow(index) {
  var el = document.querySelector('[data-ch-header-key="' + index + '"]');
  if (el && el.parentNode) el.parentNode.remove();
}

/* ============================================================
 * 供应商/ MCP 删除确认(补充到 click 分发)
 * ============================================================ */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var act = t.closest('[data-ch-act]');
  if (!act) return;
  var action = act.getAttribute('data-ch-act');
  if (action === 'provider-delete-confirm') {
    deleteCustomProvider(act.getAttribute('data-id') || '');
  } else if (action === 'mcp-delete-confirm') {
    deleteMcpServer(act.getAttribute('data-id') || '');
  }
});
