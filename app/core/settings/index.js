/* ============================================================
 * settings/index.js — 设置状态管理装配入口(零依赖)
 * ------------------------------------------------------------
 * 由原单文件 app/core/settings.js(954 行)按业务域拆分(红线 12 /
 * ARCHITECTURE.md 2.3.1),对外 App.settings 挂载面逐字不变,
 * 消费方零改动。拆分设计与依赖方向(严格单向,无循环):
 *
 *   storage.js     最底层:html-template-* 键前缀/K()/localStorage
 *                  读读写删 + readJsonObject 白名单形状校验
 *   defaults.js    纯数据:profile/account/notifications 默认值、
 *                  头像枚举与 sanitizeAvatar、侧边栏边界/变体白名单、
 *                  radio-group 选项清单(THEME/SIDEBAR/LAYOUT_ITEMS)
 *   appearance.js  外观域:风格/色板/字体/圆角枚举与默认值、
 *                  readAppearance 白名单读取、isDarkMode/applySettings
 *                  (主题/风格/字体/圆角/菜单外观 → html class 与 CSS 变量)
 *   workspaces.js  工作空间注册表:默认工作空间/slug/唯一 id/
 *                  normalizeWorkspace/列表与活跃指针读取
 *   profiles.js    配置文件注册表:PROFILE_HANDLERS 域表驱动的
 *                  capture/apply、默认与规范化、列表与活跃指针读取
 *   state.js       聚合层:readSettings 全量白名单读取 /
 *                  persistSettings 全量持久化 / resetAllSettings 重置
 *   index.js       装配:挂载 window.App.settings(成员集合与拆分前
 *                  完全一致,一个不能少/多/改名);本文件无业务逻辑
 *
 * 与服务端 app_settings 的双向同步不在本目录:
 * pushSettingsToServer / mergeServerSettings 位于 app/core/app.js。
 * ============================================================ */
'use strict';

import {
  STORAGE_PREFIX,
  K,
  readStorage,
  writeStorage,
} from './storage.js';
import {
  AVATAR_TYPES,
  AVATAR_ICONS,
  AVATAR_EMOJIS,
  sanitizeAvatar,
  sanitizeProfileForStorage,
  sanitizeAccountForStorage,
  PROFILE_DEFAULTS,
  ACCOUNT_DEFAULTS,
  NOTIFICATIONS_DEFAULTS,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  THEME_ITEMS,
  SIDEBAR_ITEMS,
  LAYOUT_ITEMS,
} from './defaults.js';
import { STYLES, BASE_COLORS, CHART_COLORS, FONTS, RADII, APPEARANCE_DEFAULTS, applySettings, isDarkMode } from './appearance.js';
import {
  WORKSPACE_COLORS,
  WORKSPACE_ICONS,
  DEFAULT_WORKSPACES,
  defaultWorkspaces,
  slugify,
  uniqueWorkspaceId,
  normalizeWorkspace,
  workspaceDisplayName,
  findWorkspace,
} from './workspaces.js';
import {
  DEFAULT_PROFILES,
  defaultProfiles,
  findProfile,
  normalizeProfile,
  profileCapture,
  profileApply,
  profileDisplayName,
} from './profiles.js';
import { readSettings, persistSettings, resetAllSettings } from './state.js';

window.App = window.App || {};
App.settings = {
  STYLES: STYLES,
  BASE_COLORS: BASE_COLORS,
  CHART_COLORS: CHART_COLORS,
  WORKSPACE_COLORS: WORKSPACE_COLORS,
  WORKSPACE_ICONS: WORKSPACE_ICONS,
  DEFAULT_WORKSPACES: DEFAULT_WORKSPACES,
  FONTS: FONTS,
  RADII: RADII,
  SIDEBAR_DEFAULT_WIDTH: SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH: SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH: SIDEBAR_MAX_WIDTH,
  STORAGE_PREFIX: STORAGE_PREFIX,
  K: K,
  APPEARANCE_DEFAULTS: APPEARANCE_DEFAULTS,
  AVATAR_TYPES: AVATAR_TYPES,
  AVATAR_ICONS: AVATAR_ICONS,
  AVATAR_EMOJIS: AVATAR_EMOJIS,
  sanitizeAvatar: sanitizeAvatar,
  sanitizeProfileForStorage: sanitizeProfileForStorage,
  sanitizeAccountForStorage: sanitizeAccountForStorage,
  PROFILE_DEFAULTS: PROFILE_DEFAULTS,
  ACCOUNT_DEFAULTS: ACCOUNT_DEFAULTS,
  NOTIFICATIONS_DEFAULTS: NOTIFICATIONS_DEFAULTS,
  DEFAULT_PROFILES: DEFAULT_PROFILES,
  THEME_ITEMS: THEME_ITEMS,
  SIDEBAR_ITEMS: SIDEBAR_ITEMS,
  LAYOUT_ITEMS: LAYOUT_ITEMS,
  readSettings: readSettings,
  defaultProfiles: defaultProfiles,
  findProfile: findProfile,
  normalizeProfile: normalizeProfile,
  profileCapture: profileCapture,
  profileApply: profileApply,
  profileDisplayName: profileDisplayName,
  applySettings: applySettings,
  persistSettings: persistSettings,
  resetAllSettings: resetAllSettings,
  isDarkMode: isDarkMode,
  readStorage: readStorage,
  writeStorage: writeStorage,
  defaultWorkspaces: defaultWorkspaces,
  findWorkspace: findWorkspace,
  slugify: slugify,
  uniqueWorkspaceId: uniqueWorkspaceId,
  normalizeWorkspace: normalizeWorkspace,
  workspaceDisplayName: workspaceDisplayName,
};
