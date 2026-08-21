/* ============================================================
 * app/core/app/shell-ui.js — 壳层 UI 原位操作
 * ------------------------------------------------------------
 * 不整树重建、只对既有 DOM 原位同步/局部替换的壳层操作：
 *   - 侧边栏:syncSidebarState(data-state/collapsible/variant/open 属性)、
 *     refreshSidebar(outerHTML 整段替换 + 状态回放)、toggleSubmenu
 *   - 下拉:closeDropdowns / toggleDropdown(视口上下半区自动向上展开)
 *   - 设置面板(Sheet):openSheet / closeSheet(body 级 overlay + 面板)
 *   - 顶栏:syncHeaderThemeButtons(胶囊 radio group 选中反白)、
 *     syncUserMenu(头像/用户名/邮箱原位更新,避免整树重建)
 * 依赖方向：state ← nav ← 本文件（不依赖 render/bridge，供其反向调用）。
 * ============================================================ */
'use strict';

import { app, settings, sheetOpen, setSheetOpen, openSubmenus, currentPath, tFor } from './state.js';
import { buildNavItems } from './nav.js';

// ---------- Sidebar(展开/收起状态纳入 settings.sidebarOpen,随配置文件与数据库同步) ----------
export function syncSidebarState() {
  var open = !!settings.sidebarOpen;
  var root = app.querySelector('[data-slot="sidebar"]');
  if (!root) return;
  root.setAttribute('data-state', open ? 'expanded' : 'collapsed');
  root.setAttribute('data-collapsible', open ? '' : settings.sidebarCollapsible);
  root.setAttribute('data-variant', settings.sidebarVariant);
  var container = app.querySelector('[data-slot="sidebar-container"]');
  if (container) container.setAttribute('data-collapsible', open ? '' : settings.sidebarCollapsible);
  var sidebarEl = app.querySelector('[data-slot="sidebar"]');
  if (sidebarEl) sidebarEl.setAttribute('data-open', String(open));
}

export function refreshSidebar() {
  var sidebarEl = app.querySelector('[data-slot="sidebar"]');
  if (!sidebarEl) return;
  var pathname = currentPath();
  var navItems = buildNavItems(settings.locale);
  sidebarEl.outerHTML = App.shell.sidebarHtml(
    navItems,
    settings,
    tFor(settings.locale),
    pathname,
    openSubmenus
  );
  syncSidebarState();
}

export function toggleSubmenu(id) {
  openSubmenus[id] = !openSubmenus[id];
  refreshSidebar();
}

// ---------- Dropdown ----------
export function closeDropdowns() {
  document.querySelectorAll('[data-dropdown-menu]').forEach(function (m) {
    m.classList.remove('open');
  });
  document.querySelectorAll('[data-dropdown-trigger]').forEach(function (tr) {
    tr.removeAttribute('aria-expanded');
  });
}

export function toggleDropdown(trigger) {
  var wrap = trigger.closest('[data-dropdown]');
  if (!wrap) return;
  var menu = wrap.querySelector('[data-dropdown-menu]');
  if (!menu) return;
  var wasOpen = menu.classList.contains('open');
  closeDropdowns();
  if (wasOpen) return;
  var rect = wrap.getBoundingClientRect();
  if (rect.bottom > window.innerHeight * 0.7) {
    menu.style.bottom = '100%';
    menu.style.top = 'auto';
    menu.style.marginBottom = '4px';
  } else {
    menu.style.top = '100%';
    menu.style.bottom = 'auto';
    menu.style.marginTop = '4px';
  }
  menu.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
}

// ---------- 设置面板(Sheet) ----------
export function openSheet() {
  if (sheetOpen) return;
  var overlay = document.createElement('div');
  overlay.dataset.sheetOverlay = '';
  overlay.className = 'fixed inset-0 z-40 bg-black/50';
  overlay.addEventListener('click', closeSheet);
  var holder = document.createElement('div');
  holder.innerHTML = App.shell.renderSettingsSheet(settings, tFor(settings.locale));
  var sheetEl = holder.firstElementChild;
  document.body.append(overlay, sheetEl);
  setSheetOpen(true);
}

export function closeSheet() {
  if (!sheetOpen) return;
  var overlay = document.querySelector('[data-sheet-overlay]');
  if (overlay) overlay.remove();
  var sheet = document.querySelector('[data-settings-sheet]');
  if (sheet) sheet.remove();
  setSheetOpen(false);
}

// ---------- 顶栏/用户菜单原位同步 ----------
export function syncHeaderThemeButtons() {
  app.querySelectorAll('[data-theme-btn]').forEach(function (btn) {
    var pressed = btn.dataset.themeBtn === settings.theme;
    btn.setAttribute('aria-pressed', String(pressed));
    btn.classList.toggle('is-checked', pressed); // 胶囊式 radio group:选中项反白填充
  });
}

/** 个人资料变化时原位更新侧边栏用户菜单(头像/用户名/邮箱),避免整树重建 */
export function syncUserMenu() {
  var profile = settings.profile || {};
  var avatarHtml = App.ui.avatarHtml(profile, 'size-8');
  var name = profile.username || 'Admin';
  var email = profile.email || 'admin@example.com';
  app.querySelectorAll('[data-user-avatar]').forEach(function (el) {
    el.innerHTML = avatarHtml;
  });
  app.querySelectorAll('[data-user-name]').forEach(function (el) {
    el.textContent = name;
  });
  app.querySelectorAll('[data-user-email]').forEach(function (el) {
    el.textContent = email;
  });
}
