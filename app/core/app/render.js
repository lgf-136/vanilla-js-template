/* ============================================================
 * app/core/app/render.js — 渲染域（懒加载编排 + 路由渲染）
 * ------------------------------------------------------------
 * - ensureModuleLoaded:模块 css/deps/i18n 词典与实现文件的懒加载编排
 *   (实现经原生动态 import(),ADR-002;清单未提供 loadRoot 时按 load 路径兜底)
 * - resolveRoute:路由 → { html, status }(ctx.t 在词典懒加载完成后构建)
 * - navigate / hashchange 监听:hash 路由驱动(支持 file:// 直开)
 * - renderRoute:内容区渲染(navToken 丢弃过期导航结果),进入父模块时
 *   自动展开其子菜单
 * - renderApp / rerenderContent:整壳渲染与内容区局部重渲染
 *   (rerenderContent 保留视口与 .sp-content 滚动位置,供设置页双向同步)
 * - 求值期副作用:hashchange 监听注册 + openSubmenus 启动初始化
 *   (当前路由命中含 children 的父模块时默认展开,原 app.js IIFE 语义)
 * 依赖方向：state ← registry ← loaders ← nav ← shell-ui ← 本文件。
 * ============================================================ */
'use strict';

import { app, settings, openSubmenus, currentPath, tFor } from './state.js';
import { impls, subImpls, findRoute, moduleDir, waitFor } from './registry.js';
import { loadCss, loadScript } from './loaders.js';
import { buildNavItems } from './nav.js';
import { refreshSidebar, syncSidebarState, closeDropdowns } from './shell-ui.js';

/** 加载模块实现(懒加载:首次访问才下载脚本与样式) */
function ensureModuleLoaded(m, child) {
  var meta = m.meta;
  var tasks = [];
  // meta.css 支持字符串或数组(按序加载,数组顺序即 <link> 插入顺序,保证层叠优先级)
  var cssFiles = Array.isArray(meta.css) ? meta.css : meta.css ? [meta.css] : [];
  cssFiles.forEach(function (f) {
    tasks.push(loadCss(moduleDir(meta.id) + f));
  });
  (meta.deps || []).forEach(function (src) {
    tasks.push(loadScript(src));
  });
  if (child && child.css) tasks.push(loadCss(moduleDir(meta.id) + child.css));
  // 模块词典懒加载(manifest 仅声明 i18nFile,不内联文案)
  if (meta.i18nFile && !meta.i18n) {
    tasks.push(
      loadScript(moduleDir(meta.id) + meta.i18nFile).then(function () {
        meta.i18n = window.__moduleI18n[meta.id] || null;
      })
    );
  }

  if (child) {
    var ckey = meta.id + ':' + child.id;
    // 子模块实现未定义时才加载子模块文件(父模块可能已统一实现)
    if (!subImpls[ckey] && !impls[meta.id]) {
      tasks.push(
        import(moduleDir(meta.id) + child.load).then(function () {
          if (!subImpls[ckey] && !impls[meta.id]) {
            return waitFor(ckey).then(function () {
              return undefined;
            });
          }
        })
      );
    }
  } else if (!impls[meta.id]) {
    // 模块实现经原生动态 import() 懒加载(ADR-002):支持 ESM 组织的模块内部拆分
    // (如 apihub 的 hub-*.js);清单未提供 loadRoot 时按 load 路径兜底。
    tasks.push(
      (meta.loadRoot ? meta.loadRoot() : import(moduleDir(meta.id) + meta.load)).then(
        function () {
          m.loaded = true;
          if (!impls[meta.id]) {
            return waitFor(meta.id).then(function () {
              return undefined;
            });
          }
        }
      )
    );
  } else {
    m.loaded = true;
  }
  return Promise.all(tasks);
}

/** 渲染路由:返回 { html, status };ctx.t 在词典懒加载完成后构建 */
export function resolveRoute(path, settings) {
  var hit = findRoute(path);
  if (!hit) {
    return Promise.resolve({
      html: App.ui.notFound(App.i18n.makeT(settings.locale)),
      status: 404,
    });
  }
  var m = hit.module;
  var meta = m.meta;
  return ensureModuleLoaded(m, hit.child).then(function () {
    // 子路由优先用子模块实现,未定义时回退到父模块实现(按路由分发)
    var def = null;
    if (hit.child) {
      def = subImpls[meta.id + ':' + hit.child.id] || impls[meta.id] || null;
    } else {
      def = impls[meta.id] || null;
    }
    if (!def || typeof def.render !== 'function') {
      throw new Error(
        '模块 ' + meta.id + (hit.child ? '/' + hit.child.id : '') + ' 未定义 render'
      );
    }
    var ctx = {
      path: path,
      settings: settings,
      t: App.i18n.makeT(settings.locale, meta.i18n),
      App: App,
    };
    return { html: def.render(path, ctx), status: 200 };
  });
}

// ---------- 路由 ----------
export function navigate(path) {
  if (currentPath() === path) {
    renderRoute();
    return;
  }
  window.location.hash = '#' + path;
}

window.addEventListener('hashchange', function () {
  renderRoute();
});

var navToken = 0;

export function renderRoute() {
  var path = currentPath();
  var token = ++navToken;
  var contentArea = app.querySelector('[data-content-area]');
  var viewport = app.querySelector('[data-slot="scroll-area-viewport"]');
  resolveRoute(path, settings)
    .then(function (result) {
      if (token !== navToken) return; // 已有更新的导航,丢弃过期结果
      if (contentArea) contentArea.innerHTML = result.html;
      // 内容挂载完成通知:模块(如 dashboard 图表)据此初始化 DOM 后逻辑
      document.dispatchEvent(new CustomEvent('app:afterRender', { detail: { path: path } }));
      if (viewport) viewport.scrollTop = 0;
      var hit = findRoute(path);
      var opened = false;
      if (
        hit &&
        hit.module.meta.children &&
        hit.module.meta.children.length &&
        !openSubmenus[hit.module.meta.id]
      ) {
        openSubmenus[hit.module.meta.id] = true; // 导航进入父模块时自动展开其子菜单
        opened = true;
      }
      if (opened) refreshSidebar();
      else updateNavActive(path);
      App.interactions.closeMobileSidebar();
      closeDropdowns();
    })
    .catch(function (e) {
      App.logger.error('core', '路由渲染失败: ' + path, e);
      if (token !== navToken) return;
      if (contentArea) contentArea.innerHTML = App.ui.notFound(tFor(settings.locale));
      updateNavActive(path);
    });
}

function updateNavActive(path) {
  app.querySelectorAll('[data-slot="sidebar-menu-button"]').forEach(function (el) {
    var href = el.getAttribute('data-link');
    if (href == null) return;
    var active = href === path;
    el.classList.toggle('data-active', active);
    el.classList.toggle('bg-sidebar-accent', active);
    el.classList.toggle('font-medium', active);
    if (el.getAttribute('aria-current')) el.setAttribute('aria-current', active ? 'page' : '');
  });
}

export function renderApp() {
  var pathname = currentPath();
  var viewport = app.querySelector('[data-slot="scroll-area-viewport"]');
  var scrollTop = viewport ? viewport.scrollTop : 0;
  var navItems = buildNavItems(settings.locale);
  var html = App.shell.renderShell(settings, tFor(settings.locale), pathname, navItems, openSubmenus);
  app.innerHTML = html;
  var newViewport = app.querySelector('[data-slot="scroll-area-viewport"]');
  if (newViewport) newViewport.scrollTop = scrollTop;
  syncSidebarState();
  renderRoute();
}

/** 仅重渲染当前内容区(保留滚动位置),供设置页与面板双向同步 */
export function rerenderContent() {
  var contentArea = app.querySelector('[data-content-area]');
  var viewport = app.querySelector('[data-slot="scroll-area-viewport"]');
  var scrollTop = viewport ? viewport.scrollTop : 0;
  // 设置页左右两栏各自独立滚动:重渲染后同样保留右侧内容栏的滚动位置
  var spContent = contentArea ? contentArea.querySelector('.sp-content') : null;
  var spScrollTop = spContent ? spContent.scrollTop : 0;
  resolveRoute(currentPath(), settings)
    .then(function (result) {
      if (contentArea) contentArea.innerHTML = result.html;
      if (viewport) viewport.scrollTop = scrollTop;
      var next = contentArea ? contentArea.querySelector('.sp-content') : null;
      if (next) next.scrollTop = spScrollTop;
      updateNavActive(currentPath());
    })
    .catch(function (e) {
      App.logger.error('core', '设置同步重渲染失败', e);
    });
}

// 各可折叠父菜单的展开状态启动初始化(原 app.js 求值期 IIFE 语义:
// 当前路由命中含 children 的父模块时默认展开;清单此时尚未注册,
// 行为与拆分前一致——modules 为空,openSubmenus 保持空对象)
(function () {
  var hit = findRoute(currentPath());
  if (hit && hit.module.meta.children && hit.module.meta.children.length) {
    openSubmenus[hit.module.meta.id] = true;
  }
})();
