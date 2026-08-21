/* ============================================================
 * index.js — 核心国际化运行时（零依赖；自 app/core/i18n.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 拆分设计：核心词典数据在同目录 dicts.js（纯数据）；本文件只保留
 * makeT/locale 处理与 App.i18n 挂载，逻辑逐字未变，对外成员不变。
 * - 核心词典只包含 App Shell / 设置面板 / 公共 UI 文案；
 *   各模块自有文案放在各自懒加载的 i18n.js(manifest 声明 i18nFile,模块内聚)
 * - t(key, arg) 支持 {n} 插值;查找顺序:模块词典 → 核心词典 → key
 * ============================================================ */
import { dict } from './dicts.js';

(function () {
  'use strict';

  var LOCALES = ['zh-CN', 'zh-TW', 'en'];
  var DEFAULT_LOCALE = 'zh-CN';
  var LOCALE_KEY = 'html-template-locale';

  /** 翻译:t(key, arg) 支持 {n} 插值;extra 为模块词典(按语言分组的扁平键值) */
  function translate(locale, key, arg, extra) {
    var d = dict[locale] || dict[DEFAULT_LOCALE];
    var de = dict[DEFAULT_LOCALE];
    var text = null;
    if (extra) {
      text =
        (extra[locale] && extra[locale][key]) ||
        (extra[DEFAULT_LOCALE] && extra[DEFAULT_LOCALE][key]) ||
        null;
    }
    if (text == null) text = d[key] || de[key] || key;
    return arg !== undefined ? String(text).replace('{n}', String(arg)) : text;
  }

  /** 从 locale 映射(如 manifest.title)中取值,带默认语言兜底 */
  function pick(map, locale) {
    if (!map) return '';
    return map[locale] || map[DEFAULT_LOCALE] || map.en || '';
  }

  /** 生成翻译函数;moduleDict 为可选模块词典(按语言分组) */
  function makeT(locale, moduleDict) {
    return function (key, arg) {
      return translate(locale, key, arg, moduleDict);
    };
  }

  window.App = window.App || {};
  App.i18n = {
    LOCALES: LOCALES,
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    LOCALE_KEY: LOCALE_KEY,
    translate: translate,
    pick: pick,
    makeT: makeT,
  };
})();
