/* ============================================================
 * settings/state.js — 设置状态聚合:完整读取/持久化/重置(零依赖)
 * ------------------------------------------------------------
 * settings 目录拆分设计见 index.js 头部;本文件为跨域聚合层:
 * - readSettings:汇总各域读取(locale/theme/外观/侧边栏/工作空间/
 *   配置文件/profile/account/notifications),全部白名单校验
 * - persistSettings:全量写回 html-template-* 本地键
 * - resetAllSettings:清除全部存储键并返回出厂默认设置
 * 依赖:storage.js、defaults.js、appearance.js、workspaces.js、
 *       profiles.js(下层各域,不含 index)。
 * ============================================================ */
'use strict';

import {
  K,
  readStorage,
  writeStorage,
  removeStorage,
  readJsonObject,
} from './storage.js';
import {
  PROFILE_DEFAULTS,
  ACCOUNT_DEFAULTS,
  NOTIFICATIONS_DEFAULTS,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  sanitizeAvatar,
} from './defaults.js';
import { APPEARANCE_DEFAULTS, RADII, FONTS, readAppearance } from './appearance.js';
import {
  DEFAULT_WORKSPACES,
  defaultWorkspaces,
  readWorkspaces,
  readActiveWorkspace,
} from './workspaces.js';
import {
  DEFAULT_PROFILES,
  defaultProfiles,
  readProfiles,
  readActiveProfile,
} from './profiles.js';

/** 读取侧边栏展开状态(默认展开;纯静态方式也适用) */
function readSidebarOpen() {
  var v = readStorage(K('sidebar-open'));
  return v !== 'false';
}

/** 读取完整设置 */
function readSettings() {
  var storedLocale = readStorage(App.i18n.LOCALE_KEY);
  var locale =
    storedLocale === 'zh-CN' || storedLocale === 'zh-TW' || storedLocale === 'en'
      ? storedLocale
      : App.i18n.DEFAULT_LOCALE;
  var storedTheme = readStorage(K('theme'));
  var theme =
    storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : 'system';
  var storedVariant = readStorage(K('sidebar-variant'));
  var sidebarVariant =
    storedVariant === 'inset' || storedVariant === 'floating' || storedVariant === 'sidebar'
      ? storedVariant
      : 'inset';
  var storedCollapsible = readStorage(K('sidebar-collapsible'));
  var sidebarCollapsible =
    storedCollapsible === 'icon' || storedCollapsible === 'offcanvas'
      ? storedCollapsible
      : 'icon';
  var n = Number(readStorage(K('sidebar-width')));
  var sidebarWidth =
    Number.isFinite(n) && n >= SIDEBAR_MIN_WIDTH && n <= SIDEBAR_MAX_WIDTH
      ? n
      : SIDEBAR_DEFAULT_WIDTH;
  // 侧边栏隐藏的菜单项(显示页控制):JSON 数组,白名单为字符串
  var hiddenNav = [];
  var storedHidden = readStorage(K('hidden-nav'));
  if (storedHidden) {
    try {
      var arr = JSON.parse(storedHidden);
      if (Array.isArray(arr)) {
        hiddenNav = arr.filter(function (x) {
          return typeof x === 'string' && x;
        });
      }
    } catch (e) {
      /* 脏数据回退空数组 */
    }
  }
  var workspaces = readWorkspaces();
  var profiles = readProfiles();
  var profile = readJsonObject('profile', PROFILE_DEFAULTS, ['links']);
  profile.avatar = sanitizeAvatar(profile.avatar);
  return {
    locale: locale,
    theme: theme,
    appearance: readAppearance(),
    sidebarVariant: sidebarVariant,
    sidebarCollapsible: sidebarCollapsible,
    sidebarWidth: sidebarWidth,
    hiddenNav: hiddenNav,
    sidebarOpen: readSidebarOpen(),
    workspaces: workspaces,
    activeWorkspace: readActiveWorkspace(workspaces),
    profiles: profiles,
    activeProfile: readActiveProfile(profiles),
    profile: profile,
    account: readJsonObject('account', ACCOUNT_DEFAULTS),
    notifications: readJsonObject('notifications', NOTIFICATIONS_DEFAULTS),
  };
}

/** 持久化全部设置 */
function persistSettings(s) {
  writeStorage(App.i18n.LOCALE_KEY, s.locale);
  writeStorage(K('theme'), s.theme);
  var radiusPx = (
    RADII.find(function (r) {
      return r.value === s.appearance.radius;
    }) || RADII[0]
  ).px;
  var writes = [
    [K('style'), s.appearance.style],
    [K('base'), s.appearance.baseColor],
    [K('chart'), s.appearance.chartColor],
    [K('radius'), radiusPx],
    [
      K('font'),
      (
        FONTS.find(function (f) {
          return f.value === s.appearance.bodyFont;
        }) || FONTS[0]
      ).stack,
    ],
    [
      K('heading-font'),
      (
        FONTS.find(function (f) {
          return f.value === s.appearance.headingFont;
        }) || FONTS[1]
      ).stack,
    ],
    [K('menu-color'), s.appearance.menuColor],
    [K('menu-appearance'), s.appearance.menuAppearance],
    [K('use-base'), s.appearance.useBase === false ? '0' : '1'],
    [K('use-accent'), s.appearance.useAccent === false ? '0' : '1'],
    [K('sidebar-variant'), s.sidebarVariant],
    [K('sidebar-collapsible'), s.sidebarCollapsible],
    [K('sidebar-width'), String(s.sidebarWidth)],
  ];
  writeStorage(K('hidden-nav'), JSON.stringify(s.hiddenNav || []));
  writeStorage(K('sidebar-open'), String(!!s.sidebarOpen));
  writeStorage(K('profile'), JSON.stringify(s.profile || PROFILE_DEFAULTS));
  writeStorage(K('account'), JSON.stringify(s.account || ACCOUNT_DEFAULTS));
  writeStorage(K('notifications'), JSON.stringify(s.notifications || NOTIFICATIONS_DEFAULTS));
  writeStorage(
    K('workspaces'),
    JSON.stringify(s.workspaces && s.workspaces.length ? s.workspaces : DEFAULT_WORKSPACES)
  );
  writeStorage(K('active-workspace'), s.activeWorkspace || DEFAULT_WORKSPACES[0].id);
  writeStorage(
    K('profiles'),
    JSON.stringify(s.profiles && s.profiles.length ? s.profiles : defaultProfiles())
  );
  writeStorage(K('active-profile'), s.activeProfile || DEFAULT_PROFILES[0].id);
  writes.forEach(function (w) {
    if (w[1]) writeStorage(w[0], w[1]);
  });
}

/** 重置全部设置到默认值并清除存储 */
function resetAllSettings() {
  [
    App.i18n.LOCALE_KEY,
    K('theme'),
    K('style'),
    K('base'),
    K('chart'),
    K('radius'),
    K('font'),
    K('heading-font'),
    K('menu-color'),
    K('menu-appearance'),
    K('use-base'),
    K('use-accent'),
    K('sidebar-variant'),
    K('sidebar-collapsible'),
    K('sidebar-width'),
    K('sidebar-open'),
    K('hidden-nav'),
    K('profile'),
    K('account'),
    K('notifications'),
    K('workspaces'),
    K('active-workspace'),
    K('profiles'),
    K('active-profile'),
  ].forEach(removeStorage);
  return {
    locale: App.i18n.DEFAULT_LOCALE,
    theme: 'system',
    appearance: Object.assign({}, APPEARANCE_DEFAULTS),
    sidebarVariant: 'inset',
    sidebarCollapsible: 'icon',
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    hiddenNav: [],
    sidebarOpen: true,
    workspaces: defaultWorkspaces(),
    activeWorkspace: DEFAULT_WORKSPACES[0].id,
    profiles: defaultProfiles(),
    activeProfile: DEFAULT_PROFILES[0].id,
    profile: {
      username: '',
      email: '',
      bio: '',
      links: ['', ''],
      avatar: { type: 'initial', value: '' },
    },
    account: Object.assign({}, ACCOUNT_DEFAULTS),
    notifications: Object.assign({}, NOTIFICATIONS_DEFAULTS),
  };
}

export { readSettings, persistSettings, resetAllSettings };
