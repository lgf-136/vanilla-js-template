/* ============================================================
 * app/core/app/events.js — 全局点击事件委托（副作用文件）
 * ------------------------------------------------------------
 * 单个 document click 委托处理全部壳层交互(重渲染后无需重新绑定):
 *   登出 / 导航链接 / 主题与语言切换 / 下拉 / 设置面板(Sheet)开合 /
 *   侧边栏折叠与移动端抽屉 / 子菜单展开收起 / 设置面板卡片 /
 *   基础色·强调色开关 / 色板 / 分段控件(风格·字体·圆角·菜单) /
 *   重置设置与外观 / 显示页菜单可见性切换 / 点击外部关闭下拉。
 * 铁律:本文件仅注册监听器、无导出被消费——必须由 index.js 显式导入,
 * 否则 ESM 不求值、全部交互静默失效。
 * 依赖方向：state ← render/bridge/shell-ui/actions ← 本文件（最上层）。
 * ============================================================ */
'use strict';

import { settings } from './state.js';
import { navigate } from './render.js';
import { updateSettings } from './settings-bridge.js';
import {
  toggleDropdown,
  openSheet,
  closeSheet,
  toggleSubmenu,
  closeDropdowns,
} from './shell-ui.js';
import {
  setTheme,
  setLocale,
  setAppearance,
  setSidebarVariant,
  setLayout,
  resetSettings,
  resetAppearance,
  setSidebarOpen,
} from './actions.js';

// ---------- 事件委托 ----------
document.addEventListener('click', function (e) {
  var target = e.target;

  // 登出(顶栏按钮 / 侧边栏用户菜单)
  if (target.closest && target.closest('[data-signout]')) {
    closeSheet();
    App.auth.logout();
    return;
  }
  // 导航链接
  var link = target.closest ? target.closest('a[data-link]') : null;
  if (link) {
    e.preventDefault();
    navigate(link.getAttribute('data-link') || '/');
    return;
  }
  // 主题切换
  var themeBtn = target.closest ? target.closest('[data-theme-btn]') : null;
  if (themeBtn) {
    setTheme(themeBtn.dataset.themeBtn);
    return;
  }
  // 语言切换
  var langBtn = target.closest ? target.closest('[data-lang]') : null;
  if (langBtn) {
    setLocale(langBtn.dataset.lang);
    return;
  }
  // 下拉
  var ddTrigger = target.closest ? target.closest('[data-dropdown-trigger]') : null;
  if (ddTrigger) {
    toggleDropdown(ddTrigger);
    return;
  }
  // 设置面板
  if (target.closest && target.closest('[data-sheet-trigger]')) {
    openSheet();
    return;
  }
  if (
    target.closest &&
    (target.closest('[data-sheet-close]') || target.closest('[data-sheet-overlay]'))
  ) {
    closeSheet();
    return;
  }
  // 侧边栏折叠 / 移动端(移动端抽屉在 app/core/interactions.js)
  var sidebarTrigger = target.closest ? target.closest('[data-sidebar-trigger]') : null;
  if (sidebarTrigger) {
    if (App.interactions.isMobile()) App.interactions.openMobileSidebar();
    else setSidebarOpen(!settings.sidebarOpen);
    return;
  }
  // 子菜单展开/收起(文档、设置等含 children 的父菜单)
  var submenuToggle = target.closest ? target.closest('[data-submenu-toggle]') : null;
  if (submenuToggle) {
    toggleSubmenu(submenuToggle.dataset.submenuToggle);
    return;
  }
  // 设置面板卡片
  var settingsCard = target.closest ? target.closest('[data-settings-card]') : null;
  if (settingsCard) {
    var parts = (settingsCard.dataset.settingsCard || ':').split(':');
    var kind = parts[0];
    var value = parts[1];
    if (kind === 'theme') setTheme(value);
    else if (kind === 'sidebar') setSidebarVariant(value);
    else if (kind === 'layout') setLayout(value);
    return;
  }
  // 基础色/强调色启用开关
  var themeToggle = target.closest ? target.closest('[data-theme-toggle]') : null;
  if (themeToggle) {
    var tk = themeToggle.getAttribute('data-theme-toggle');
    if (tk === 'base') setAppearance({ useBase: settings.appearance.useBase === false });
    else if (tk === 'chart') setAppearance({ useAccent: settings.appearance.useAccent === false });
    return;
  }
  // 色板
  var swatch = target.closest ? target.closest('[data-swatch]') : null;
  if (swatch) {
    var val = swatch.dataset.value || '';
    if (swatch.dataset.swatch === 'base') setAppearance({ baseColor: val });
    else if (swatch.dataset.swatch === 'chart') setAppearance({ chartColor: val });
    return;
  }
  // 分段控件
  var segmented = target.closest ? target.closest('[data-segmented]') : null;
  if (segmented) {
    var v = segmented.dataset.value || '';
    switch (segmented.dataset.segmented) {
      case 'style':
        setAppearance({ style: v });
        break;
      case 'body-font':
        setAppearance({ bodyFont: v });
        break;
      case 'heading-font':
        setAppearance({ headingFont: v });
        break;
      case 'radius':
        setAppearance({ radius: v });
        break;
      case 'menu-color':
        setAppearance({ menuColor: v });
        break;
      case 'menu-appearance':
        setAppearance({ menuAppearance: v });
        break;
    }
    return;
  }
  if (target.closest && target.closest('[data-reset-settings]')) {
    resetSettings();
    return;
  }
  // 仅重置外观(设置页 外观 → 重置外观,不清语言/宽度)
  if (target.closest && target.closest('[data-reset-appearance]')) {
    resetAppearance();
    return;
  }
  // 显示页:切换侧边栏菜单项可见性(设置项锁定,不可切换)
  var navToggle = target.closest ? target.closest('[data-nav-toggle]') : null;
  if (navToggle) {
    var navId = navToggle.dataset.navToggle;
    if (navId && navId !== 'settings') {
      var hidden = settings.hiddenNav.slice();
      var idx = hidden.indexOf(navId);
      if (idx === -1) hidden.push(navId);
      else hidden.splice(idx, 1);
      updateSettings({ hiddenNav: hidden });
    }
    return;
  }
  // 点击外部关闭下拉
  if (!target.closest || !target.closest('[data-dropdown]')) closeDropdowns();
});
