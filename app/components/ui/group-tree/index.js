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
      '.gt-tree{display:flex;flex-direction:column;min-height:0;gap:.125rem}' +
      '.gt-filter{padding:.125rem .375rem .25rem;flex-shrink:0}' +
      '.gt-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:1px;padding-bottom:.375rem}' +
      /* 行 */
      '.gt-row{display:flex;align-items:center;gap:.25rem;height:1.75rem;padding-right:.375rem;border-radius:.4375rem;cursor:pointer;user-select:none;position:relative}' +
      '.gt-row:hover{background:var(--accent)}' +
      '.gt-row.is-active{background:var(--accent);color:var(--foreground)}' +
      '.gt-row[data-gt-zone="before"]{box-shadow:0 -1px 0 0 var(--primary)}' +
      '.gt-row[data-gt-zone="after"]{box-shadow:0 1px 0 0 var(--primary)}' +
      '.gt-row[data-gt-zone="inside"]{outline:1px solid var(--primary);outline-offset:-1px}' +
      '.gt-row[data-gt-zone="no"]{opacity:.45}' +
      '.gt-row.gt-dragging{opacity:.45}' +
      '.gt-row.gt-root{color:var(--muted-foreground);font-weight:500}' +
      '.gt-caret{display:inline-flex;align-items:center;justify-content:center;width:1rem;height:1rem;flex-shrink:0;color:var(--muted-foreground);transition:transform .12s}' +
      '.gt-caret svg{width:.75rem;height:.75rem}' +
      '.gt-caret.is-open{transform:rotate(90deg)}' +
      '.gt-caret.is-leaf{visibility:hidden}' +
      '.gt-ic{display:inline-flex;align-items:center;justify-content:center;width:1.125rem;height:1.125rem;flex-shrink:0;color:var(--muted-foreground)}' +
      '.gt-ic svg{width:.9375rem;height:.9375rem}' +
      '.gt-emoji{font-size:.8125rem;line-height:1}' +
      '.gt-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem}' +
      '.gt-count{flex-shrink:0;min-width:1.125rem;padding:0 .25rem;height:1rem;line-height:1rem;border-radius:9999px;background:var(--muted);color:var(--muted-foreground);font-size:.625rem;text-align:center}' +
      '.gt-inline{width:100%;height:1.375rem;border-radius:.3125rem;border:1px solid var(--ring);background:var(--background);color:inherit;padding:0 .25rem;font-size:.8125rem;outline:none}' +
      /* ⋯ 菜单 */
      '.gt-more{display:inline-flex;align-items:center;justify-content:center;width:1.375rem;height:1.375rem;flex-shrink:0;border-radius:.375rem;border:0;background:transparent;color:var(--muted-foreground);cursor:pointer;opacity:0}' +
      '.gt-row:hover .gt-more,.gt-more[aria-expanded="true"]{opacity:1}' +
      '.gt-more:hover{background:var(--background);color:inherit}' +
      '.gt-more svg{width:.875rem;height:.875rem}' +
      '.gt-empty{padding:.5rem .375rem;font-size:.75rem;color:var(--muted-foreground)}' +
      /* 弹窗 */
      '.gt-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:var(--overlay-bg-soft)}' +
      '.gt-dialog{width:min(22rem,calc(100vw-2rem));max-height:calc(100vh-4rem);display:flex;flex-direction:column;border-radius:.75rem;background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px var(--shadow-color-popover);padding:.875rem}' +
      '.gt-dialog-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.25rem}' +
      '.gt-dialog-head .gt-more{opacity:1}' +
      '.gt-dialog-title{font-size:.875rem;font-weight:600}' +
      '.gt-dialog-desc{font-size:.75rem;color:var(--muted-foreground);margin-bottom:.5rem}' +
      '.gt-dialog-body{overflow-y:auto;display:flex;flex-direction:column;gap:.5rem;padding:.25rem 0}' +
      '.gt-dialog-foot{display:flex;justify-content:flex-end;gap:.375rem;padding-top:.625rem}' +
      '.gt-field{display:flex;flex-direction:column;gap:.3125rem}' +
      '.gt-field>label{font-size:.75rem;font-weight:500;color:var(--muted-foreground)}' +
      '.gt-input{height:1.875rem;border-radius:.4375rem;border:1px solid var(--border);background:var(--background);color:inherit;padding:0 .5rem;font-size:.8125rem;outline:none}' +
      '.gt-input:focus{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab,var(--ring) 40%,transparent)}' +
      '.gt-optlist{max-height:12rem;overflow-y:auto;border:1px solid var(--border);border-radius:.4375rem;padding:.25rem}' +
      '.gt-opt{display:flex;align-items:center;gap:.4375rem;padding:.3125rem .5rem;border-radius:.3125rem;font-size:.8125rem;cursor:pointer}' +
      '.gt-opt:hover{background:var(--accent)}' +
      '.gt-opt.is-on{background:var(--accent);font-weight:500}' +
      '.gt-opt.is-disabled{opacity:.4;cursor:not-allowed}' +
      '.gt-opt-dot{width:.5rem;height:.5rem;border-radius:9999px;border:1px solid var(--muted-foreground);flex-shrink:0}' +
      '.gt-opt.is-on .gt-opt-dot{border:2px solid var(--primary)}' +
      '.gt-opt-name{display:inline-flex;align-items:center;gap:.25rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.gt-opt-ic{display:inline-flex}' +
      '.gt-opt-ic svg{width:.8125rem;height:.8125rem}' +
      '.gt-btn{height:1.875rem;padding:0 .875rem;border-radius:.4375rem;font-size:.8125rem;font-weight:500;border:1px solid var(--border);background:var(--background);color:inherit;cursor:pointer}' +
      '.gt-btn:hover{opacity:.85}' +
      '.gt-btn-primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}' +
      '.gt-btn-ghost{border-color:transparent;background:transparent;color:var(--muted-foreground)}' +
      '.gt-btn-danger{background:var(--destructive);color:var(--primary-foreground);border-color:transparent}' +
      /* 图标页签 */
      '.gt-tabs{display:flex;gap:.25rem;border-bottom:1px solid var(--border);padding-bottom:.375rem}' +
      '.gt-tab{flex:1;height:1.75rem;border:0;border-radius:.375rem;background:transparent;color:var(--muted-foreground);font-size:.8125rem;cursor:pointer}' +
      '.gt-tab.is-on{background:var(--accent);color:var(--foreground);font-weight:500}' +
      '.gt-icpanel{display:flex;flex-direction:column;gap:.4375rem}' +
      '.gt-icgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(1.875rem,1fr));gap:.25rem;max-height:13rem;overflow-y:auto;padding:.125rem}' +
      '.gt-icbtn{display:inline-flex;align-items:center;justify-content:center;aspect-ratio:1;border:1px solid var(--border);border-radius:.375rem;background:var(--background);color:inherit;cursor:pointer;padding:0}' +
      '.gt-icbtn:hover{border-color:var(--ring);background:var(--accent)}' +
      '.gt-icbtn svg{width:1rem;height:1rem}' +
      '.gt-icbtn.is-emoji{font-size:1.0625rem;aspect-ratio:auto;height:1.875rem}' +
      '.gt-emojirow{display:flex;gap:.375rem}' +
      '.gt-emojirow .gt-input{flex:1;min-width:0}' +
      '.gt-colorwrap{display:flex;justify-content:center;padding:.125rem 0}' +
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
