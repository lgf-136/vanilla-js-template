/* ============================================================
 * settings/appearance.js — 外观域:枚举常量 + 读取 + 应用到 html(零依赖)
 * ------------------------------------------------------------
 * settings 目录拆分设计见 index.js 头部;本文件为外观业务域:
 * - 风格/基础色/强调色/字体/圆角枚举与 APPEARANCE_DEFAULTS
 * - readAppearance:逐项白名单校验读取(radius 存像素串需映射回
 *   RadiusName,font 存 stack 需映射回字体名)
 * - isDarkMode / applySettings:主题与外观应用到 html class、
 *   CSS 变量与侧边栏属性(--radius、--font-* 系列、--sidebar-width)
 * 依赖:storage.js(readStorage/K)。
 * ============================================================ */
'use strict';

import { K, readStorage } from './storage.js';

var STYLES = ['nova', 'vega', 'maia', 'lyra', 'mira', 'luma', 'sera', 'rhea'];
var BASE_COLORS = ['neutral', 'stone', 'zinc', 'mauve', 'olive', 'mist', 'taupe'];
var CHART_COLORS = [
  'amber',
  'blue',
  'cyan',
  'emerald',
  'fuchsia',
  'green',
  'indigo',
  'lime',
  'orange',
  'pink',
  'purple',
  'red',
  'rose',
  'sky',
  'teal',
  'violet',
  'yellow',
];
var FONTS = [
  {
    value: 'inter',
    label: 'Inter',
    stack: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  },
  {
    value: 'manrope',
    label: 'Manrope',
    stack: "'Manrope Variable', ui-sans-serif, system-ui, sans-serif",
  },
  { value: 'system', label: 'System', stack: 'ui-sans-serif, system-ui, sans-serif' },
];
var RADII = [
  { value: 'default', labelKey: 'settings.radiusOptions.default', px: '0.625rem' },
  { value: 'none', labelKey: 'settings.radiusOptions.none', px: '0rem' },
  { value: 'sm', labelKey: 'settings.radiusOptions.sm', px: '0.25rem' },
  { value: 'md', labelKey: 'settings.radiusOptions.md', px: '0.5rem' },
  { value: 'lg', labelKey: 'settings.radiusOptions.lg', px: '0.75rem' },
  { value: 'full', labelKey: 'settings.radiusOptions.full', px: '9999px' },
];

var APPEARANCE_DEFAULTS = {
  style: 'nova',
  baseColor: 'zinc',
  chartColor: 'zinc',
  radius: 'default',
  bodyFont: 'inter',
  headingFont: 'manrope',
  menuColor: 'default',
  menuAppearance: 'solid',
  // 基础色/强调色开关:启用时应用所选色板;关闭时回退到主题模式默认配色
  useBase: true,
  useAccent: true,
};

/** 读取外观设置:全部白名单校验 */
function readAppearance() {
  var ap = Object.assign({}, APPEARANCE_DEFAULTS);
  var style = readStorage(K('style'));
  if (style && STYLES.indexOf(style) !== -1) ap.style = style;
  var baseColor = readStorage(K('base'));
  if (baseColor && BASE_COLORS.indexOf(baseColor) !== -1) ap.baseColor = baseColor;
  var chartColor = readStorage(K('chart'));
  if (chartColor && CHART_COLORS.indexOf(chartColor) !== -1) ap.chartColor = chartColor;
  // 存储值为像素串(如 '0.5rem'),必须映射回 RadiusName
  var radius = readStorage(K('radius'));
  if (radius) {
    var r = RADII.find(function (x) {
      return x.px === radius;
    });
    if (r) ap.radius = r.value;
  }
  var f = readStorage(K('font'));
  if (f) {
    var bf = FONTS.find(function (x) {
      return x.stack === f;
    });
    if (bf) ap.bodyFont = bf.value;
  }
  var hf = readStorage(K('heading-font'));
  if (hf) {
    var h = FONTS.find(function (x) {
      return x.stack === hf;
    });
    if (h) ap.headingFont = h.value;
  }
  var menuColor = readStorage(K('menu-color'));
  if (menuColor === 'default' || menuColor === 'inverted') ap.menuColor = menuColor;
  var menuAppearance = readStorage(K('menu-appearance'));
  if (menuAppearance === 'solid' || menuAppearance === 'translucent')
    ap.menuAppearance = menuAppearance;
  var useBase = readStorage(K('use-base'));
  if (useBase === '0' || useBase === '1') ap.useBase = useBase === '1';
  var useAccent = readStorage(K('use-accent'));
  if (useAccent === '0' || useAccent === '1') ap.useAccent = useAccent === '1';
  return ap;
}

function isDarkMode(theme) {
  return (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

/** 应用主题/外观/侧边栏到 html 元素 */
function applySettings(s) {
  var root = document.documentElement;
  var dark = isDarkMode(s.theme);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';

  var applyMap = [
    ['style', s.appearance.style],
    ['base', s.appearance.useBase === false ? '' : s.appearance.baseColor],
    ['chart', s.appearance.useAccent === false ? '' : s.appearance.chartColor],
    ['menu-color', s.appearance.menuColor],
    ['menu-appearance', s.appearance.menuAppearance],
  ];
  applyMap.forEach(function (pair) {
    var prefix = pair[0];
    var value = pair[1];
    Array.prototype.forEach.call(root.classList, function (c) {
      if (c.indexOf(prefix + '-') === 0) root.classList.remove(c);
    });
    // 开关关闭时值为空串:只清除旧类,不添加新类,回退到默认配色
    if (value) root.classList.add(prefix + '-' + value);
  });

  var radiusPx = (
    RADII.find(function (r) {
      return r.value === s.appearance.radius;
    }) || RADII[0]
  ).px;
  root.style.setProperty('--radius', radiusPx);
  var bf = (
    FONTS.find(function (f) {
      return f.value === s.appearance.bodyFont;
    }) || FONTS[0]
  ).stack;
  var hf = (
    FONTS.find(function (f) {
      return f.value === s.appearance.headingFont;
    }) || FONTS[1]
  ).stack;
  root.style.setProperty('--font-sans-base', bf);
  root.style.setProperty('--font-heading-base', hf);

  root.setAttribute('data-sidebar-variant', s.sidebarVariant);
  root.setAttribute('data-sidebar-collapsible', s.sidebarCollapsible);
  root.style.setProperty('--sidebar-width', s.sidebarWidth + 'px');
  // wrapper 上有内联 style(--sidebar-width),优先级更高,必须同步更新
  var wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
  if (wrapper) wrapper.style.setProperty('--sidebar-width', s.sidebarWidth + 'px');
}

export {
  STYLES,
  BASE_COLORS,
  CHART_COLORS,
  FONTS,
  RADII,
  APPEARANCE_DEFAULTS,
  readAppearance,
  isDarkMode,
  applySettings,
};
