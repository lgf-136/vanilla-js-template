/* ============================================================
 * group-tree — 公共分组树组件(零依赖,多模块复用)
 * ------------------------------------------------------------
 * App.ui.groupTree
 *   - 多级分组(任意深度),创建时可选父分组(默认根)
 *   - 右键菜单 + 行尾 ⋯ 菜单:新建子分组 / 新建同级 / 重命名 /
 *     移动到… / 设置图标(图标库 + Emoji)/ 设置颜色(圆形拾色器)/ 删除
 *   - 父分组点击箭头展开/折叠;提供 expandAll / collapseAll(顶栏按钮)
 *   - 拖拽移动(插入前/后/内部,禁止移入自身或子孙)
 *   - 双击名称内联重命名;顶部搜索过滤
 *   - 节点图标:图标库 / Emoji / 自定义颜色(调色板名或 hex,accent 跟随主题)
 * ------------------------------------------------------------
 * 拆分设计（红线 12 / ARCHITECTURE 2.3.1，自 1137 行单文件 IIFE 拆出）：
 *   model.js   树数据纯逻辑（findNode/descendants/moveNode 等）+
 *              INSTANCES 单例注册表（全组件唯一一份）与 instOf/nodeOf；
 *   render.js  行渲染 treeHtml/rowHtml 与图标/Emoji 解析；
 *   dialog.js  弹窗族（新建/重命名/移动/图标/颜色/删除确认）；
 *   menu.js    右键 / 行尾 ⋯ 菜单浮层与菜单项 HTML；
 *   events.js  document 级事件委托（副作用模块，上方显式 import 激活）；
 *   index.js   本文件：装配层——create() 工厂、样式注入、
 *              App.ui.groupTree 挂载（对外面逐字不变）。
 *   依赖方向单向：model ← render ← dialog/menu ← events ← index。
 * 对外面：App.ui.groupTree = { create, descendants, isDescendant,
 *   treeChildren, resolveDrop, moveNode }；实例方法集与拆分前一致，
 *   消费方（apihub hub-groups-tags）零改动。
 * ============================================================ */
'use strict';

import {
  INSTANCES,
  descendants,
  isDescendant,
  moveNode,
  resolveDrop,
  treeChildren,
} from './model.js';
import { treeHtml } from './render.js';
import { openCreateDialog } from './dialog.js';
import { ctxItemsHtml } from './menu.js';
import './events.js';

  /* ---------- 实例 ---------- */
  var SEQ = 0;

  function create(opts) {
    opts = opts || {};
    var inst = {
      uid: 'gt-' + ++SEQ,
      opts: opts,
      expanded: {},
      filter: '',
      dragId: null,
      nodes: function () {
        var fn = opts.nodes;
        return typeof fn === 'function' ? fn() : [];
      },
      labels: function () {
        return opts.labels || {};
      },
      render: function () {
        return treeHtml(inst);
      },
      expandAll: function () {
        inst.nodes().forEach(function (n) {
          inst.expanded[n.id] = true;
        });
        return inst;
      },
      collapseAll: function () {
        inst.nodes().forEach(function (n) {
          inst.expanded[n.id] = false;
        });
        return inst;
      },
      setFilter: function (v) {
        inst.filter = String(v || '');
        return inst;
      },
      createDialog: function (parentId) {
        openCreateDialog(inst, parentId == null ? '' : parentId);
      },
      /** 菜单项 HTML(⋯ 浮层 / 右键浮层共用,body 级按需渲染) */
      menuHtml: function (id) {
        return ctxItemsHtml(inst, id);
      },
    };
    INSTANCES[inst.uid] = inst;
    return inst;
  }

  /* ---------- 样式注入 ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    var style = document.createElement('style');
    style.setAttribute('data-group-tree-style', '');
    style.textContent =
      /* 布局 */
      '.gt-tree{display:flex;flex-direction:column;min-height: 0;gap: calc(var(--spacing) * 0.5)}' +
      '.gt-filter{padding:calc(var(--spacing) * 0.5) calc(var(--spacing) * 1.5) calc(var(--spacing) * 1);flex-shrink:0}' +
      '.gt-scroll{flex:1 1 auto;min-height: 0;overflow-y:auto;display:flex;flex-direction:column;gap: 1px;padding-bottom: calc(var(--spacing) * 1.5)}' +
      /* 行 */
      '.gt-row{display:flex;align-items:center;gap: calc(var(--spacing) * 1);height: calc(var(--spacing) * 7);padding-right: calc(var(--spacing) * 1.5);border-radius:calc(var(--radius) * 0.7);cursor:pointer;user-select:none;position:relative}' +
      '.gt-row:hover{background:var(--accent)}' +
      '.gt-row.is-active{background:var(--accent);color:var(--foreground)}' +
      '.gt-row[data-gt-zone="before"]{box-shadow:0 -1px 0 0 var(--primary)}' +
      '.gt-row[data-gt-zone="after"]{box-shadow:0 1px 0 0 var(--primary)}' +
      '.gt-row[data-gt-zone="inside"]{outline:1px solid var(--primary);outline-offset:-1px}' +
      '.gt-row[data-gt-zone="no"]{opacity:.45}' +
      '.gt-row.gt-dragging{opacity:.45}' +
      '.gt-row.gt-root{color:var(--muted-foreground);font-weight:500}' +
      '.gt-caret{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 4);height: calc(var(--spacing) * 4);flex-shrink:0;color:var(--muted-foreground);transition:transform .12s}' +
      '.gt-caret svg{width: calc(var(--spacing) * 3);height: calc(var(--spacing) * 3)}' +
      '.gt-caret.is-open{transform:rotate(90deg)}' +
      '.gt-caret.is-leaf{visibility:hidden}' +
      '.gt-ic{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 4.5);height: calc(var(--spacing) * 4.5);flex-shrink:0;color:var(--muted-foreground)}' +
      '.gt-ic svg{width: calc(var(--spacing) * 3.75);height: calc(var(--spacing) * 3.75)}' +
      '.gt-emoji{font-size:calc(var(--spacing) * 3.25);line-height: 1}' +
      '.gt-name{flex:1 1 auto;min-width: 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem}' +
      '.gt-count{flex-shrink:0;min-width: calc(var(--spacing) * 4.5);padding: 0 calc(var(--spacing) * 1);height: calc(var(--spacing) * 4);line-height: calc(var(--spacing) * 4);border-radius:var(--radius-pill);background:var(--muted);color:var(--muted-foreground);font-size:.625rem;text-align:center}' +
      '.gt-inline{width: 100%;height: calc(var(--spacing) * 5.5);border-radius:calc(var(--radius) * 0.5);border:1px solid var(--ring);background:var(--background);color:inherit;padding: 0 calc(var(--spacing) * 1);font-size:.8125rem;outline:none}' +
      /* ⋯ 菜单 */
      '.gt-more{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 5.5);height: calc(var(--spacing) * 5.5);flex-shrink:0;border-radius:calc(var(--radius) * 0.6);border:0;background:transparent;color:var(--muted-foreground);cursor:pointer;opacity:0}' +
      '.gt-row:hover .gt-more,.gt-more[aria-expanded="true"]{opacity:1}' +
      '.gt-more:hover{background:var(--background);color:inherit}' +
      '.gt-more svg{width: calc(var(--spacing) * 3.5);height: calc(var(--spacing) * 3.5)}' +
      '.gt-empty{padding:calc(var(--spacing) * 2) calc(var(--spacing) * 1.5);font-size:.75rem;color:var(--muted-foreground)}' +
      /* 弹窗 */
      '.gt-overlay{position:fixed;inset: 0;z-index:80;display:flex;align-items:center;justify-content:center;background:var(--overlay-bg-soft)}' +
      '.gt-dialog{width: min(calc(var(--spacing) * 88),calc(100vw - var(--spacing) * 8));max-height: calc(100vh - var(--spacing) * 16);display:flex;flex-direction:column;border-radius:calc(var(--radius) * 1.2);background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px var(--shadow-color-popover);padding: calc(var(--spacing) * 3.5)}' +
      '.gt-dialog-head{display:flex;align-items:center;justify-content:space-between;margin-bottom: calc(var(--spacing) * 1)}' +
      '.gt-dialog-head .gt-more{opacity:1}' +
      '.gt-dialog-title{font-size:calc(var(--spacing) * 3.5);font-weight:600}' +
      '.gt-dialog-desc{font-size:.75rem;color:var(--muted-foreground);margin-bottom: calc(var(--spacing) * 2)}' +
      '.gt-dialog-body{overflow-y:auto;display:flex;flex-direction:column;gap: calc(var(--spacing) * 2);padding: calc(var(--spacing) * 1) 0}' +
      '.gt-dialog-foot{display:flex;justify-content:flex-end;gap: calc(var(--spacing) * 1.5);padding-top: calc(var(--spacing) * 2.5)}' +
      '.gt-field{display:flex;flex-direction:column;gap: calc(var(--spacing) * 1.25)}' +
      '.gt-field>label{font-size:calc(var(--spacing) * 3);font-weight:500;color:var(--muted-foreground)}' +
      '.gt-input{height: calc(var(--spacing) * 7.5);border-radius:calc(var(--radius) * 0.7);border:1px solid var(--border);background:var(--background);color:inherit;padding: 0 calc(var(--spacing) * 2);font-size:.8125rem;outline:none}' +
      '.gt-input:focus{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab,var(--ring) 40%,transparent)}' +
      '.gt-optlist{max-height: calc(var(--spacing) * 48);overflow-y:auto;border:1px solid var(--border);border-radius:calc(var(--radius) * 0.7);padding: calc(var(--spacing) * 1)}' +
      '.gt-opt{display:flex;align-items:center;gap: calc(var(--spacing) * 1.75);padding: calc(var(--spacing) * 1.25) calc(var(--spacing) * 2);border-radius:calc(var(--radius) * 0.5);font-size:.8125rem;cursor:pointer}' +
      '.gt-opt:hover{background:var(--accent)}' +
      '.gt-opt.is-on{background:var(--accent);font-weight:500}' +
      '.gt-opt.is-disabled{opacity:.4;cursor:not-allowed}' +
      '.gt-opt-dot{width: calc(var(--spacing) * 2);height: calc(var(--spacing) * 2);border-radius:var(--radius-pill);border:1px solid var(--muted-foreground);flex-shrink:0}' +
      '.gt-opt.is-on .gt-opt-dot{border:2px solid var(--primary)}' +
      '.gt-opt-name{display:inline-flex;align-items:center;gap: calc(var(--spacing) * 1);min-width: 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.gt-opt-ic{display:inline-flex}' +
      '.gt-opt-ic svg{width: calc(var(--spacing) * 3.25);height: calc(var(--spacing) * 3.25)}' +
      '.gt-btn{height:calc(var(--spacing) * 7.5);padding: 0 calc(var(--spacing) * 3.5);border-radius:calc(var(--radius) * 0.7);font-size:.8125rem;font-weight:500;border:1px solid var(--border);background:var(--background);color:inherit;cursor:pointer}' +
      '.gt-btn:hover{opacity:.85}' +
      '.gt-btn-primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}' +
      '.gt-btn-ghost{border-color:transparent;background:transparent;color:var(--muted-foreground)}' +
      '.gt-btn-danger{background:var(--destructive);color:var(--primary-foreground);border-color:transparent}' +
      /* 图标页签 */
      '.gt-tabs{display:flex;gap: calc(var(--spacing) * 1);border-bottom: 1px solid var(--border);padding-bottom: calc(var(--spacing) * 1.5)}' +
      '.gt-tab{flex:1;height: calc(var(--spacing) * 7);border:0;border-radius:calc(var(--radius) * 0.6);background:transparent;color:var(--muted-foreground);font-size:.8125rem;cursor:pointer}' +
      '.gt-tab.is-on{background:var(--accent);color:var(--foreground);font-weight:500}' +
      '.gt-icpanel{display:flex;flex-direction:column;gap: calc(var(--spacing) * 1.75)}' +
      '.gt-icgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(1.875rem,1fr));gap: calc(var(--spacing) * 1);max-height: calc(var(--spacing) * 52);overflow-y:auto;padding: calc(var(--spacing) * 0.5)}' +
      '.gt-icbtn{display:inline-flex;align-items:center;justify-content:center;aspect-ratio:1;border:1px solid var(--border);border-radius:calc(var(--radius) * 0.6);background:var(--background);color:inherit;cursor:pointer;padding: 0}' +
      '.gt-icbtn:hover{border-color:var(--ring);background:var(--accent)}' +
      '.gt-icbtn svg{width: calc(var(--spacing) * 4);height: calc(var(--spacing) * 4)}' +
      '.gt-icbtn.is-emoji{font-size:calc(var(--spacing) * 4.25);aspect-ratio:auto;height: calc(var(--spacing) * 7.5)}' +
      '.gt-emojirow{display:flex;gap: calc(var(--spacing) * 1.5)}' +
      '.gt-emojirow .gt-input{flex:1;min-width: 0}' +
      '.gt-colorwrap{display:flex;justify-content:center;padding: calc(var(--spacing) * 0.5) 0}' +
      /* 深色主题微调 */
      '.dark .gt-row:hover,.dark .gt-row.is-active{background:color-mix(in oklab,var(--accent) 55%,transparent)}' +
      '.dark .gt-opt:hover,.dark .gt-opt.is-on{background:color-mix(in oklab,var(--accent) 55%,transparent)}' +
      '.dark .gt-count{background:color-mix(in oklab,var(--muted) 40%,transparent)}';
    document.head.appendChild(style);
  }
  injectStyles();

// 对外命名空间不变：App.ui.groupTree（工厂 + 树数据纯函数）
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.groupTree = {
  create: create,
  descendants: descendants,
  isDescendant: isDescendant,
  treeChildren: treeChildren,
  resolveDrop: resolveDrop,
  moveNode: moveNode,
};
