/* ============================================================
 * app/core/app/settings-bridge.js — 设置桥接（updateSettings 统一入口）
 * ------------------------------------------------------------
 * - updateSettings(patch, opts):设置表单字段/模块改动统一入口
 *   (浅合并 → 配置文件快照同步 → 持久化 → 防抖落库 → 按触及域精准
 *   局部刷新:顶栏主题按钮/主题图表事件/用户菜单/侧边栏/Sheet/设置页)
 * - applySettingValue / applySettingField:'domain.field[.index]' 路径
 *   写嵌套设置值,自定义控件(下拉/日历等)也可复用
 * - 求值期副作用:data-setting 元素的 change/input document 委托
 *   (change 可重渲染同步 UI;input 逐键输入不重渲染,避免抢焦点)
 * 依赖方向：state ← server-sync ← shell-ui ← render ← 本文件。
 * ============================================================ */
'use strict';

import { settings, setSettings, sheetOpen, currentPath, tFor } from './state.js';
import { pushSettingsToServer } from './server-sync.js';
import { syncHeaderThemeButtons, syncUserMenu, refreshSidebar } from './shell-ui.js';
import { rerenderContent } from './render.js';

/**
 * @param {object} patch 部分设置(浅合并;子对象需整体替换,如 { profile: {...} })
 * @param {object} [opts] { noRerender: true } 用于输入框逐键更新时避免重渲染抢焦点
 */
export function updateSettings(patch, opts) {
  opts = opts || {};
  setSettings(Object.assign({}, settings, patch));
  // 外观/通知/显示发生变化时同步激活配置文件快照(须在 pushSettingsToServer 之前)
  if (patchTouches(patch, PROFILE_DOMAIN_KEYS)) syncActiveProfileSnapshot();
  App.settings.applySettings(settings);
  App.settings.persistSettings(settings);
  pushSettingsToServer(); // 双向同步:本地改动异步写入数据库 app_settings
  // 仅在相关设置变化时刷新顶栏/侧边栏:profile/account/notifications 等
  // 表单击键不重建侧边栏,避免高频输入触发不必要的整树 DOM 重建。
  if (patchTouches(patch, ['theme'])) syncHeaderThemeButtons();
  // 主题/外观变化后通知模块重建图表配色(如 dashboard 的 Chart.js)
  if (patchTouches(patch, ['theme', 'appearance']))
    document.dispatchEvent(new CustomEvent('app:themechange'));
  if (patchTouches(patch, ['profile'])) syncUserMenu();
  if (
    patchTouches(patch, [
      'locale',
      'sidebarVariant',
      'sidebarCollapsible',
      'sidebarWidth',
      'hiddenNav',
      'workspaces',
      'activeWorkspace',
    ])
  )
    refreshSidebar();
  if (sheetOpen) App.shell.rerenderSheetContent(settings, tFor(settings.locale));
  // 设置页与右上角面板同源:任一侧修改,当前设置页内容同步刷新(双向同步)
  if (!opts.noRerender && currentPath().indexOf('/settings') === 0) rerenderContent();
}

/** 判断 patch 是否触及某类设置(避免每次击键都重建整棵侧边栏/顶栏) */
function patchTouches(patch, keys) {
  return keys.some(function (k) {
    return Object.prototype.hasOwnProperty.call(patch, k);
  });
}

/** 配置文件域:命中这些键时把当前设置同步进激活配置文件的快照(VSCode 行为:改动即保存) */
var PROFILE_DOMAIN_KEYS = [
  'theme',
  'appearance',
  'notifications',
  'sidebarOpen',
  'sidebarVariant',
  'sidebarCollapsible',
  'sidebarWidth',
  'hiddenNav',
];

/** 把当前设置写回激活配置文件的快照(值未变化则跳过,避免无谓写存储) */
function syncActiveProfileSnapshot() {
  var list = settings.profiles || [];
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === settings.activeProfile) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return;
  var snap = App.settings.profileCapture(settings);
  if (JSON.stringify(list[idx].snapshot) === JSON.stringify(snap)) return;
  var next = list.slice();
  next[idx] = Object.assign({}, list[idx], { snapshot: snap });
  setSettings(Object.assign({}, settings, { profiles: next }));
}

/* ---------- 设置表单字段(个人资料/账号/通知)数据绑定 ---------- */
/** 写设置字段(路径如 profile.email / account.dob / notifications.mobile),自定义控件也可复用 */
export function applySettingValue(setting, value, noRerender) {
  var parts = String(setting || '').split('.');
  if (parts.length < 2) return;
  var domain = parts[0];
  if (domain !== 'profile' && domain !== 'account' && domain !== 'notifications') return;
  var fields = parts.slice(1);
  var current = Object.assign({}, settings[domain]);
  var target = current;
  for (var i = 0; i < fields.length - 1; i++) {
    var seg = fields[i];
    if (!target[seg] || typeof target[seg] !== 'object') target[seg] = {};
    target = target[seg];
  }
  target[fields[fields.length - 1]] = value;
  var patch = {};
  patch[domain] = current;
  updateSettings(patch, noRerender ? { noRerender: true } : undefined);
}

/** data-setting="domain.field[.index]" → 更新嵌套值并同步数据库 */
function applySettingField(el, noRerender) {
  var value = el.type === 'checkbox' ? !!el.checked : el.value;
  applySettingValue(el.getAttribute('data-setting'), value, noRerender);
}

// change:选择/复选/单选/失焦(可重渲染同步 UI);input:逐键输入(不重渲染,避免抢焦点)
document.addEventListener('change', function (e) {
  if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-setting')) {
    applySettingField(e.target, false);
  }
});
document.addEventListener('input', function (e) {
  if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-setting')) {
    applySettingField(e.target, true);
  }
});
