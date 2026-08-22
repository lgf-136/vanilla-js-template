/* ============================================================
 * chat-actions-conv.js — chats 模块·动作域·会话 CRUD
 * ------------------------------------------------------------
 * 会话操作:收藏/置顶/存档/重命名/移动分组/设置标签/删除
 * (删除经 ui-confirm 二次确认,删除后回退选中邻近会话)。
 * 弹窗渲染见 chat-dialogs.js;流式发送见 chat-stream.js。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, conversationById, persistConversation, refreshList, rememberSelected, selectConversation } from './chat-store.js';
import { renderFull } from './chat-view.js';
import { promptDialog } from './chat-actions-msg.js';

export function toggleFavorite(id) {
  var c = conversationById(id);
  if (!c) return;
  c.favorite = !c.favorite;
  persistConversation();
  refreshList();
}
export function togglePin(id) {
  var c = conversationById(id);
  if (!c) return;
  c.pinned = !c.pinned;
  persistConversation();
  refreshList();
}
export function toggleArchive(id) {
  var c = conversationById(id);
  if (!c) return;
  c.archived = !c.archived;
  if (state.view.filter === 'archived' && !c.archived) state.view.filter = 'all';
  persistConversation();
  refreshList();
}
export function renameConversation(id) {
  var c = conversationById(id);
  if (!c) return;
  promptDialog(
    t('chats.rename'),
    c.title || '',
    t('chats.rename'),
    t('chats.cancel'),
    function (name) {
      var v = String(name == null ? '' : name).trim();
      if (!v) return;
      c.title = v;
      persistConversation();
      refreshList();
    }
  );
}
export function moveConversation(id, groupId) {
  var c = conversationById(id);
  if (!c) return;
  c.groupId = groupId || '';
  persistConversation();
  refreshList();
}
export function setConversationTags(id, tagIds) {
  var c = conversationById(id);
  if (!c) return;
  c.tagIds = tagIds || [];
  persistConversation();
  refreshList();
}
export function deleteConversation(id) {
  var c = conversationById(id);
  if (!c) return;
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(t('chats.delete')) + '</h3>',
    body: '<p class="ch-dlg-desc">' + esc(t('chats.deleteConvMsg')) + '</p>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-danger" data-ch-act="dlg-confirm-delete" data-id="' +
      escAttr(id) +
      '">' +
      esc(t('chats.delete')) +
      '</button>',
  });
}
export function confirmDeleteConversation(id) {
  App.api
    .del('/api/chat/conversations', { ids: [id] })
    .then(function () {
      var idx = -1;
      state.conversations.forEach(function (c, i) {
        if (c.id === id) idx = i;
      });
      if (idx !== -1) state.conversations.splice(idx, 1);
      if (state.selectedId === id) {
        state.selectedId = null;
        state.draft = null;
        rememberSelected('');
        var next = state.conversations[0];
        if (next) selectConversation(next.id, true);
      }
      App.ui.closeDialog();
      renderFull();
    })
    .catch(function (e) {
      App.ui.toast((e && e.data && e.data.message) || t('chats.saveFailed'), 'error');
    });
}
