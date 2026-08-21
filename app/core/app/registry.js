/* ============================================================
 * app/core/app/registry.js — 模块注册表（最底层域文件）
 * ------------------------------------------------------------
 * - modules:manifest.js 经 registerModule 声明的元信息(id → {meta,loaded}),
 *   实现文件懒加载(defineModule),首次访问路由时才下载
 * - impls / subImpls:实现文件经 defineModule 注册的 render
 *   (父模块 id → def;子模块 'id:sub' → def)
 * - pending:等待实现加载完成的回调 key → [resolve, reject](waitFor 消费)
 * - findRoute:路由路径 → {module, child} 匹配
 * 注册表只做属性级变更(对象身份不变),故以 ESM live binding 直接导出,
 * render/nav 等消费方读到的永远是同一份;pending 保持模块私有。
 * 依赖方向：不 import 任何兄弟文件。
 * ============================================================ */
'use strict';

/** @type {Object<string, {meta: object, loaded: boolean}>} */
export var modules = {};
/** @type {Object<string, object>} 父模块实现 id -> {render} */
export var impls = {};
/** @type {Object<string, object>} 子模块实现 'id:sub' -> {render} */
export var subImpls = {};
/** @type {Object<string, Array<Function>>} 等待加载完成的回调 key -> [resolve, reject] */
var pending = {};

export function moduleDir(id) {
  return 'app/modules/' + id + '/';
}

export function waitFor(key) {
  return new Promise(function (resolve, reject) {
    pending[key] = [resolve, reject];
  });
}

/** 模块清单注册:manifest.js 调用(仅元信息,体积极小) */
export function registerModule(meta) {
  if (!meta || !meta.id) {
    App.logger.error('core', 'registerModule 缺少 id', meta);
    return;
  }
  var m = {
    meta: {
      id: meta.id,
      title: meta.title || {},
      icon: meta.icon || 'circle-check',
      order: Number(meta.order) || 0,
      route: meta.route || '/' + meta.id,
      load: meta.load || 'index.js',
      loadRoot: typeof meta.loadRoot === 'function' ? meta.loadRoot : null,
      css: meta.css || null,
      deps: Array.isArray(meta.deps) ? meta.deps.slice() : [],
      i18n: meta.i18n || null,
      i18nFile: meta.i18nFile || null, // 模块词典懒加载文件(可选),加载后写入 meta.i18n
      children: (meta.children || []).map(function (c) {
        return {
          id: c.id,
          title: c.title || {},
          route: c.route || '/' + meta.id + '/' + c.id,
          order: Number(c.order) || 0,
          load: c.load || meta.load || 'index.js',
          css: c.css || null,
        };
      }),
    },
    loaded: false,
  };
  modules[meta.id] = m;
}

/** 模块实现注册:module.js / 子模块文件调用 */
export function defineModule(def) {
  if (!def || !def.id) {
    App.logger.error('core', 'defineModule 缺少 id', def);
    return;
  }
  var key = def.sub ? def.id + ':' + def.sub : def.id;
  if (def.sub) {
    subImpls[key] = def;
  } else {
    impls[def.id] = def;
  }
  if (pending[key]) {
    var cb = pending[key];
    delete pending[key];
    cb[0]();
  }
}

/** 解析路由 → 模块元信息 + 子模块(找不到返回 null) */
export function findRoute(path) {
  if (path === '' || path === '/') {
    var dash = modules['dashboard'];
    return dash ? { module: dash, child: null } : null;
  }
  var ids = Object.keys(modules);
  for (var i = 0; i < ids.length; i++) {
    var m = modules[ids[i]];
    if (m.meta.route === path) return { module: m, child: null };
    var children = m.meta.children || [];
    for (var j = 0; j < children.length; j++) {
      if (children[j].route === path) return { module: m, child: children[j] };
    }
  }
  return null;
}
