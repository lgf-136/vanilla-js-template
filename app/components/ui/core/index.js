/* ============================================================
 * core/index.js — App.ui kit 装配入口（ui.js ESM 拆分，总览见 ../index.js 头注）
 * ------------------------------------------------------------
 * 按依赖顺序导入全部控件族部分（utils → form / dropdown / radio →
 * context-menu → feedback → misc），并统一挂载 window.App.ui。
 * 挂载面与拆分前逐字一致（成员一个不少/不多/不改名）：
 *   平铺 23 项 + App.ui.contextMenu(6) + App.ui.radio(8)。
 * 副作用随各部分求值注册：dropdown 样式注入、context-menu 外点关闭、
 * feedback 的 Esc 全局监听。
 * ============================================================ */
'use strict';

import {
  cn,
  buttonClass,
  buttonIcon,
  badgeClass,
  cardClass,
  cardHeaderClass,
  cardTitleClass,
  cardContentClass,
  toggleItemClass,
} from './utils.js';
import { inputClass, switchRow, avatarHtml } from './form.js';
import {
  dropdownTriggerClass,
  dropdownContentClass,
  dropdownItemClass,
  dropdownLabelClass,
  dropdownSeparator,
} from './dropdown.js';
import {
  rgGridClass,
  radioSectionTitle,
  radioSectionTitleToggle,
  radioCheck,
  radioIconCard,
  radioSwatchPicker,
  radioSegmented,
  radioReadonlyRow,
} from './radio.js';
import { ctxItem, ctxSeparator, ctxSubmenu, ctxEmpty, contextMenuOpen, contextMenuClose } from './context-menu.js';
import { toast, dialog, closeDialog } from './feedback.js';
import { emptyState, placeholderCard, notFound, tagPill, tagPills } from './misc.js';

window.App = window.App || {};
App.ui = App.ui || {};
App.ui.cn = cn;
App.ui.toast = toast;
App.ui.buttonClass = buttonClass;
App.ui.buttonIcon = buttonIcon;
App.ui.badgeClass = badgeClass;
App.ui.cardClass = cardClass;
App.ui.cardHeaderClass = cardHeaderClass;
App.ui.cardTitleClass = cardTitleClass;
App.ui.cardContentClass = cardContentClass;
App.ui.toggleItemClass = toggleItemClass;
App.ui.inputClass = inputClass;
App.ui.switchRow = switchRow;
App.ui.dropdownTriggerClass = dropdownTriggerClass;
App.ui.dropdownContentClass = dropdownContentClass;
App.ui.dropdownItemClass = dropdownItemClass;
App.ui.dropdownLabelClass = dropdownLabelClass;
App.ui.dropdownSeparator = dropdownSeparator;
App.ui.avatarHtml = avatarHtml;
App.ui.placeholderCard = placeholderCard;
App.ui.notFound = notFound;
App.ui.emptyState = emptyState;
App.ui.dialog = dialog;
App.ui.closeDialog = closeDialog;
App.ui.contextMenu = {
  item: ctxItem,
  separator: ctxSeparator,
  submenu: ctxSubmenu,
  empty: ctxEmpty,
  open: contextMenuOpen,
  close: contextMenuClose,
};
App.ui.tagPill = tagPill;
App.ui.tagPills = tagPills;
App.ui.radio = {
  gridClass: rgGridClass,
  sectionTitle: radioSectionTitle,
  sectionTitleToggle: radioSectionTitleToggle,
  check: radioCheck,
  iconCard: radioIconCard,
  swatchPicker: radioSwatchPicker,
  segmented: radioSegmented,
  readonlyRow: radioReadonlyRow,
};
