/* ============================================================
 * app/core/app/actions.js — 设置动作（薄封装层）
 * ------------------------------------------------------------
 * 面向事件委托与 App.* 挂载的设置动作,全部收敛到 updateSettings /
 * renderApp 等更底层入口:
 *   - setTheme / setLocale / setAppearance:主题、语言、外观增量
 *   - setSidebarVariant / setSidebarCollapsible / setSidebarWidth /
 *     setSidebarOpen / setLayout:侧边栏形态(宽度经 MIN/MAX 收敛)
 *   - resetAppearance:仅重置外观(不清语言/宽度)
 *   - resetSettings:全量重置(清 openSubmenus,结果写回数据库)
 * 对外挂载:App.setSidebarWidth(interactions.js 拖拽调宽收尾使用)。
 * 依赖方向：state ← bridge/shell-ui/render/server-sync ← 本文件。
 * ============================================================ */
'use strict';

import { settings, setSettings, sheetOpen, resetOpenSubmenus, tFor } from './state.js';
import { updateSettings } from './settings-bridge.js';
import { syncSidebarState } from './shell-ui.js';
import { renderApp } from './render.js';
import { pushSettingsToServer } from './server-sync.js';

export function setTheme(theme) {
  updateSettings({ theme: theme });
}

export function setLocale(locale) {
  setSettings(Object.assign({}, settings, { locale: locale }));
  App.settings.applySettings(settings);
  App.settings.persistSettings(settings);
  document.documentElement.lang = locale;
  renderApp();
  if (sheetOpen) App.shell.rerenderSheetContent(settings, tFor(locale));
}

export function setAppearance(patch) {
  updateSettings({ appearance: Object.assign({}, settings.appearance, patch) });
}

export function setSidebarVariant(v) {
  updateSettings({ sidebarVariant: v });
}

export function setSidebarCollapsible(c) {
  updateSettings({ sidebarCollapsible: c });
}

export function setSidebarWidth(w) {
  var clamped = Math.min(
    App.settings.SIDEBAR_MAX_WIDTH,
    Math.max(App.settings.SIDEBAR_MIN_WIDTH, Math.round(w))
  );
  updateSettings({ sidebarWidth: clamped });
}

export function setLayout(v) {
  if (v === 'default') {
    setSidebarOpen(true);
  } else {
    setSidebarOpen(false);
    setSidebarCollapsible(v === 'icon' ? 'icon' : 'offcanvas');
  }
}

/** 重置外观(主题/布局/外观),与 mpages Settings → Appearance 一致,不清除语言与宽度 */
export function resetAppearance() {
  updateSettings({
    theme: 'system',
    appearance: Object.assign({}, App.settings.APPEARANCE_DEFAULTS),
    sidebarVariant: 'inset',
    sidebarCollapsible: 'icon',
  });
  setSidebarOpen(true);
}

// ---------- Sidebar(展开/收起状态纳入 settings.sidebarOpen,随配置文件与数据库同步) ----------
export function setSidebarOpen(open) {
  updateSettings({ sidebarOpen: !!open }, { noRerender: true });
  syncSidebarState();
}

export function resetSettings() {
  setSettings(App.settings.resetAllSettings());
  resetOpenSubmenus();
  App.settings.applySettings(settings);
  document.documentElement.lang = settings.locale;
  pushSettingsToServer(); // 重置结果写回数据库
  renderApp();
  if (sheetOpen) App.shell.rerenderSheetContent(settings, tFor(settings.locale));
}
