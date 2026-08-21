/* ============================================================
 * app/core/app/loaders.js — 资源加载器（最底层域文件）
 * ------------------------------------------------------------
 * - loadScript:经典 <script> 注入(按 src 去重),仅用于 deps 预注入
 *   与 i18n 词典等非模块文件;模块实现走动态 import()(见 render.js
 *   的 ensureModuleLoaded,ADR-002)
 * - loadCss:<link rel=stylesheet> 注入(按 href 去重)
 * 去重表 loadedScripts/loadedCss 为模块私有状态。
 * 依赖方向：不 import 任何兄弟文件。
 * ============================================================ */
'use strict';

var loadedScripts = {};
var loadedCss = {};

/** 加载经典脚本(纯 <script> 注入):仅用于 deps 预注入与 i18n 词典等非模块文件;
 *  模块实现走动态 import()(见 ensureModuleLoaded,ADR-002)。 */
export function loadScript(src) {
  return new Promise(function (resolve, reject) {
    if (loadedScripts[src]) {
      resolve();
      return;
    }
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () {
      loadedScripts[src] = true;
      resolve();
    };
    s.onerror = function () {
      reject(new Error('模块脚本加载失败: ' + src));
    };
    document.head.appendChild(s);
  });
}

/** 加载样式(注入 <link>,按 href 去重) */
export function loadCss(href) {
  if (loadedCss[href]) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = function () {
      loadedCss[href] = true;
      resolve();
    };
    l.onerror = function () {
      reject(new Error('模块样式加载失败: ' + href));
    };
    document.head.appendChild(l);
  });
}
