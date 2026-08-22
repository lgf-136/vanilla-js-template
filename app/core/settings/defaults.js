/* ============================================================
 * settings/defaults.js — 默认值与静态选项清单(零依赖)
 * ------------------------------------------------------------
 * settings 目录拆分设计见 index.js 头部;本文件为纯数据层:
 * - 设置子页数据默认值(profile/account/notifications,同步到数据库
 *   settings:profile / settings:account / settings:notifications)
 * - 头像类型枚举/预设图标/emoji 与 sanitizeAvatar 白名单校验
 * - 侧边栏宽度边界与变体白名单(display 域共用)
 * - 设置面板 radio-group 选项(THEME_ITEMS/SIDEBAR_ITEMS/LAYOUT_ITEMS,
 *   设置面板与 Settings → 外观页共用)
 * 不依赖本目录其它文件。
 * ============================================================ */
'use strict';

/** 设置子页数据默认值(同步到数据库 settings:profile / settings:account / settings:notifications) */
// 头像:type ∈ initial(用户名首字母)/ icon(预设图标)/ emoji / image(上传后裁剪为 256×256 方形 dataURL)
var AVATAR_TYPES = ['initial', 'icon', 'emoji', 'image'];
var AVATAR_ICONS = [
  'user',
  'rocket',
  'star',
  'heart',
  'sparkles',
  'globe',
  'plane',
  'coffee',
  'trophy',
  'brain-circuit',
  'key-round',
  'layers',
  'gamepad-2',
  'palette',
  'sun',
  'moon',
  'briefcase',
  'graduation-cap',
];
var AVATAR_EMOJIS = [
  '😀',
  '😎',
  '🤖',
  '🚀',
  '🌟',
  '🎯',
  '💡',
  '🎨',
  '☕',
  '🐱',
  '🐶',
  '🌸',
  '🍀',
  '⚡',
  '🔥',
  '👑',
  '🎮',
  '📚',
  '🎵',
  '🏆',
];
// 头像数据串长度上限(256×256 JPEG 约 20-40KB,此处留足余量防 localStorage/数据库膨胀)
var AVATAR_MAX_IMAGE_LENGTH = 400000;

var PROFILE_DEFAULTS = {
  username: '',
  email: '',
  bio: '',
  links: ['', ''],
  avatar: { type: 'initial', value: '' },
};

/** 头像字段白名单校验(类型枚举 + 值类型/长度上限),脏数据回退默认 */
function sanitizeAvatar(avatar) {
  var a = avatar && typeof avatar === 'object' ? avatar : {};
  var type = AVATAR_TYPES.indexOf(a.type) !== -1 ? a.type : 'initial';
  var value = typeof a.value === 'string' ? a.value.slice(0, AVATAR_MAX_IMAGE_LENGTH) : '';
  if (type === 'icon' && AVATAR_ICONS.indexOf(value) === -1) value = 'user';
  return { type: type, value: value };
}

/* ---------- 本地缓存脱敏(红线 14 / ARCHITECTURE 4.6) ---------- */
// 敏感字段(邮箱/姓名/用户名等)只落服务端密文,localStorage 本地副本只保留非敏感展示字段;
// 完整值由 syncSettingsFromServer 在内存态合并,设置页展示不受影响。
/** profile 本地缓存保留字段(非敏感展示字段;username/email 属敏感字段不落本地) */
var PROFILE_LOCAL_KEYS = ['bio', 'links', 'avatar'];
/** account 本地缓存保留字段(姓名属敏感字段不落本地) */
var ACCOUNT_LOCAL_KEYS = ['dob', 'language'];

/** 生成本地缓存的 profile 脱敏副本(白名单提取 + avatar 形状校验) */
function sanitizeProfileForStorage(profile) {
  var p = profile && typeof profile === 'object' ? profile : {};
  var out = {};
  PROFILE_LOCAL_KEYS.forEach(function (k) {
    if (k === 'avatar') out[k] = sanitizeAvatar(p[k]);
    else if (k === 'links') out[k] = Array.isArray(p[k]) ? p[k].slice(0, 16) : ['', ''];
    else out[k] = typeof p[k] === 'string' ? p[k] : '';
  });
  return out;
}

/** 生成本地缓存的 account 脱敏副本(白名单提取) */
function sanitizeAccountForStorage(account) {
  var a = account && typeof account === 'object' ? account : {};
  var out = {};
  ACCOUNT_LOCAL_KEYS.forEach(function (k) {
    out[k] = typeof a[k] === 'string' ? a[k] : '';
  });
  return out;
}
var ACCOUNT_DEFAULTS = { name: '', dob: '', language: '' };
var NOTIFICATIONS_DEFAULTS = {
  type: 'all',
  communication: false,
  marketing: false,
  social: true,
  security: true,
  mobile: false,
};
var SIDEBAR_VARIANTS = ['inset', 'floating', 'sidebar'];

var SIDEBAR_DEFAULT_WIDTH = 256;
var SIDEBAR_MIN_WIDTH = 160;
var SIDEBAR_MAX_WIDTH = 480;

/** 外观 radio-group 选项(设置面板与 Settings → 外观页共用) */
var THEME_ITEMS = [
  { value: 'system', icon: 'theme-system', labelKey: 'header.system' },
  { value: 'light', icon: 'theme-light', labelKey: 'header.light' },
  { value: 'dark', icon: 'theme-dark', labelKey: 'header.dark' },
];
var SIDEBAR_ITEMS = [
  { value: 'inset', icon: 'sidebar-inset', labelKey: 'settings.variantOptions.inset' },
  { value: 'floating', icon: 'sidebar-floating', labelKey: 'settings.variantOptions.floating' },
  { value: 'sidebar', icon: 'sidebar-sidebar', labelKey: 'settings.variantOptions.sidebar' },
];
var LAYOUT_ITEMS = [
  { value: 'default', icon: 'layout-default', labelKey: 'settings.layoutOptions.default' },
  { value: 'icon', icon: 'layout-compact', labelKey: 'settings.layoutOptions.icon' },
  { value: 'offcanvas', icon: 'layout-full', labelKey: 'settings.layoutOptions.offcanvas' },
];

export {
  AVATAR_TYPES,
  AVATAR_ICONS,
  AVATAR_EMOJIS,
  sanitizeAvatar,
  sanitizeProfileForStorage,
  sanitizeAccountForStorage,
  PROFILE_DEFAULTS,
  ACCOUNT_DEFAULTS,
  NOTIFICATIONS_DEFAULTS,
  SIDEBAR_VARIANTS,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  THEME_ITEMS,
  SIDEBAR_ITEMS,
  LAYOUT_ITEMS,
};
