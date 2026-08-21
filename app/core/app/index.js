/* ============================================================
 * app/core/app/index.js — 应用内核(零依赖)入口装配（C5 拆分）
 * ------------------------------------------------------------
 * 原 app.js(≈1300 行)按业务域切片为目录模块;模块作用域即隔离,
 * 去掉 IIFE 壳改 ESM。对外 App.* 挂载面逐字保留(成员一个不少/不多/
 * 不改名),消费方零改动。
 *
 * 拆分设计（一域一文件）：
 *   state.js           内核运行时单例状态(#app/settings/sheetOpen/
 *                      openSubmenus)+ tFor/currentPath。最底层、无依赖,
 *                      全目录防循环的锚点;settings 为 ESM live binding,
 *                      整体重赋值必须走 setSettings()。
 *   registry.js        模块注册表:modules/impls/subImpls/pending、
 *                      registerModule/defineModule/waitFor/moduleDir/findRoute
 *                      (manifest 声明元信息,实现懒加载,首次访问才下载)。
 *   loaders.js         资源加载器:loadScript/loadCss(去重注入)。
 *   nav.js             导航清单推导:buildAllNavItems/buildNavItems(hiddenNav 过滤)。
 *   shell-ui.js        壳层 UI 原位操作:侧边栏状态/刷新、下拉、设置面板
 *                      (Sheet)、顶栏主题按钮与用户菜单同步。
 *   render.js          渲染域:ensureModuleLoaded 懒加载编排、resolveRoute、
 *                      navigate/hashchange、renderRoute(navToken 丢弃过期)、
 *                      renderApp/rerenderContent(.sp-content 滚动保持)、
 *                      openSubmenus 启动初始化。
 *   server-sync.js     数据库 app_settings 双向同步:载荷组装、防抖推送、
 *                      服务端合并、visibilitychange 核对、工作空间全局键。
 *   workspaces.js      工作空间域:切换/新增/编辑/删除(落库→重置→指针→加载)。
 *   profiles.js        配置文件域(VSCode 风格):切换/新建/重命名/删除。
 *   settings-bridge.js 设置桥接:updateSettings 统一入口(持久化+精准局部刷新)、
 *                      applySettingValue 与 data-setting 的 change/input 委托。
 *   actions.js         设置动作:setTheme/setLocale/setAppearance/侧边栏形态/
 *                      setLayout/reset* 等薄封装。
 *   events.js          全局点击事件委托(副作用文件,必须被本入口显式导入)。
 *
 * 依赖方向（严格单向，无循环；↓ 指向被依赖方）：
 *   events → actions → bridge → server-sync → render → shell-ui → nav
 *      └────────────────────────────────────────┴→ registry/loaders → state
 *   workspaces/profiles 与 bridge 同层(只依赖 state/server-sync/render/
 *   shell-ui);index 只做装配与挂载。跨域复用经 import 显式声明,无反向边。
 *
 * 副作用求值点（均被本入口静态导入链保证求值）：
 *   state(applySettings) → render(hashchange + openSubmenus 初始化) →
 *   settings-bridge(change/input 委托) → server-sync(visibilitychange) →
 *   events(click 委托),相对顺序不影响行为(各监听不同事件类型)。
 * ============================================================ */
'use strict';

import { settings, openSubmenus, currentPath } from './state.js';
import { registerModule, defineModule } from './registry.js';
import { resolveRoute, renderApp } from './render.js';
import { buildNavItems, buildAllNavItems } from './nav.js';
import { updateSettings, applySettingValue } from './settings-bridge.js';
import { setSidebarWidth } from './actions.js';
import { syncSettingsFromServer } from './server-sync.js';
import { switchWorkspace, saveWorkspace, deleteWorkspace } from './workspaces.js';
import { switchProfile, saveProfile, deleteProfile } from './profiles.js';
import './events.js'; // 副作用:全局点击委托(不被导入则不求值、监听器静默失效)

// ---------- 启动 ----------
/** 鉴权门禁:未登录渲染登录页,登录成功后由 auth.js 再次调用 start() */
function start() {
  if (App.auth && !App.auth.isAuthed()) {
    App.auth.renderLogin();
    return;
  }
  document.documentElement.lang = settings.locale;
  renderApp();
  syncSettingsFromServer();
}

window.App = window.App || {};
App.registerModule = registerModule;
App.defineModule = defineModule;
App.resolveRoute = resolveRoute;
App.buildNavItems = buildNavItems;
App.buildAllNavItems = buildAllNavItems;
App.currentPath = currentPath;
App.updateSettings = updateSettings; // 设置表单字段/模块改动统一入口(自动持久化 + 同步数据库)
App.applySettingValue = applySettingValue; // 自定义控件(下拉/日历等)写设置字段统一入口
App.setSidebarWidth = setSidebarWidth; // 拖拽调宽收尾持久化(interactions.js 使用)
App.getShellContext = function () {
  // 移动端抽屉构建侧边栏所需上下文(interactions.js 使用)
  return {
    settings: settings,
    navItems: buildNavItems(settings.locale),
    pathname: currentPath(),
    openSubmenus: openSubmenus,
  };
};
App.start = start;
App.switchWorkspace = switchWorkspace;
App.saveWorkspace = saveWorkspace;
App.deleteWorkspace = deleteWorkspace;
App.switchProfile = switchProfile;
App.saveProfile = saveProfile;
App.deleteProfile = deleteProfile;
