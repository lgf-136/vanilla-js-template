/* ============================================================
 * ch-events.js — chats 模块·事件域(document 事件委托)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为副作用模块:仅注册 document
 * 监听器(input/click/submit)、无导出被消费,必须被 index.js 显式
 * import 才会求值(ESM 不 import 则监听器静默失效,架构 2.3.1)。
 * 交互:会话搜索/选择/返回、新建消息弹窗(选人/搜索/移除标签/发送)、
 * 底部发送消息(追加到会话)。
 * 依赖:ch-data.js(findConversationById/CONVERSATIONS)、
 * ch-store.js(状态/派生/重渲回调)、ch-view.js(弹窗与重渲)。
 * 方向:data ← store ← view ← events。
 * ============================================================ */
'use strict';

import { CONVERSATIONS, findConversationById } from './ch-data.js';
import { state } from './ch-store.js';
import { openNewChatDialog, updateNewChatDialog, rerender } from './ch-view.js';

document.addEventListener('input', function (e) {
  var search = e.target.closest('[data-ch-search]');
  if (search) {
    state.search = search.value;
    rerender();
    return;
  }
  var people = e.target.closest('[data-ch-people-search]');
  if (people) {
    state.newSearch = people.value;
    updateNewChatDialog();
  }
});

document.addEventListener('click', function (e) {
  var open = e.target.closest('[data-ch-open]');
  if (open) {
    state.selectedId = open.getAttribute('data-ch-open');
    rerender();
    return;
  }
  if (e.target.closest('[data-ch-new]')) {
    state.newSearch = '';
    state.selectedUsers = [];
    openNewChatDialog();
    return;
  }
  if (e.target.closest('[data-ch-back]')) {
    state.selectedId = null;
    rerender();
    return;
  }
  var person = e.target.closest('[data-ch-person]');
  if (person) {
    var id = person.getAttribute('data-ch-person');
    var u = findConversationById(id);
    if (!u) return;
    var idx = state.selectedUsers.findIndex(function (s) {
      return s.id === id;
    });
    if (idx === -1) state.selectedUsers.push(u);
    else state.selectedUsers.splice(idx, 1);
    updateNewChatDialog();
    return;
  }
  var rm = e.target.closest('[data-ch-tag-remove]');
  if (rm) {
    var rid = rm.getAttribute('data-ch-tag-remove');
    state.selectedUsers = state.selectedUsers.filter(function (s) {
      return s.id !== rid;
    });
    updateNewChatDialog();
    return;
  }
  var sendNew = e.target.closest('[data-ch-send-new]');
  if (sendNew) {
    if (state.selectedUsers.length === 0) return;
    var locale = App.getShellContext().settings.locale;
    var t = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.chats);
    var label = t('chats.selected').replace('{count}', String(state.selectedUsers.length));
    App.ui.closeDialog();
    App.ui.toast(
      state.selectedUsers
        .map(function (u) {
          return u.fullName;
        })
        .join(', ') +
        ' (' +
        label +
        ')',
      'default'
    );
    state.selectedUsers = [];
    rerender();
  }
});

document.addEventListener('submit', function (e) {
  var form = e.target.closest && e.target.closest('[data-ch-send-form]');
  if (!form) return;
  e.preventDefault();
  var input = form.querySelector('[data-ch-input]');
  var val = ((input && input.value) || '').trim();
  if (!val) return;
  var sel = findConversationById(state.selectedId);
  if (sel) {
    sel.messages.unshift({
      sender: 'You',
      message: val,
      timestamp: new Date().toISOString().slice(0, 19),
    });
  }
  if (input) input.value = '';
  rerender();
});
