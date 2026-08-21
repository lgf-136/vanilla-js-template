/* ============================================================
 * model.js — 标签数据模型与纯逻辑（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责（拆分设计总览见 index.js 头注）：
 *   - 纯逻辑：fuzzyMatch 模糊匹配 / highlight 命中高亮 /
 *     nextColor 默认颜色轮换 / validateName 名称校验(空/超长/重名)
 *   - 节点查找：nodeOf 按 id 查标签节点、instOf 由 DOM 元素反查实例
 *   - 单例注册表：INSTANCES 实例表（全组件唯一一份；index.js 装配
 *     create() 时写入，events.js 的 document 委托读取）
 *   - 共享安全访问器：esc/escAttr(shared/escape.js 别名,红线 13)、
 *     ic 图标、resolveColor/parseColorSafe 取色（异常静默回退）
 * 本文件是本目录依赖图最底层：无渲染、无监听器、不 import 兄弟文件，
 * 被 render/menu/dialog/popover/events 共同消费。
 * ============================================================ */
'use strict';

  var INSTANCES = {};

  /* ---------- 纯工具(可测试,无 DOM 依赖) ---------- */
  /** 模糊匹配:query 各字符需按序出现(不要求连续),忽略大小写 */
  function fuzzyMatch(text, query) {
    text = String(text || '');
    query = String(query || '').trim();
    if (!query) return true;
    var tl = text.toLowerCase();
    var ql = query.toLowerCase();
    var qi = 0;
    for (var i = 0; i < tl.length && qi < ql.length; i++) {
      if (tl.charAt(i) === ql.charAt(qi)) qi++;
    }
    return qi === ql.length;
  }

  /** 高亮命中片段(仅按 query 顺序命中的字符加 <mark>),返回 HTML */
  function highlight(text, query, esc) {
    text = String(text || '');
    query = String(query || '').trim();
    var e = esc || escapeHtml;
    if (!query) return e(text);
    var tl = text.toLowerCase();
    var ql = query.toLowerCase();
    var hits = {};
    var qi = 0;
    for (var i = 0; i < tl.length && qi < ql.length; i++) {
      if (tl.charAt(i) === ql.charAt(qi)) {
        hits[i] = true;
        qi++;
      }
    }
    var out = '';
    for (var j = 0; j < text.length; j++) {
      out += hits[j] ? '<mark>' + e(text.charAt(j)) + '</mark>' : e(text.charAt(j));
    }
    return out;
  }

  /** 默认标签颜色轮换:每次新建从 19 色循环(含 accent) */
  var colorCursor = 0;
  function nextColor() {
    var c = PALETTE[colorCursor % PALETTE.length];
    colorCursor++;
    return c;
  }

  /** 统一转义（shared/escape.js，红线 13）：保留局部别名以兼容既有调用点 */
  var escapeHtml = App.escape.escHtml;
  var esc = escapeHtml;
  var escAttr = App.escape.escAttr;
  function ic(name) {
    try {
      return App.icon.iconSvg(name, { class: 'size-3.5' });
    } catch (e) {
      return '';
    }
  }
  function resolveColor(name) {
    try {
      return App.ui.color.resolveColor(name);
    } catch (e) {
      return '';
    }
  }

  /** 19 色调色板:强调色(accent,跟随主题 --primary)+ 18 常用色 */
  var PALETTE = [
    'accent',
    'zinc',
    'amber',
    'blue',
    'cyan',
    'emerald',
    'fuchsia',
    'green',
    'indigo',
    'lime',
    'orange',
    'pink',
    'purple',
    'red',
    'rose',
    'sky',
    'teal',
    'violet',
    'yellow',
  ];

  /* ---------- 实例解析与节点查找 ---------- */
  function instOf(el) {
    var root = el && el.closest ? el.closest('[data-tp]') : null;
    if (root) return INSTANCES[root.getAttribute('data-tp')] || null;
    // 多选下拉 Popover 可能挂在 body 下(无 [data-tp] 祖先),从 data-tp-picker 回退解析
    var picker = el && el.closest ? el.closest('[data-tp-picker]') : null;
    if (picker) return INSTANCES[picker.getAttribute('data-tp-picker')] || null;
    return null;
  }
  function nodeOf(inst, id) {
    var list = inst.nodes();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- 校验 ---------- */
  /** 标签名合法性:非空、长度、重名(忽略大小写) */
  function validateName(inst, name, selfId, requiredLabel) {
    var L = inst.labels();
    if (!name) return L.nameRequired || '';
    if (name.length > 40) return (L.nameTooLong || '') + ' (40)';
    var dup = inst.nodes().some(function (t) {
      return t.id !== selfId && t.name.toLowerCase() === name.toLowerCase();
    });
    if (dup) return L.nameExists || '';
    return '';
  }

  function parseColorSafe(v) {
    try {
      return App.ui.color.parseColor(v);
    } catch (e) {
      return null;
    }
  }

export {
  INSTANCES,
  PALETTE,
  esc,
  escAttr,
  escapeHtml,
  fuzzyMatch,
  highlight,
  ic,
  instOf,
  nextColor,
  nodeOf,
  parseColorSafe,
  resolveColor,
  validateName,
};
