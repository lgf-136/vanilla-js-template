/* ============================================================
 * chat-left-groups.js — chats 模块·左栏·分组树(公共组件)
 * ------------------------------------------------------------
 * ensureGroupTree()   App.ui.groupTree 单例(多级分组:选中过滤/
 *                      双击重命名/右键菜单/未存档计数/图标/颜色/
 *                      级联删除;切换语言时重建)
 * groupsSectionHtml() 分组区块(全部折叠/全部展开/新建分组)
 * currentLocale()     当前语言(分组树/标签树重建判据)
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon } from './chat-store.js';
import { groupConversationCount } from './chat-logic.js';
import { groupDescendants } from './chat-store.js';
import { rerenderLeft } from './chat-view.js';
import { addGroup, renameGroup, deleteGroup, moveGroup, setGroupIcon, setGroupColor } from './chat-actions.js';

export function currentLocale() {
  try {
    return (App.getShellContext && App.getShellContext().settings.locale) || 'zh-CN';
  } catch (e) {
    return 'zh-CN';
  }
}

/* ---------- 分组树(公共组件) ---------- */
var groupTree = null;
var groupTreeLocale = null;
export function ensureGroupTree() {
  var locale = currentLocale();
  if (groupTree && groupTreeLocale === locale) return groupTree;
  groupTreeLocale = locale;
  groupTree = App.ui.groupTree.create({
    nodes: function () {
      return (state.config && state.config.groups) || [];
    },
    rootLabel: t('chats.all'),
    activeId: state.view.groupFilter || 'root',
    labels: {
      newGroup: t('chats.group.new'),
      newChild: t('chats.group.newChild'),
      newSibling: t('chats.group.newSibling'),
      rename: t('chats.group.rename'),
      moveTo: t('chats.group.moveTo'),
      icon: t('chats.group.icon'),
      color: t('chats.group.color'),
      delete: t('chats.group.delete'),
      deleteConfirm: t('chats.group.deleteConfirm'),
      deleteMsg: t('chats.group.deleteMsg'),
      rootGroup: t('chats.all'),
      search: t('chats.group.search'),
      clear: t('chats.clearSearch'),
      empty: t('chats.group.empty'),
      noMatch: t('chats.group.noMatch'),
      name: t('chats.name'),
      namePlaceholder: t('chats.group.namePlaceholder'),
      nameRequired: t('chats.group.nameRequired'),
      parentGroup: t('chats.group.parentGroup'),
      chooseParent: t('chats.group.chooseParent'),
      iconSearch: t('chats.group.iconSearch'),
      emoji: t('chats.group.emoji'),
      emojiInput: t('chats.group.emojiInput'),
      clearIcon: t('chats.group.clearIcon'),
      clearColor: t('chats.group.clearColor'),
      apply: t('chats.save'),
      cancel: t('chats.cancel'),
      save: t('chats.save'),
      copied: t('chats.copied'),
      menu: t('chats.menu'),
      renameHint: t('chats.group.renameHint'),
      expand: t('chats.group.expand'),
      collapse: t('chats.group.collapse'),
      close: t('chats.close'),
      copyTip: t('chats.group.copyTip'),
      pickerHint: t('chats.group.pickerHint'),
    },
    count: function (id) {
      return groupConversationCount(state.conversations, groupDescendants(id));
    },
    onSelect: function (id) {
      state.view.groupFilter = id || null;
      rerenderLeft();
    },
    onCreate: function (parentId, name) {
      addGroup(name, parentId);
    },
    onRename: function (id, name) {
      renameGroup(id, name);
    },
    onDelete: function (id) {
      deleteGroup(id);
    },
    onMove: function (id, targetId, zone) {
      moveGroup(id, targetId, zone);
    },
    onIconChange: function (id, iconName) {
      setGroupIcon(id, iconName);
    },
    onColorChange: function (id, color) {
      setGroupColor(id, color);
    },
    onRender: function () {
      rerenderLeft();
    },
  });
  return groupTree;
}

export function groupsSectionHtml() {
  return (
    '<div class="ch-bhead">' +
    '<span class="ch-bhead-title">' +
    icon('folder', 'size-3.5') +
    esc(t('chats.groups')) +
    '</span>' +
    '<span class="ch-bhead-actions">' +
    '<button type="button" class="ch-icon-btn" data-ch-act="gt-collapseall" data-tip="' +
    escAttr(t('chats.group.collapseAll')) +
    '" aria-label="' +
    escAttr(t('chats.group.collapseAll')) +
    '">' +
    icon('arrow-up', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-icon-btn" data-ch-act="gt-expandall" data-tip="' +
    escAttr(t('chats.group.expandAll')) +
    '" aria-label="' +
    escAttr(t('chats.group.expandAll')) +
    '">' +
    icon('arrow-down', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-icon-btn" data-ch-act="gt-newgroup" data-tip="' +
    escAttr(t('chats.group.new')) +
    '" aria-label="' +
    escAttr(t('chats.group.new')) +
    '">' +
    icon('plus', 'size-3.5') +
    '</button>' +
    '</span>' +
    '</div>' +
    '<div class="ch-btree">' +
    ensureGroupTree().render() +
    '</div>'
  );
}
