/* ============================================================
 * chat-left-tags.js — chats 模块·左栏·标签树 + 会话加标签浮层
 * ------------------------------------------------------------
 * ensureTagTree()         App.ui.tagPicker 单例(过滤/新建/重命名/
 *                          设色/删除/按颜色筛选;切换语言时重建;
 *                          onToggle 命中会话标签浮层时实时勾选)
 * tagsSectionHtml()       标签区块(清除颜色筛选 / 新建标签)
 * openTagPickerPopover    会话「添加标签」Gmail 式多选浮层(实时勾选
 *                          + 选中数徽标 + 完成按钮)
 * toggleConversationTag / finishTagPicker  勾选切换 / 落库关闭
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon, conversationById } from './chat-store.js';
import { rerenderLeft } from './chat-view.js';
import { openPopover, closePopover } from './chat-popover.js';
import { addTag, renameTag, deleteTag, setTagColor, setConversationTags } from './chat-actions.js';
import { currentLocale } from './chat-left-groups.js';

/* ---------- 标签树(公共组件) ---------- */
var tagTree = null;
var tagTreeLocale = null;
export function ensureTagTree() {
  var locale = currentLocale();
  if (tagTree && tagTreeLocale === locale) return tagTree;
  tagTreeLocale = locale;
  tagTree = App.ui.tagPicker.create({
    nodes: function () {
      return (state.config && state.config.tags) || [];
    },
    activeId: state.view.tagFilter || '',
    labels: {
      newTag: t('chats.tag.new'),
      rename: t('chats.group.rename'),
      color: t('chats.group.color'),
      delete: t('chats.group.delete'),
      deleteConfirm: t('chats.group.deleteConfirm'),
      deleteTagMsg: t('chats.tag.deleteMsg'),
      searchTags: t('chats.tag.search'),
      clear: t('chats.clearSearch'),
      empty: t('chats.tag.empty'),
      noMatch: t('chats.tag.noMatch'),
      name: t('chats.name'),
      namePlaceholder: t('chats.tag.namePlaceholder'),
      nameRequired: t('chats.group.nameRequired'),
      nameExists: t('chats.tag.nameExists'),
      nameTooLong: t('chats.tag.nameTooLong'),
      allTags: t('chats.tag.all'),
      untagged: t('chats.tag.untagged'),
      allColors: t('chats.tag.allColors'),
      customColor: t('chats.tag.customColor'),
      createTag: t('chats.tag.create'),
      selected: t('chats.tag.selected'),
      noneSelected: t('chats.tag.noneSelected'),
      done: t('chats.done'),
      menu: t('chats.menu'),
      renameHint: t('chats.group.renameHint'),
      cancel: t('chats.cancel'),
      save: t('chats.save'),
      copied: t('chats.copied'),
      searchCreate: t('chats.tag.searchCreate'),
      copyTip: t('chats.group.copyTip'),
      pickerHint: t('chats.group.pickerHint'),
    },
    count: function (id) {
      if (id === null) {
        var n = 0;
        state.conversations.forEach(function (c) {
          if (c.archived) return;
          if (!(c.tagIds || []).length) n++;
        });
        return n;
      }
      var n2 = 0;
      state.conversations.forEach(function (c) {
        if (c.archived) return;
        if ((c.tagIds || []).indexOf(id) !== -1) n2++;
      });
      return n2;
    },
    onSelect: function (id) {
      state.view.tagFilter = id || null;
      rerenderLeft();
    },
    onCreate: function (name, color) {
      addTag(name, color);
    },
    onRename: function (id, name, color) {
      renameTag(id, name, color);
    },
    onDelete: function (id) {
      deleteTag(id);
    },
    onColorChange: function (id, color) {
      setTagColor(id, color);
    },
    /** 多选下拉点选:命中当前打开的会话标签浮层时实时勾选 */
    onToggle: function (id) {
      var pop = document.querySelector('[data-ch-pop].ch-tagpop');
      var cid = pop && pop.getAttribute('data-ch-tagconv');
      if (!cid) return;
      toggleConversationTag(cid, id);
    },
    onRender: function () {
      rerenderLeft();
    },
  });
  return tagTree;
}

export function tagsSectionHtml() {
  return (
    '<div class="ch-bhead">' +
    '<span class="ch-bhead-title">' +
    icon('layers', 'size-3.5') +
    esc(t('chats.tags')) +
    '</span>' +
    '<span class="ch-bhead-actions">' +
    '<button type="button" class="ch-icon-btn" data-ch-act="tp-clearcolor" data-tip="' +
    escAttr(t('chats.tag.clearColorFilter')) +
    '" aria-label="' +
    escAttr(t('chats.tag.clearColorFilter')) +
    '">' +
    icon('x', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-icon-btn" data-ch-act="tp-newtag" data-tip="' +
    escAttr(t('chats.tag.new')) +
    '" aria-label="' +
    escAttr(t('chats.tag.new')) +
    '">' +
    icon('plus', 'size-3.5') +
    '</button>' +
    '</span>' +
    '</div>' +
    '<div class="ch-btree">' +
    ensureTagTree().render() +
    '</div>'
  );
}

/* ============================================================
 * 会话添加标签(Gmail 式多选,实时勾选 + 选中数徽标 + 完成)
 * ============================================================ */
export function openTagPickerPopover(conversationId, anchorEl) {
  var c = conversationById(conversationId);
  if (!c) return;
  var pop = openPopover(anchorEl, '', { className: 'ch-tagpop', width: '300px' });
  pop.setAttribute('data-ch-tagconv', conversationId);
  function renderPop() {
    var cc = conversationById(conversationId);
    if (!cc) return;
    pop.innerHTML =
      '<div class="ch-tagpop-head">' +
      '<span class="ch-tagpop-title">' +
      esc(t('chats.addTags')) +
      '</span>' +
      '<button type="button" class="ch-icon-btn" data-ch-act="tp-close" aria-label="' +
      escAttr(t('chats.close')) +
      '">' +
      icon('x', 'size-3.5') +
      '</button>' +
      '</div>' +
      ensureTagTree().pickerHtml(cc.tagIds || []);
    var search = pop.querySelector('[data-tp-pick-search]');
    if (search) {
      search.focus();
      try {
        search.setSelectionRange(search.value.length, search.value.length);
      } catch (e) {
        /* noop */
      }
    }
  }
  renderPop();
  return pop;
}

/** 标签多选切换(实时勾选 + 选中数徽标) */
export function toggleConversationTag(conversationId, tagId) {
  var c = conversationById(conversationId);
  if (!c) return;
  var list = (c.tagIds || []).slice();
  var idx = list.indexOf(tagId);
  if (idx !== -1) list.splice(idx, 1);
  else list.push(tagId);
  c.tagIds = list;
  var pop = document.querySelector('[data-ch-pop].ch-tagpop');
  if (pop) {
    pop.innerHTML =
      '<div class="ch-tagpop-head">' +
      '<span class="ch-tagpop-title">' +
      esc(t('chats.addTags')) +
      '</span>' +
      '<button type="button" class="ch-icon-btn" data-ch-act="tp-close" aria-label="' +
      escAttr(t('chats.close')) +
      '">' +
      icon('x', 'size-3.5') +
      '</button>' +
      '</div>' +
      ensureTagTree().pickerHtml(list);
  }
}

/** 标签多选完成:落库并关闭 */
export function finishTagPicker(conversationId) {
  var c = conversationById(conversationId);
  if (!c) return;
  setConversationTags(conversationId, c.tagIds || []);
  closePopover();
  App.ui.toast(t('chats.tagSaved'));
}
