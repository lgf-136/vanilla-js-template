/* ============================================================
 * chat-left.js — chats 模块·左栏(会话历史 3:7 上区 + 下区 Tab)
 * ------------------------------------------------------------
 * 上区 60%:模糊搜索(标题/预览)→ 过滤胶囊(全部/收藏/置顶/已存档)
 *          → 会话列表(悬停 ⋯ 更多 / 置顶星标 / 预览 / 相对时间 + 标签)
 * 下区 40%:「分组｜标签」胶囊 Tab 切换(bottomHtml),具体区块拆分到:
 *          chat-left-groups.js(分组树)/ chat-left-tags.js(标签树
 *          + 会话加标签浮层),本文件 re-export 供 chat-events 消费。
 * 事件全部走 chat-events.js 的 document 委托。
 * ============================================================ */
'use strict';

import {
  state,
  t,
  esc,
  escAttr,
  icon,
  tagById,
  groupDescendants,
  conversationById,
} from './chat-store.js';
import { sortConversations, filterConversations } from './chat-logic.js';
import { fmtRelative } from './chat-util.js';
import { rerenderLeft } from './chat-view.js';
import { groupsSectionHtml } from './chat-left-groups.js';
import { tagsSectionHtml } from './chat-left-tags.js';

/* ---------- 过滤胶囊 ---------- */
var FILTERS = ['all', 'favorite', 'pinned', 'archived'];

function filterLabel(key) {
  return t('chats.filter.' + key);
}

function filterPillsHtml() {
  return (
    '<div class="ch-pills" role="tablist">' +
    FILTERS.map(function (f) {
      return (
        '<button type="button" role="tab" aria-selected="' +
        (state.view.filter === f ? 'true' : 'false') +
        '" class="ch-pill' +
        (state.view.filter === f ? ' is-on' : '') +
        '" data-ch-act="filter" data-value="' +
        f +
        '">' +
        esc(filterLabel(f)) +
        '</button>'
      );
    }).join('') +
    '</div>'
  );
}

/* ---------- 会话列表 ---------- */
function conversationRowHtml(c) {
  var selected = state.selectedId === c.id;
  var tags = (c.tagIds || []).slice(0, 2).map(function (tid) {
    var tg = tagById(tid);
    return tg
      ? '<span class="ch-tagmini" style="--tagc:' + escAttr(colorValue(tg.color)) + '">' + esc(tg.name) + '</span>'
      : '';
  }).join('');
  var title = c.title || t('chats.untitled');
  return (
    '<div class="ch-conv' +
    (selected ? ' is-active' : '') +
    (c.archived ? ' is-archived' : '') +
    '" data-ch-conv="' +
    escAttr(c.id) +
    '" data-ch-act="select-conv">' +
    '<div class="ch-conv-title">' +
    (c.pinned ? '<span class="ch-conv-pin" aria-label="' + escAttr(t('chats.pinned')) + '">' + icon('pin', 'size-3') + '</span>' : '') +
    (c.favorite ? '<span class="ch-conv-star">' + icon('star', 'size-3') + '</span>' : '') +
    '<span class="ch-conv-name">' +
    esc(title) +
    '</span>' +
    '<button type="button" class="ch-conv-more" data-ch-act="conv-menu" data-id="' +
    escAttr(c.id) +
    '" aria-label="' +
    escAttr(t('chats.moreActions')) +
    '">' +
    icon('ellipsis', 'size-4') +
    '</button>' +
    '</div>' +
    '<div class="ch-conv-preview">' +
    esc(c.preview || '') +
    '</div>' +
    '<div class="ch-conv-meta">' +
    '<span class="ch-conv-time">' +
    esc(fmtRelative(c.updatedAt, t)) +
    '</span>' +
    tags +
    '</div>' +
    '</div>'
  );
}

/** 颜色值解析(标签色/分组色可能为调色板名或 hex;调色板名走 App.ui.color) */
function colorValue(color) {
  if (!color) return '';
  try {
    var resolved = App.ui.color && App.ui.color.resolveColor ? App.ui.color.resolveColor(color) : color;
    return resolved || color;
  } catch (e) {
    return color;
  }
}

function conversationListHtml() {
  var filtered = filterConversations(sortConversations(state.conversations), {
    search: state.view.search,
    filter: state.view.filter,
    groupFilter: state.view.groupFilter,
    groupDescendants: state.view.groupFilter ? groupDescendants(state.view.groupFilter) : [],
    tagFilter: state.view.tagFilter,
  });
  if (!filtered.length) {
    return (
      '<div class="ch-empty">' +
      '<span class="ch-empty-icon">' +
      icon('messages-square', 'size-5') +
      '</span>' +
      '<span>' +
      esc(state.view.search ? t('chats.noMatch') : t('chats.noConversations')) +
      '</span>' +
      '</div>'
    );
  }
  return filtered.map(conversationRowHtml).join('');
}

function searchBoxHtml() {
  return (
    '<div class="ch-search">' +
    '<span class="ch-search-ic">' +
    icon('search', 'size-4') +
    '</span>' +
    '<input type="text" class="ch-search-input" data-ch-act="search" value="' +
    escAttr(state.view.search) +
    '" placeholder="' +
    escAttr(t('chats.searchPlaceholder')) +
    '" aria-label="' +
    escAttr(t('chats.searchPlaceholder')) +
    '" />' +
    (state.view.search
      ? '<button type="button" class="ch-search-x" data-ch-act="clear-search" aria-label="' +
        escAttr(t('chats.clearSearch')) +
        '">' +
        icon('x', 'size-3.5') +
        '</button>'
      : '') +
    '</div>'
  );
}

/* ---------- 下区:分组｜标签 ---------- */
function bottomHtml() {
  var tab = state.view.leftTab || 'groups';
  return (
    '<div class="ch-btabs">' +
    '<button type="button" class="ch-btab' +
    (tab === 'groups' ? ' is-on' : '') +
    '" data-ch-act="left-tab" data-value="groups">' +
    esc(t('chats.groups')) +
    '</button>' +
    '<button type="button" class="ch-btab' +
    (tab === 'tags' ? ' is-on' : '') +
    '" data-ch-act="left-tab" data-value="tags">' +
    esc(t('chats.tags')) +
    '</button>' +
    '</div>' +
    '<div class="ch-bsection">' +
    (tab === 'groups' ? groupsSectionHtml() : tagsSectionHtml()) +
    '</div>'
  );
}

/* ---------- 主渲染 ---------- */
export function leftHtml() {
  return (
    '<aside class="ch-left' +
    (state.view.leftOpen ? ' is-open' : '') +
    '" data-ch-left>' +
    '<div class="ch-left-top">' +
    searchBoxHtml() +
    filterPillsHtml() +
    '<div class="ch-conv-list" data-ch-conv-list>' +
    conversationListHtml() +
    '</div>' +
    '</div>' +
    '<div class="ch-left-divider"></div>' +
    '<div class="ch-left-bottom">' +
    bottomHtml() +
    '</div>' +
    '</aside>'
  );
}

/* ---------- 会话右键 / ⋯ 更多菜单 ---------- */
export function conversationMenuHtml(id) {
  var c = conversationById(id);
  if (!c) return '';
  var groups = (state.config && state.config.groups) || [];
  var items =
    App.ui.contextMenu.item('star', t('chats.favorite'), {
      isOn: c.favorite,
      attrs: 'data-ch-act="conv-fav" data-id="' + escAttr(id) + '"',
    }) +
    App.ui.contextMenu.item('pin', t('chats.pin'), {
      isOn: c.pinned,
      attrs: 'data-ch-act="conv-pin" data-id="' + escAttr(id) + '"',
    }) +
    App.ui.contextMenu.item('archive', t('chats.archive'), {
      isOn: c.archived,
      attrs: 'data-ch-act="conv-archive" data-id="' + escAttr(id) + '"',
    }) +
    App.ui.contextMenu.separator() +
    App.ui.contextMenu.item('pencil', t('chats.rename'), {
      attrs: 'data-ch-act="conv-rename" data-id="' + escAttr(id) + '"',
    }) +
    App.ui.contextMenu.submenu(
      t('chats.moveTo'),
      'folder',
      groups.length
        ? groups
            .map(function (g) {
              return App.ui.contextMenu.item('', esc(g.name), {
                isOn: c.groupId === g.id,
                attrs: 'data-ch-act="conv-move" data-id="' + escAttr(id) + '" data-group="' + escAttr(g.id) + '"',
              });
            })
            .join('')
        : App.ui.contextMenu.empty(t('chats.group.empty'))
    ) +
    App.ui.contextMenu.item('bookmark', t('chats.addTags'), {
      attrs: 'data-ch-act="conv-tags" data-id="' + escAttr(id) + '"',
    }) +
    App.ui.contextMenu.separator() +
    App.ui.contextMenu.item('trash-2', t('chats.delete'), {
      danger: true,
      attrs: 'data-ch-act="conv-delete" data-id="' + escAttr(id) + '"',
    });
  return items;
}

/* ---------- re-export(供 chat-events 统一引用) ---------- */
export { ensureGroupTree, groupsSectionHtml, currentLocale } from './chat-left-groups.js';
export {
  ensureTagTree,
  tagsSectionHtml,
  openTagPickerPopover,
  toggleConversationTag,
  finishTagPicker,
} from './chat-left-tags.js';
export { colorValue };
