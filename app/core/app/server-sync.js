/* ============================================================
 * app/core/app/server-sync.js — 数据库 app_settings 双向同步
 * ------------------------------------------------------------
 * 本地设置 ↔ 服务端 app_settings KV(键遵循 README 命名规范 settings:*):
 *   - serverSettingsPayload:本地设置 → 数据库 KV 载荷
 *   - pushSettingsToServer:防抖推送(拖拽调宽等高频调用只合并一次)
 *   - mergeServerSettings:数据库值 → 本地存储键(白名单校验由
 *     readSettings 兜底),返回合并后的设置对象
 *   - serverSettingsSnapshot / syncSettingsFromServer:变化检测 +
 *     登录后拉取(服务端为准,失败静默回退本地;无变化不整页刷新)
 *   - globalSettingsPayload / pushGlobalSettingsToServer /
 *     flushSettingsSync:工作空间注册表与当前指针(唯一跨工作空间共享)
 * 求值期副作用:visibilitychange 监听(切回前台时后台核对一次最新设置)。
 * 依赖方向：state ← render ← 本文件。
 * ============================================================ */
'use strict';

import { settings, setSettings } from './state.js';
import { renderApp } from './render.js';

/* ---------- 数据库 app_settings 双向同步 ---------- */
/** 本地设置 → 数据库 KV(键遵循 README 命名规范:settings:* 全局设置) */
function serverSettingsPayload() {
  var a = settings.appearance;
  return {
    'settings:appearance': JSON.stringify({
      theme: settings.theme,
      style: a.style,
      baseColor: a.baseColor,
      chartColor: a.chartColor,
      radius: a.radius,
      bodyFont: a.bodyFont,
      headingFont: a.headingFont,
      menuColor: a.menuColor,
      menuAppearance: a.menuAppearance,
      useBase: a.useBase !== false,
      useAccent: a.useAccent !== false,
    }),
    'settings:display': JSON.stringify({
      sidebarOpen: !!settings.sidebarOpen,
      sidebarVariant: settings.sidebarVariant,
      sidebarCollapsible: settings.sidebarCollapsible,
      sidebarWidth: settings.sidebarWidth,
      hiddenNav: settings.hiddenNav || [],
    }),
    'settings:profile': JSON.stringify(settings.profile || {}),
    'settings:account': JSON.stringify(settings.account || {}),
    'settings:notifications': JSON.stringify(settings.notifications || {}),
    'settings:workspaces': JSON.stringify(settings.workspaces || []),
    'settings:activeWorkspace': String(settings.activeWorkspace || ''),
    'settings:profiles': JSON.stringify(settings.profiles || []),
    'settings:activeProfile': String(settings.activeProfile || ''),
  };
}

/** 写入数据库(防抖:拖拽调宽等高频调用只合并一次) */
var serverSyncTimer = null;
export function pushSettingsToServer() {
  if (!App.auth || !App.auth.token()) return; // 未登录(如 file:// 直开)仅本地
  if (serverSyncTimer) clearTimeout(serverSyncTimer);
  serverSyncTimer = setTimeout(function () {
    serverSyncTimer = null;
    App.api.put('/api/settings', { settings: serverSettingsPayload() }).catch(function (e) {
      if (e && e.status !== 401) App.logger.warn('core', '设置同步到数据库失败', e);
    });
  }, 400);
}

/** 数据库值 → 本地存储键(白名单校验由 readSettings 兜底),返回合并后的设置对象 */
export function mergeServerSettings(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var appearance = null;
  var display = null;
  try {
    appearance = JSON.parse(raw['settings:appearance'] || 'null');
  } catch (e) {
    appearance = null;
  }
  try {
    display = JSON.parse(raw['settings:display'] || 'null');
  } catch (e) {
    display = null;
  }
  var K = App.settings.K;
  var set = App.settings.writeStorage;
  if (appearance && typeof appearance === 'object') {
    if (appearance.theme) set(K('theme'), String(appearance.theme));
    if (appearance.style) set(K('style'), String(appearance.style));
    if (appearance.baseColor) set(K('base'), String(appearance.baseColor));
    if (appearance.chartColor) set(K('chart'), String(appearance.chartColor));
    if (appearance.radius) {
      var r = App.settings.RADII.find(function (x) {
        return x.value === appearance.radius;
      });
      if (r) set(K('radius'), r.px);
    }
    if (appearance.bodyFont) {
      var bf = App.settings.FONTS.find(function (x) {
        return x.value === appearance.bodyFont;
      });
      if (bf) set(K('font'), bf.stack);
    }
    if (appearance.headingFont) {
      var hf = App.settings.FONTS.find(function (x) {
        return x.value === appearance.headingFont;
      });
      if (hf) set(K('heading-font'), hf.stack);
    }
    if (appearance.menuColor) set(K('menu-color'), String(appearance.menuColor));
    if (appearance.menuAppearance) set(K('menu-appearance'), String(appearance.menuAppearance));
    if (typeof appearance.useBase === 'boolean') set(K('use-base'), appearance.useBase ? '1' : '0');
    if (typeof appearance.useAccent === 'boolean') set(K('use-accent'), appearance.useAccent ? '1' : '0');
  }
  if (display && typeof display === 'object') {
    if (display.sidebarOpen != null) set(K('sidebar-open'), String(!!display.sidebarOpen));
    if (display.sidebarVariant) set(K('sidebar-variant'), String(display.sidebarVariant));
    if (display.sidebarCollapsible)
      set(K('sidebar-collapsible'), String(display.sidebarCollapsible));
    if (display.sidebarWidth != null) set(K('sidebar-width'), String(display.sidebarWidth));
    if (Array.isArray(display.hiddenNav)) set(K('hidden-nav'), JSON.stringify(display.hiddenNav));
  }
  // 设置子页数据(profile/account/notifications):合法 JSON 直接写存储键,readSettings 会做形状校验
  ['profile', 'account', 'notifications'].forEach(function (domain) {
    var rawKey = 'settings:' + domain;
    if (typeof raw[rawKey] !== 'string' || !raw[rawKey]) return;
    try {
      JSON.parse(raw[rawKey]);
      set(K(domain), raw[rawKey]);
    } catch (e) {
      /* 脏数据忽略,保持本地值 */
    }
  });
  if (typeof raw['settings:workspaces'] === 'string' && raw['settings:workspaces']) {
    try {
      var ws = JSON.parse(raw['settings:workspaces']);
      if (Array.isArray(ws) && ws.length) set(K('workspaces'), JSON.stringify(ws));
    } catch (e) {
      /* 脏数据忽略,保持本地值 */
    }
  }
  if (typeof raw['settings:activeWorkspace'] === 'string' && raw['settings:activeWorkspace']) {
    set(K('active-workspace'), raw['settings:activeWorkspace']);
  }
  if (typeof raw['settings:profiles'] === 'string' && raw['settings:profiles']) {
    try {
      var ps = JSON.parse(raw['settings:profiles']);
      if (Array.isArray(ps) && ps.length) set(K('profiles'), JSON.stringify(ps));
    } catch (e) {
      /* 脏数据忽略,保持本地值 */
    }
  }
  if (typeof raw['settings:activeProfile'] === 'string' && raw['settings:activeProfile']) {
    set(K('active-profile'), raw['settings:activeProfile']);
  }
  return App.settings.readSettings();
}

/** 服务端可覆盖的设置子集(排除 locale 等仅本地字段),用于变化检测 */
function serverSettingsSnapshot(s) {
  return JSON.stringify({
    theme: s.theme,
    appearance: s.appearance,
    sidebarOpen: s.sidebarOpen,
    sidebarVariant: s.sidebarVariant,
    sidebarCollapsible: s.sidebarCollapsible,
    sidebarWidth: s.sidebarWidth,
    hiddenNav: s.hiddenNav,
    profile: s.profile,
    account: s.account,
    notifications: s.notifications,
    workspaces: s.workspaces,
    activeWorkspace: s.activeWorkspace,
    profiles: s.profiles,
    activeProfile: s.activeProfile,
  });
}

/** 登录后从数据库拉取设置并应用(服务端为准;失败时静默回退本地)。
 *  优先使用本地缓存:启动时已从 localStorage 渲染;仅当服务端数据
 *  与当前值不同才整页刷新,避免无变化时的重复渲染。 */
export function syncSettingsFromServer() {
  if (!App.auth || !App.auth.token()) return;
  App.api
    .get('/api/settings')
    .then(function (raw) {
      var merged = mergeServerSettings(raw);
      if (!merged) return;
      if (serverSettingsSnapshot(settings) === serverSettingsSnapshot(merged)) return;
      setSettings(merged);
      App.settings.applySettings(settings);
      document.documentElement.lang = settings.locale;
      renderApp();
    })
    .catch(function (e) {
      if (e && e.status !== 401) App.logger.warn('core', '从数据库同步设置失败', e);
    });
}

/* ---------- 工作空间切换(缓存优先 + 后台加载目标工作空间) ---------- */
/** 全局键:工作空间注册表 + 当前指针(唯一跨工作空间共享的服务端设置) */
function globalSettingsPayload() {
  return {
    'settings:workspaces': JSON.stringify(settings.workspaces || []),
    'settings:activeWorkspace': String(settings.activeWorkspace || ''),
  };
}

/** 只写全局注册表,不携带任何工作空间数据,避免切换时污染新工作空间 */
export function pushGlobalSettingsToServer() {
  if (!App.auth || !App.auth.token()) return;
  App.api.put('/api/settings', { settings: globalSettingsPayload() }).catch(function (e) {
    if (e && e.status !== 401) App.logger.warn('core', '全局工作空间设置同步失败', e);
  });
}

/** 立即把当前(旧)工作空间数据落库(跳过防抖),确保切换前不丢改动、不串库 */
export function flushSettingsSync() {
  if (serverSyncTimer) {
    clearTimeout(serverSyncTimer);
    serverSyncTimer = null;
  }
  if (!App.auth || !App.auth.token()) return;
  App.api.put('/api/settings', { settings: serverSettingsPayload() }).catch(function (e) {
    if (e && e.status !== 401) App.logger.warn('core', '工作空间设置落库失败', e);
  });
}

// 切回前台时后台核对一次最新设置:本地缓存优先展示,服务端有变化才刷新
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') syncSettingsFromServer();
});
