/* ============================================================
 * json-tree.js — 响应 JSON 树查看器(公共组件)
 * ------------------------------------------------------------
 * 将任意 JSON 值渲染为可逐节点展开/折叠的树:
 *   - 每个节点一行,容器节点带展开/折叠箭头(chevron)
 *   - 悬停任意节点出现「复制节点」按钮(复制该节点 JSON)
 *   - 支持全部展开 / 全部折叠
 *   - 默认展开根 + 第一层,更深默认折叠
 * 事件:document 级委托,作用域限定 [data-jtree],多实例共存。
 * 依赖:App.icon.iconSvg / App.ui.toast。
 * 用法:
 *   var tree = App.ui.jsonTree.create({
 *     labels: { copyNode, items, keys },
 *     onCopy: function (text) { ... },   // 复制节点文本回调
 *     onRender: function () { ... },     // 需要重绘时回调
 *   });
 *   tree.setValue(value);
 *   el.innerHTML = tree.render();
 * ============================================================ */
(function () {
  'use strict';

  var SEQ = 0;
  var INSTANCES = {};

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;
  var escAttr = App.escape.escAttr;
  function ic(name, cls) {
    return App.icon.iconSvg(name, { class: cls || '' });
  }

  /** 节点路径(带 JSON.stringify 键段,规避键名含 . 的碰撞) */
  function jsonPath(parent, key) {
    return parent + '[' + JSON.stringify(String(key)) + ']';
  }

  /** 标量值着色渲染 */
  function scalarHtml(v) {
    if (v === null) return '<span class="jt-null">null</span>';
    var t = typeof v;
    if (t === 'string') return '<span class="jt-str">' + esc(JSON.stringify(v)) + '</span>';
    if (t === 'number') return '<span class="jt-num">' + esc(String(v)) + '</span>';
    if (t === 'boolean') return '<span class="jt-bool">' + v + '</span>';
    return esc(String(v));
  }

  /** 递归渲染 JSON 节点(展开状态存于实例) */
  function nodeHtml(inst, path, key, value, depth) {
    var pad = '';
    for (var i = 0; i < depth; i++) pad += '<span class="jt-indent"></span>';
    var keyHtml =
      key === null ? '' : '<span class="jt-key">' + esc(String(key)) + '</span><span class="jt-colon">: </span>';
    var isObj = value !== null && typeof value === 'object' && !Array.isArray(value);
    var isArr = Array.isArray(value);
    // 复制节点 tooltip/aria-label 兜底走核心词典(红线 17,不硬编码英文)
    var copyLabel = inst.labels.copyNode
      ? inst.labels.copyNode
      : App.i18n.makeT(document.documentElement.lang || App.i18n.DEFAULT_LOCALE)('jsonTree.copyNode');
    var copyBtn =
      '<button type="button" class="jt-copy" data-jt-copy="' +
      escAttr(path) +
      '" data-tip="' +
      escAttr(copyLabel) +
      '" aria-label="' +
      escAttr(copyLabel) +
      '">' +
      ic('copy') +
      '</button>';
    if (!isObj && !isArr) {
      inst.nodeMap[path] = value;
      return '<div class="jt-line" data-jt-path="' + escAttr(path) + '">' + pad + keyHtml + scalarHtml(value) + copyBtn + '</div>';
    }
    inst.nodeMap[path] = value;
    inst.allPaths.push(path);
    var kids = isArr
      ? value.map(function (v, i) {
          return { k: i, v: v };
        })
      : Object.keys(value).map(function (k) {
          return { k: k, v: value[k] };
        });
    var open = inst.expanded.hasOwnProperty(path) ? inst.expanded[path] : depth <= 1;
    var head = isObj ? '{' : '[';
    var tail = isObj ? '}' : ']';
    var summary =
      '<span class="jt-count">' +
      (isArr
        ? kids.length + ' ' + (inst.labels.items || 'items')
        : kids.length + ' ' + (inst.labels.keys || 'keys')) +
      '</span>';
    var html =
      '<div class="jt-line jt-node' +
      (open ? ' is-open' : '') +
      '" data-jt-path="' +
      escAttr(path) +
      '">' +
      pad +
      (kids.length
        ? '<button type="button" class="jt-caret" data-jt-toggle="' + escAttr(path) + '" aria-label="">' + ic('chevron-right') + '</button>'
        : '<span class="jt-caret is-leaf"></span>') +
      keyHtml +
      '<span class="jt-punc">' +
      head +
      '</span>' +
      (open ? '' : ' ' + summary + ' <span class="jt-punc">' + tail + '</span>') +
      copyBtn +
      '</div>';
    if (open) {
      html += '<div class="jt-children">';
      kids.forEach(function (k) {
        html += nodeHtml(inst, jsonPath(path, k.k), k.k, k.v, depth + 1);
      });
      html +=
        '<div class="jt-line jt-close" data-jt-path="' +
        escAttr(path) +
        '">' +
        pad +
        '<span class="jt-punc">' +
        tail +
        '</span></div>';
    }
    return html;
  }

  function create(opts) {
    opts = opts || {};
    var inst = {
      uid: 'jt-' + ++SEQ,
      opts: opts,
      labels: opts.labels || {},
      value: null,
      expanded: {},
      nodeMap: {},
      allPaths: [],
      setValue: function (v) {
        inst.value = v;
        inst.expanded = {};
        inst.nodeMap = {};
        inst.allPaths = [];
        return inst;
      },
      render: function () {
        inst.nodeMap = {};
        inst.allPaths = [];
        if (inst.value === null || inst.value === undefined) return '';
        return '<div class="jt" data-jtree="' + inst.uid + '">' + nodeHtml(inst, 'root', null, inst.value, 0) + '</div>';
      },
      refresh: function () {
        if (typeof inst.opts.onRender === 'function') inst.opts.onRender();
      },
      toggle: function (path) {
        inst.expanded[path] = !(inst.expanded[path] !== false);
        inst.refresh();
      },
      expandAll: function () {
        inst.allPaths.forEach(function (p) {
          inst.expanded[p] = true;
        });
        inst.refresh();
      },
      collapseAll: function () {
        inst.allPaths.forEach(function (p) {
          inst.expanded[p] = false;
        });
        inst.refresh();
      },
      copy: function (path) {
        var val = inst.nodeMap[path];
        if (val === undefined) return;
        var text = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
        if (typeof inst.opts.onCopy === 'function') inst.opts.onCopy(text);
      },
    };
    INSTANCES[inst.uid] = inst;
    return inst;
  }

  /* ---------- 事件委托 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // 复制节点(可能点在按钮图标上)
    var cpy = t.closest('[data-jt-copy]');
    if (cpy) {
      var root = cpy.closest('[data-jtree]');
      var inst = root && INSTANCES[root.getAttribute('data-jtree')];
      if (inst) inst.copy(cpy.getAttribute('data-jt-copy'));
      return;
    }
    // 展开/折叠
    var tog = t.closest('[data-jt-toggle]');
    if (tog) {
      var root2 = tog.closest('[data-jtree]');
      var inst2 = root2 && INSTANCES[root2.getAttribute('data-jtree')];
      if (inst2) inst2.toggle(tog.getAttribute('data-jt-toggle'));
      return;
    }
  });

  /* ---------- 样式注入 ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.querySelector('[data-json-tree-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-json-tree-style', '');
    style.textContent =
      '.jt{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;line-height:1.6;padding:.125rem 0}' +
      '.jt-line{display:flex;align-items:center;gap:.25rem;min-height:1.375rem;padding:.0625rem .25rem;border-radius:.25rem;white-space:pre-wrap;word-break:break-word}' +
      '.jt-line:hover{background:var(--accent)}' +
      '.jt-indent{display:inline-block;width:1rem;flex:none}' +
      '.jt-caret{display:inline-flex;align-items:center;justify-content:center;width:.875rem;height:.875rem;flex:none;border:0;background:transparent;color:var(--muted-foreground);cursor:pointer;padding:0;border-radius:.25rem;transition:transform .12s ease}' +
      '.jt-caret svg{width:.75rem;height:.75rem}' +
      '.jt-caret.is-leaf{visibility:hidden}' +
      '.jt-node.is-open>.jt-caret{transform:rotate(90deg)}' +
      '.jt-key{color:var(--nova-primary-blue)}' +
      '.jt-colon,.jt-punc{color:var(--muted-foreground)}' +
      '.jt-count{color:var(--muted-foreground);opacity:.85}' +
      '.jt-str{color:var(--nova-success)}' +
      '.jt-num{color:var(--nova-warning)}' +
      '.jt-bool{color:var(--nova-purple)}' +
      '.jt-null{color:var(--muted-foreground)}' +
      '.jt-copy{display:inline-flex;align-items:center;justify-content:center;width:1.25rem;height:1.25rem;flex:none;margin-left:auto;border:0;background:transparent;color:var(--muted-foreground);cursor:pointer;border-radius:.25rem;opacity:0}' +
      '.jt-line:hover .jt-copy{opacity:1}' +
      '.jt-copy:hover{background:var(--background);color:var(--foreground)}' +
      '.jt-copy svg{width:.75rem;height:.75rem}';
    document.head.appendChild(style);
  }
  injectStyles();

  window.App = window.App || {};
  App.ui = App.ui || {};
  App.ui.jsonTree = { create: create };
})();
