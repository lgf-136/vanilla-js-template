/* ============================================================
 * app/core/app/state.js — 内核运行时单例状态（最底层，无依赖）
 * ------------------------------------------------------------
 * 持有原 app.js 的全部模块级可变状态，是全目录防循环依赖的锚点：
 *   - app           壳层根元素 #app（求值期捕获一次）
 *   - settings      当前设置对象（ESM live binding：导入方只读即可
 *                   看到最新值；整体重赋值必须走 setSettings()）
 *   - sheetOpen     设置面板(Sheet)开合状态（重赋值走 setSheetOpen()）
 *   - openSubmenus  可折叠父菜单展开状态（重赋值走 resetOpenSubmenus()）
 *   - tFor / currentPath  零依赖小工具（全局 t 函数 / hash 路由解析）
 * 求值期副作用：App.settings.applySettings(settings)——与拆分前一致，
 * 在任何渲染发生前把本地设置应用到 documentElement。
 * 依赖方向：不 import 任何兄弟文件。
 * ============================================================ */
'use strict';

/** 壳层根元素(整个内核的 DOM 操作都从这里出发) */
export var app = document.getElementById('app');

/** 当前设置(App.settings.readSettings 做形状校验兜底) */
export var settings = App.settings.readSettings();

/** 整体重赋值设置对象(各域文件的 settings = X 统一收敛到这里) */
export function setSettings(next) {
  settings = next;
}

/** 设置面板(Sheet)开合状态 */
export var sheetOpen = false;
export function setSheetOpen(open) {
  sheetOpen = open;
}

/** 各可折叠父菜单的展开状态(模块 id → true/false),如 docs / settings。
 *  初始展开逻辑在 render.js 求值期执行(需要 findRoute)。 */
export var openSubmenus = {};
export function resetOpenSubmenus() {
  openSubmenus = {};
}

function tFor(locale) {
  return App.i18n.makeT(locale);
}

function currentPath() {
  var h = window.location.hash || '';
  if (h.charAt(0) === '#') h = h.slice(1);
  if (h === '' || h === '/' || h === '#') return '/';
  // 支持查询参数深链(如 #/apihub?r=GET%20/api/settings):路由匹配仅看路径段
  var q = h.indexOf('?');
  if (q !== -1) h = h.slice(0, q);
  return h;
}

export { tFor, currentPath };

App.settings.applySettings(settings);
