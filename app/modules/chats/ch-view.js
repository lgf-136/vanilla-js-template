/* ============================================================
 * ch-view.js — chats 模块·视图域(主区域渲染 + 新建消息弹窗)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为视图控制:
 * - renderChats(t):左侧会话列表 + 右侧聊天面板/空状态整页组装
 * - newChatDialogParts / openNewChatDialog / updateNewChatDialog:
 *   新建消息弹窗(搜索联系人、多选标签、可移除,内容随选择动态刷新)
 * - rerender:路由区域局部重渲(经 store.setRerender 注入)
 * 依赖:ch-data.js(数据/纯函数)、ch-store.js(状态/派生)。
 * 方向:data ← store ← view。
 * ============================================================ */
'use strict';

import { esc, avatarHtml, fmtTime, groupMessages, findConversationById } from './ch-data.js';
import { state, filteredChats, usersWithoutMessages } from './ch-store.js';

var icon = function () {
  return App.icon;
};

function moduleT(locale) {
  return App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.chats);
}

/* ---------- 渲染(返回 HTML 字符串) ---------- */
export function renderChats(t) {
  var chats = filteredChats();
  var selected = findConversationById(state.selectedId);

  var html =
    '<div class="ch-page" data-ch-region>' +
    /* 左侧:会话列表 */
    '<div class="ch-side">' +
    '<div class="ch-side-head">' +
    '<div class="ch-inbox-title">' +
    '<h1>' +
    t('chats.inbox') +
    '</h1>' +
    icon().iconSvg('messages-square', { class: 'size-5' }) +
    '</div>' +
    '<button type="button" class="ch-icon-btn" data-ch-new aria-label="' +
    t('chats.newMessage') +
    '">' +
    icon().iconSvg('pencil', { class: 'size-6 ch-muted' }) +
    '</button>' +
    '</div>' +
    App.ui.searchInput.html({
      placeholder: t('chats.searchPlaceholder'),
      value: state.search,
      attrs: 'data-ch-search',
      clearLabel: t('chats.search'),
    }) +
    '<div class="ch-list">' +
    chats
      .map(function (c) {
        var last = c.messages[0];
        var lastMsg = last.sender === 'You' ? 'You: ' + last.message : last.message;
        return (
          '<button type="button" class="ch-item' +
          (c.id === state.selectedId ? ' ch-item-active' : '') +
          '" data-ch-open="' +
          c.id +
          '">' +
          avatarHtml(c.fullName, 40) +
          '<span class="ch-item-body">' +
          '<span class="ch-item-name">' +
          esc(c.fullName) +
          '</span>' +
          '<span class="ch-item-msg">' +
          esc(lastMsg) +
          '</span>' +
          '</span>' +
          '</button>'
        );
      })
      .join('') +
    '</div>' +
    '</div>' +
    /* 右侧:聊天面板 / 空状态 */
    '<div class="ch-main">';

  if (selected) {
    html +=
      '<div class="ch-panel">' +
      '<div class="ch-panel-head">' +
      '<button type="button" class="ch-icon-btn ch-back" data-ch-back aria-label="Back">' +
      icon().iconSvg('arrow-left', { class: 'size-5' }) +
      '</button>' +
      '<div class="ch-panel-user">' +
      avatarHtml(selected.fullName, 44, 'ch-avatar-lg') +
      '<div class="ch-panel-meta">' +
      '<span class="ch-panel-name">' +
      esc(selected.fullName) +
      '</span>' +
      '<span class="ch-panel-title">' +
      esc(selected.title) +
      '</span>' +
      '</div>' +
      '</div>' +
      '<div class="ch-panel-actions">' +
      '<button type="button" class="ch-icon-btn ch-sm" aria-label="Video">' +
      icon().iconSvg('video', { class: 'size-5 ch-muted' }) +
      '</button>' +
      '<button type="button" class="ch-icon-btn ch-sm" aria-label="Phone">' +
      icon().iconSvg('phone', { class: 'size-5 ch-muted' }) +
      '</button>' +
      '<button type="button" class="ch-icon-btn" aria-label="More">' +
      icon().iconSvg('ellipsis', { class: 'size-5 ch-muted' }) +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="ch-body">' +
      '<div class="ch-scroll">' +
      groupMessages(selected.messages)
        .map(function (g) {
          return (
            g.items
              .map(function (m) {
                var mine = m.sender === 'You';
                return (
                  '<div class="ch-bubble-row ' +
                  (mine ? 'ch-mine' : '') +
                  '">' +
                  '<div class="ch-bubble ' +
                  (mine ? 'ch-bubble-mine' : '') +
                  '">' +
                  esc(m.message) +
                  '<span class="ch-bubble-time">' +
                  fmtTime(new Date(m.timestamp)) +
                  '</span>' +
                  '</div>' +
                  '</div>'
                );
              })
              .join('') +
            '<div class="ch-date-divider">' +
            g.key +
            '</div>'
          );
        })
        .reverse()
        .join('') +
      '</div>' +
      '</div>' +
      '<form class="ch-input-row" data-ch-send-form>' +
      '<div class="ch-input-wrap">' +
      '<div class="ch-input-btns">' +
      '<button type="button" class="ch-icon-btn ch-input-btn"><span class="ch-plus">' +
      icon().iconSvg('plus', { class: 'size-5 ch-muted' }) +
      '</span></button>' +
      '<button type="button" class="ch-icon-btn ch-input-btn ch-hide-lg">' +
      icon().iconSvg('image-plus', { class: 'size-5 ch-muted' }) +
      '</button>' +
      '<button type="button" class="ch-icon-btn ch-input-btn ch-hide-lg">' +
      icon().iconSvg('paperclip', { class: 'size-5 ch-muted' }) +
      '</button>' +
      '</div>' +
      '<input type="text" data-ch-input placeholder="' +
      t('chats.typeHere') +
      '" autocomplete="off" />' +
      '<button type="submit" class="ch-icon-btn ch-input-send ch-hide-sm">' +
      icon().iconSvg('send', { class: 'size-5' }) +
      '</button>' +
      '</div>' +
      '<button type="submit" class="ch-send-btn ch-show-sm">' +
      icon().iconSvg('send', { class: 'size-4' }) +
      ' ' +
      t('chats.send') +
      '</button>' +
      '</form>' +
      '</div>';
  } else {
    html +=
      App.ui.emptyState({
        icon: 'messages-square',
        title: t('chats.yourMessages'),
        desc: t('chats.emptyDesc'),
        fill: true,
        actionHtml:
          '<button type="button" data-slot="button" class="' +
          App.ui.buttonClass('default') +
          '" data-ch-new>' +
          t('chats.sendMessage') +
          '</button>',
      });
  }

  html += '</div></div>';

  return html;
}

/* ---------- 新建消息弹窗(公共 App.ui.dialog;内容随选择/搜索动态更新) ---------- */
function newChatDialogParts(t) {
  var all = usersWithoutMessages();
  var q2 = state.newSearch.trim().toLowerCase();
  var filtered = all.filter(function (u) {
    return u.fullName.toLowerCase().indexOf(q2) !== -1;
  });
  return {
    head: '<h2 class="ui-dialog-title">' + t('chats.newMessage') + '</h2>',
    body:
      '<div class="ch-to-row">' +
      '<span class="ch-to-label">' +
      t('chats.to') +
      '</span>' +
      '<div class="ch-tags">' +
      (state.selectedUsers.length
        ? state.selectedUsers
            .map(function (u) {
              return (
                '<span class="ch-tag">' +
                esc(u.fullName) +
                '<button type="button" class="ch-tag-x" data-ch-tag-remove="' +
                u.id +
                '" aria-label="Remove">' +
                icon().iconSvg('x', { class: 'size-3' }) +
                '</button>' +
                '</span>'
              );
            })
            .join('')
        : '') +
      '</div>' +
      '</div>' +
      '<div class="ch-people">' +
      App.ui.searchInput.html({
        placeholder: t('chats.searchPeople'),
        value: state.newSearch,
        attrs: 'data-ch-people-search',
        clearLabel: t('chats.search'),
      }) +
      '<div class="ch-people-list">' +
      (filtered.length
        ? filtered
            .map(function (u) {
              var sel = state.selectedUsers.some(function (s2) {
                return s2.id === u.id;
              });
              return (
                '<button type="button" class="ch-person' +
                (sel ? ' ch-person-sel' : '') +
                '" data-ch-person="' +
                u.id +
                '">' +
                avatarHtml(u.fullName, 32) +
                '<span class="ch-person-meta">' +
                '<span class="ch-person-name">' +
                esc(u.fullName) +
                '</span>' +
                '<span class="ch-person-user">' +
                esc(u.username) +
                '</span>' +
                '</span>' +
                (sel ? icon().iconSvg('check', { class: 'size-4 ch-check' }) : '') +
                '</button>'
              );
            })
            .join('')
        : '<div class="ch-no-people">' + t('chats.noPeople') + '</div>') +
      '</div>' +
      '</div>',
    foot:
      '<button type="button" class="ch-primary-btn" data-ch-send-new disabled>' +
      t('chats.chat') +
      '</button>',
  };
}

export function openNewChatDialog() {
  var t = moduleT(App.getShellContext().settings.locale);
  var parts = newChatDialogParts(t);
  App.ui.dialog({ head: parts.head, body: parts.body, foot: parts.foot });
}

/** 弹窗内容变化(选人/搜索/移除标签)后仅刷新弹窗本体,避免重渲整个页面 */
export function updateNewChatDialog() {
  var overlay = document.querySelector('[data-dialog-overlay]');
  if (!overlay) return;
  var t = moduleT(App.getShellContext().settings.locale);
  var parts = newChatDialogParts(t);
  var body = overlay.querySelector('.ui-dialog-body');
  if (body) body.innerHTML = parts.body;
  var foot = overlay.querySelector('.ui-dialog-foot');
  if (foot) foot.innerHTML = parts.foot;
}

/* ---------- 局部重渲(经 store.setRerender 注入,供事件域调用) ---------- */
export function rerender() {
  var region = document.querySelector('[data-ch-region]');
  if (!region) return;
  var t = moduleT(App.getShellContext().settings.locale);
  region.outerHTML = renderChats(t);
}
