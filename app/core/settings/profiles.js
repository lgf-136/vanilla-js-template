/* ============================================================
 * settings/profiles.js — 配置文件(VSCode 风格)注册表与活跃指针(零依赖)
 * ------------------------------------------------------------
 * settings 目录拆分设计见 index.js 头部;本文件为配置文件业务域:
 * - PROFILE_HANDLERS 域表(appearance/notifications/display):
 *   每域 capture 抓取 / apply 还原,新增域只需在表内加一项,
 *   捕获与应用全部由 profileCapture / profileApply 表驱动
 * - defaultProfiles/normalizeProfile/readProfiles/readActiveProfile/
 *   findProfile/profileDisplayName(内置默认项按 nameKey 走 i18n)
 * 依赖:storage.js(readStorage/K)、appearance.js(外观枚举与默认值)、
 *       defaults.js(通知默认值与侧边栏边界/变体白名单)。
 * ============================================================ */
'use strict';

import { K, readStorage } from './storage.js';
import {
  STYLES,
  BASE_COLORS,
  CHART_COLORS,
  FONTS,
  RADII,
  APPEARANCE_DEFAULTS,
} from './appearance.js';
import {
  NOTIFICATIONS_DEFAULTS,
  SIDEBAR_VARIANTS,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from './defaults.js';

/* ---------- 配置文件(VSCode 风格:保存 外观/通知/显示 的设置组合,支持增删改与切换) ---------- */
// 每个配置文件的 snapshot 为 { <域>: <该域设置> } 的结构;
// 新增域时只需在 PROFILE_HANDLERS 增加一项(capture 抓取 / apply 还原),
// 捕获与应用逻辑全部由 profileCapture / profileApply 按表驱动,无需改动其它代码。
var DEFAULT_PROFILES = [
  { id: 'p-default', name: '', nameKey: 'profiles.defaultName', snapshot: {} },
];

var PROFILE_HANDLERS = {
  appearance: {
    capture: function (s) {
      var ap = s.appearance || {};
      return {
        theme: s.theme,
        style: ap.style,
        baseColor: ap.baseColor,
        chartColor: ap.chartColor,
        radius: ap.radius,
        bodyFont: ap.bodyFont,
        headingFont: ap.headingFont,
        menuColor: ap.menuColor,
        menuAppearance: ap.menuAppearance,
        useBase: ap.useBase !== false,
        useAccent: ap.useAccent !== false,
      };
    },
    apply: function (out, data) {
      data = data || {};
      out.theme =
        data.theme === 'system' || data.theme === 'light' || data.theme === 'dark'
          ? data.theme
          : 'system';
      var ap = Object.assign({}, APPEARANCE_DEFAULTS, data);
      ap.style = STYLES.indexOf(ap.style) !== -1 ? ap.style : APPEARANCE_DEFAULTS.style;
      ap.baseColor =
        BASE_COLORS.indexOf(ap.baseColor) !== -1 ? ap.baseColor : APPEARANCE_DEFAULTS.baseColor;
      ap.chartColor =
        CHART_COLORS.indexOf(ap.chartColor) !== -1
          ? ap.chartColor
          : APPEARANCE_DEFAULTS.chartColor;
      ap.radius = RADII.some(function (r) {
        return r.value === ap.radius;
      })
        ? ap.radius
        : APPEARANCE_DEFAULTS.radius;
      ap.bodyFont = FONTS.some(function (f) {
        return f.value === ap.bodyFont;
      })
        ? ap.bodyFont
        : APPEARANCE_DEFAULTS.bodyFont;
      ap.headingFont = FONTS.some(function (f) {
        return f.value === ap.headingFont;
      })
        ? ap.headingFont
        : APPEARANCE_DEFAULTS.headingFont;
      ap.menuColor = ap.menuColor === 'inverted' ? 'inverted' : 'default';
      ap.menuAppearance = ap.menuAppearance === 'translucent' ? 'translucent' : 'solid';
      out.appearance = ap;
    },
  },
  notifications: {
    capture: function (s) {
      return Object.assign({}, NOTIFICATIONS_DEFAULTS, s.notifications || {});
    },
    apply: function (out, data) {
      out.notifications = Object.assign({}, NOTIFICATIONS_DEFAULTS, data || {});
    },
  },
  display: {
    capture: function (s) {
      return {
        sidebarOpen: !!s.sidebarOpen,
        sidebarVariant: s.sidebarVariant,
        sidebarCollapsible: s.sidebarCollapsible,
        sidebarWidth: s.sidebarWidth,
        hiddenNav: (s.hiddenNav || []).slice(),
      };
    },
    apply: function (out, data) {
      data = data || {};
      out.sidebarOpen = data.sidebarOpen === undefined ? true : !!data.sidebarOpen;
      out.sidebarVariant =
        SIDEBAR_VARIANTS.indexOf(data.sidebarVariant) !== -1 ? data.sidebarVariant : 'inset';
      out.sidebarCollapsible =
        data.sidebarCollapsible === 'icon' || data.sidebarCollapsible === 'offcanvas'
          ? data.sidebarCollapsible
          : 'icon';
      var n = Number(data.sidebarWidth);
      out.sidebarWidth =
        Number.isFinite(n) && n >= SIDEBAR_MIN_WIDTH && n <= SIDEBAR_MAX_WIDTH
          ? n
          : SIDEBAR_DEFAULT_WIDTH;
      out.hiddenNav = Array.isArray(data.hiddenNav)
        ? data.hiddenNav.filter(function (x) {
            return typeof x === 'string' && x;
          })
        : [];
    },
  },
};

/** 抓取当前设置为配置文件快照(按 PROFILE_HANDLERS 域表驱动,天然可扩展) */
function profileCapture(s) {
  var snap = {};
  Object.keys(PROFILE_HANDLERS).forEach(function (k) {
    snap[k] = PROFILE_HANDLERS[k].capture(s);
  });
  return snap;
}

/** 把配置文件快照应用到设置对象(保留未涉及字段;各域值做白名单校验) */
function profileApply(s, snapshot) {
  var out = Object.assign({}, s);
  Object.keys(PROFILE_HANDLERS).forEach(function (k) {
    if (snapshot && snapshot[k]) PROFILE_HANDLERS[k].apply(out, snapshot[k]);
  });
  return out;
}

/** 默认配置文件快照(基于出厂默认设置) */
function defaultProfiles() {
  var base = {
    theme: 'system',
    appearance: Object.assign({}, APPEARANCE_DEFAULTS),
    notifications: Object.assign({}, NOTIFICATIONS_DEFAULTS),
    sidebarOpen: true,
    sidebarVariant: 'inset',
    sidebarCollapsible: 'icon',
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    hiddenNav: [],
  };
  return DEFAULT_PROFILES.map(function (p) {
    return {
      id: p.id,
      name: p.name,
      nameKey: p.nameKey,
      snapshot: profileCapture(base),
    };
  });
}

/** 规范化任意来源的配置文件对象(白名单形状,脏数据回退空值) */
function normalizeProfile(p) {
  return {
    id: String(p && p.id ? p.id : ''),
    name: p && typeof p.name === 'string' ? p.name : '',
    nameKey: p && typeof p.nameKey === 'string' ? p.nameKey : '',
    snapshot: p && p.snapshot && typeof p.snapshot === 'object' ? p.snapshot : {},
  };
}

/** 读取配置文件列表(非法项丢弃,空列表回退默认;始终确保内置默认配置文件存在) */
function readProfiles() {
  var stored = readStorage(K('profiles'));
  if (!stored) return defaultProfiles();
  try {
    var arr = JSON.parse(stored);
    if (!Array.isArray(arr) || !arr.length) return defaultProfiles();
    var out = arr
      .filter(function (p) {
        return (
          p &&
          typeof p === 'object' &&
          typeof p.id === 'string' &&
          p.id &&
          (typeof p.name === 'string' || typeof p.nameKey === 'string')
        );
      })
      .map(normalizeProfile);
    if (!out.length) return defaultProfiles();
    if (
      !out.some(function (p) {
        return p.id === DEFAULT_PROFILES[0].id;
      })
    )
      out.unshift(defaultProfiles()[0]);
    return out;
  } catch (e) {
    return defaultProfiles();
  }
}

/** 读取当前配置文件 id(不在列表中则回退第一个) */
function readActiveProfile(profiles) {
  var stored = readStorage(K('active-profile'));
  if (
    stored &&
    profiles.some(function (p) {
      return p.id === stored;
    })
  ) {
    return stored;
  }
  return profiles[0].id;
}

/** 按 id 查找配置文件(找不到回退第一个) */
function findProfile(list, id) {
  var arr = list && list.length ? list : defaultProfiles();
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === id) return arr[i];
  }
  return arr[0];
}

/** 配置文件显示名:内置默认(带 nameKey)按当前语言翻译,自定义名原样显示 */
function profileDisplayName(p, t) {
  if (!p) return '';
  if (p.nameKey) return t ? t(p.nameKey) : p.nameKey;
  return p.name || '';
}

export {
  DEFAULT_PROFILES,
  profileCapture,
  profileApply,
  defaultProfiles,
  normalizeProfile,
  readProfiles,
  readActiveProfile,
  findProfile,
  profileDisplayName,
};
