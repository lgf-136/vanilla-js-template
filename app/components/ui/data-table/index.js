/* ============================================================
 * data-table/index.js — 通用数据表格(公共组件,受控组件铁律)
 * ------------------------------------------------------------
 * 用法:
 *   var table = App.ui.dataTable({
 *     id: 'tasks',                       // 实例唯一 id(事件路由 + 重渲染定位,必填)
 *     data: function () { return rows; },// 数据源:数组或返回数组的函数(每次渲染读取)
 *     rowKey: 'id',                      // 行唯一键字段
 *     searchPlaceholder: function (t) { return t('x.searchPlaceholder'); },
 *     searchKeys: ['title'],             // 缺省搜索字段;或提供 search(row, q) 自定义
 *     columns: [                         // 列定义(首列为选择框,末列为行操作,均自动)
 *       { key: 'id', label: function (t) { return t('x.col.id'); },
 *         sortable: false, hideable: false, cellClass: 'w-20 text-muted-foreground',
 *         render: function (row) { return row.id; } }
 *     ],
 *     filters: [                         // 分面过滤器(工具栏左侧,可在「过滤」菜单显隐)
 *       { key: 'status', label: function (t) { return t('x.filter.status'); },
 *         options: [{ value, label, icon }], getValue: function (row) { return row.status; } }
 *     ],
 *     pageSizeOptions: [10, 20, 30, 40, 50],
 *     bulk: {                            // 批量操作条(选中后浮现)
 *       groups: [{ action: 'status', label: function (t) { ... }, icon: 'x', options: [...] }],
 *       items:  [{ action: 'delete', label: function (t) { ... }, icon: 'trash-2', variant: 'destructive' }],
 *       onGroup: function (action, value, rows) { ... },   // 子菜单项点击(不清选择,由宿主决定)
 *       onItem:  function (action, rows) { ... },          // 图标按钮点击
 *     },
 *     rowActionsHtml: function (row, t) { return '...'; }, // 行尾操作菜单(可选)
 *     toolbarExtra: function (t) { return '...'; },        // 工具栏右侧附加内容(可选)
 *   });
 *   // 模块 render 内: return table.render(t);
 *   // 数据变更后: table.refresh(); 清空选择: table.clearSelection(); 读取选中: table.selected();
 * ------------------------------------------------------------
 * 特性:模糊搜索 / 分面过滤(可搜选项+计数) / 「过滤」显隐切换 / 列显隐 / 排序(默认|升|降|隐藏)
 *      行选择(全选/半选) / 批量操作条 / 分页(页码省略号)
 * 受控:全部视觉消费 tokens.css 变量(含注入样式,带 var(--token, fallback) 回退链路),
 *      不写死任何颜色;明暗两套主题与全部风格下行为一致。
 * i18n:通用文案走 core 词典 dataTable.*(宿主传入的 t 自动兜底到核心词典)。
 * ------------------------------------------------------------
 * 拆分设计（红线 12）：本目录按职责拆为多文件 ESM，依赖严格单向：
 *   store.js(实例表+数据管道纯逻辑) ← toolbar.js(工具栏/过滤渲染,含 esc/ic/text)
 *   ← parts.js(分页+批量条渲染) ← render.js(表格主体+渲染入口)
 *   ← events.js(document 全局委托,由本入口显式导入触发) ← index.js(装配)。
 * 本文件只做装配：注入 <style>（内容与拆分前逐字一致）+ 挂载 App.ui.dataTable
 * （opts 校验、实例状态初始化、生命周期方法逐字保留，对外面零变化）。
 * ============================================================ */
'use strict';

import {
  ensureEventsOnce,
  instances,
  pageCount,
  selectedCount,
  selectedRows,
} from './store.js';
import { render, rerender } from './render.js';
import { bindEvents } from './events.js';

  /* ---------- 样式注入(全部消费 tokens 变量,带回退链路) ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.querySelector('[data-data-table-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-data-table-style', '');
    style.textContent =
      /* 工具栏搜索宽度 */
      '.dt-search-wrap{width: calc(var(--spacing) * 37.5);flex:none}' +
      '@media (min-width: 1024px){.dt-search-wrap{width:calc(var(--spacing) * 62.5)}}' +
      /* 过滤下拉 */
      '.dt-filter-list{max-height:calc(var(--spacing) * 72);overflow-y:auto;padding: calc(var(--spacing) * 1)}' +
      '.dt-filter-search-wrap{margin:calc(var(--spacing) * 1) calc(var(--spacing) * 2) calc(var(--spacing) * 2);min-width: 0}' +
      '.dt-filter-empty{padding:calc(var(--spacing) * 6) calc(var(--spacing) * 2);font-size:.875rem;color:var(--muted-foreground);text-align:center}' +
      /* 表格 */
      '.dt-table-wrap{border:1px solid var(--border);border-radius:var(--radius,0.5rem);overflow:auto;background:var(--card)}' +
      '.dt-table{width: 100%;min-width: calc(var(--spacing) * 144);border-collapse:collapse;font-size:.875rem}' +
      '.dt-th{height: calc(var(--spacing) * 10);padding: 0 calc(var(--spacing) * 2);text-align:left;font-weight:500;color:var(--foreground);border-bottom: 1px solid var(--border);white-space:nowrap;background:var(--card);vertical-align:middle}' +
      '.dt-th .dt-checkbox .dt-check,.dt-td .dt-checkbox .dt-check{transform:translateY(2px)}' +
      '.dt-td{height: calc(var(--spacing) * 12);padding: calc(var(--spacing) * 3) calc(var(--spacing) * 2);border-bottom: 1px solid var(--border);vertical-align:middle}' +
      '.dt-table tbody tr{transition:background-color .15s}' +
      '.dt-table tbody tr:hover{background:color-mix(in oklab,var(--muted) 50%,transparent)}' +
      '.dt-table tbody tr.is-selected{background:var(--muted)}' +
      '.dt-table tbody tr:last-child .dt-td{border-bottom: none}' +
      /* 复选框(视觉方块 + 隐藏 input) */
      '.dt-check{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 4);height: calc(var(--spacing) * 4);flex:none;border-radius:calc(var(--radius,0.5rem)*.5);border:1px solid var(--border);background:var(--background);color:transparent;cursor:pointer;transition:background-color .15s,border-color .15s,color .15s}' +
      '.dt-check svg{opacity:0;width: calc(var(--spacing) * 3.5);height: calc(var(--spacing) * 3.5)}' +
      '.dt-check.is-checked{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}' +
      '.dt-check.is-checked svg{opacity:1}' +
      '.dt-check.is-indeterminate{background:var(--primary);border-color:var(--primary)}' +
      '.dt-check.is-indeterminate::after{content:\'\';display:block;width: calc(var(--spacing) * 2);height: calc(var(--spacing) * 0.5);border-radius:1px;background:var(--primary-foreground)}' +
      '.dt-check-input{position:absolute;width: 1px;height: 1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
      /* 分页 */
      '.dt-pagination{display:flex;align-items:center;justify-content:space-between;gap: calc(var(--spacing) * 4);flex-wrap:wrap;padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);border-top: 1px solid var(--border);font-size:.875rem;color:var(--muted-foreground)}' +
      /* 批量操作浮动条(固定在视口底部居中,毛玻璃药丸) */
      '.dt-bulk-bar{position:fixed;bottom: calc(var(--spacing) * 6);left: 50%;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap: calc(var(--spacing) * 2);border:1px solid var(--border);border-radius:calc(var(--radius,0.5rem)*1.5);background:color-mix(in oklab,var(--background) 95%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--foreground);box-shadow:0 16px 48px var(--shadow-color-popover);padding: calc(var(--spacing) * 2);transition:transform .3s ease}' +
      '.dt-bulk-bar:hover{transform:translateX(-50%) scale(1.05)}';
    document.head.appendChild(style);
  }
  injectStyles();

  /* ---------- 工厂 ---------- */
  window.App = window.App || {};
  App.ui = App.ui || {};
  App.ui.dataTable = function (opts) {
    opts = opts || {};
    if (!opts.id) throw new Error('dataTable: 缺少必填的 id');
    var inst = {
      id: opts.id,
      opts: opts,
      t: null,
      state: {
        search: '',
        filterSel: {},
        filterSearch: {},
        sort: { key: '', dir: '' },
        page: 1,
        pageSize: (opts.pageSizeOptions && opts.pageSizeOptions[0]) || 10,
        selection: {},
        visibility: {},
        filterVisibility: {},
      },
    };
    (opts.columns || []).forEach(function (c) {
      inst.state.visibility[c.key] = c.visible !== false;
    });
    (opts.filters || []).forEach(function (f) {
      inst.state.filterVisibility[f.key] = true;
    });
    instances[opts.id] = inst;
    ensureEventsOnce(bindEvents);
    return {
      render: function (t) {
        inst.t = t;
        return render(inst, t);
      },
      refresh: function () {
        rerender(inst);
      },
      setPage: function (p) {
        inst.state.page = Math.max(1, Math.min(pageCount(inst), p));
        rerender(inst);
      },
      clearSelection: function () {
        inst.state.selection = {};
        rerender(inst);
      },
      selected: function () {
        return selectedRows(inst);
      },
      selectedCount: function () {
        return selectedCount(inst);
      },
      destroy: function () {
        delete instances[inst.id];
      },
    };
  };
