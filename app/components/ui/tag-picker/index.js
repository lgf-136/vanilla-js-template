/* ============================================================
 * tag-picker.js — 公共标签组件(零依赖,多模块复用)
 * ------------------------------------------------------------
 * 设计要点(标签 ≠ 分组,两者功能刻意不同):
 *   - 标签是扁平集合,无层级、无拖拽、无自定义图标 —— 统一使用
 *     「#」符号 + 19 色调色板(强调色 accent 跟随主题 --primary)
 *     区分标签,类似 GitHub / Notion 的彩色标签体系。
 *   - App.ui.tagPicker.create(opts) 返回一个实例,提供两个视图:
 *       managerHtml()  侧栏标签管理列表:全部标签(清除筛选)/
 *                      未标记筛选 / 搜索 / 颜色过滤 / 计数角标 /
 *                      右键+⋯ 菜单(重命名 / 改色 / 删除)
 *       pickerHtml()   Gmail 式多选下拉:模糊搜索实时过滤 + 高亮、
 *                      点选即切换(不关闭,可连续多选)、
 *                      无匹配时「+ 创建新标签」、Enter 快速选中/新建、
 *                      ↑↓ 键盘导航、已选计数 + 完成。
 *   - 创建/重命名弹窗内置名称校验(空 / 重名),颜色选择为 19 色
 *     圆点色板 + hex 输入;改色复用 App.ui.colorPicker 圆形拾色器。
 * 事件:document 级委托,作用域限定 [data-tp],多实例共存。
 * 依赖:App.icon.iconSvg、App.ui.color、App.ui.colorPicker、App.ui.toast。
 * ------------------------------------------------------------
 * 拆分设计（红线 12，自 1012 行单文件按业务域切分；对外面不变）：
 *   model.js    纯逻辑（fuzzyMatch/highlight/nextColor/validateName）、
 *               节点查找（instOf/nodeOf）、INSTANCES 单例注册表、
 *               共享安全访问器（esc/ic/resolveColor 等）——依赖图最底层
 *   render.js   视图 HTML：managerHtml 管理列表 / pickerHtml 多选下拉
 *   menu.js     右键/⋯ 菜单：菜单项 HTML + 浮层生命周期（showCtx/
 *               hideCtx/toggleCtx），ctxPopup/ctxTrigger 私有单例
 *   dialog.js   openDialog 全屏遮罩确认弹窗族（删除确认），overlay 单例
 *   popover.js  新建/重命名锚定 Popover（openTagDialog/tagFormHtml/
 *               定位与关闭），tagPop 单例
 *   events.js   document 委托（click/input/keydown/contextmenu），
 *               副作用模块、无导出，由本文件显式导入
 *   index.js    本文件：装配 create() 工厂 + 样式注入 + App.ui.tagPicker
 *               挂载（挂载块逐字保留拆分前原文）
 * 依赖方向严格单向：model ← render/menu/dialog/popover ← events ← index；
 * import 顺序即求值顺序，document 监听器注册顺序与拆分前一致
 * （dialog 遮罩 → popover 外点/Esc → events 主委托）。
 * ============================================================ */
'use strict';

import {
  INSTANCES,
  PALETTE,
  fuzzyMatch,
  highlight,
  nextColor,
} from './model.js';
import { managerHtml, pickerHtml } from './render.js';
// menu/dialog 虽无被本文件直接调用的符号，也必须显式导入（副作用
// import 同样保证模块求值）：
// ① 保证 ESM 求值顺序 = 拆分前监听器注册顺序（dialog 遮罩 → popover 外点/Esc → events 主委托）；
// ② 防止 events 内部重构后二者沦为孤儿文件。
import './menu.js';
import './dialog.js';
import { openTagDialog } from './popover.js';
// 副作用模块必须显式导入（ARCHITECTURE 2.3.1）：events.js 仅注册监听器、无导出
import './events.js';

  /* ---------- 实例 ---------- */
  var SEQ = 0;

  function create(opts) {
    opts = opts || {};
    var inst = {
      uid: 'tp-' + ++SEQ,
      opts: opts,
      pickerSearch: '',
      pickerIndex: -1,
      pickerQuery: '',
      managerFilter: '',
      managerColor: '',
      nodes: function () {
        var fn = opts.nodes;
        return typeof fn === 'function' ? fn() : [];
      },
      labels: function () {
        return opts.labels || {};
      },
      setPickerSearch: function (v) {
        inst.pickerSearch = String(v || '');
        inst.pickerIndex = -1;
      },
      setManagerFilter: function (v) {
        inst.managerFilter = String(v || '');
      },
      setManagerColor: function (v) {
        inst.managerColor = String(v || '');
      },
      /** 触发宿主整体重渲染(搜索/筛选/增删改后) */
      refresh: function () {
        if (typeof inst.opts.onRender === 'function') inst.opts.onRender();
      },
      render: function () {
        return managerHtml(inst);
      },
      pickerHtml: function (pickedIds) {
        return pickerHtml(inst, pickedIds);
      },
      /** 新建标签 Popover(anchorEl 为触发按钮,用于锚定定位) */
      openCreateDialog: function (anchorEl) {
        openTagDialog(inst, null, anchorEl || null);
      },
    };
    INSTANCES[inst.uid] = inst;
    return inst;
  }

  /* ---------- 样式注入 ---------- */
  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    var style = document.createElement('style');
    style.setAttribute('data-tag-picker-style', '');
    style.textContent =
      /* 管理列表 */
      '.tp{display:flex;flex-direction:column;min-height: 0;flex:1 1 auto}' +
      '.tp-manager{display:flex;flex-direction:column;min-height: 0;gap: calc(var(--spacing) * 1);flex:1 1 auto}' +
      '.tp-search{padding: calc(var(--spacing) * 0.5) calc(var(--spacing) * 1.5)}' +
      '.tp-picker-search{display:flex;align-items:center;padding: 0 calc(var(--spacing) * 0.5)}' +
      '.tp-input{width:100%;height: calc(var(--spacing) * 6.5);border-radius:calc(var(--radius) * 0.7);border:1px solid var(--border);background:transparent;color:inherit;padding: 0 calc(var(--spacing) * 6);font-size:.75rem;outline:none}' +
      '.tp-input:focus{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab,var(--ring) 40%,transparent)}' +
      '.tp-colorbar{display:flex;align-items:center;gap: calc(var(--spacing) * 0.75);padding: calc(var(--spacing) * 0.5) calc(var(--spacing) * 1.5) calc(var(--spacing) * 1);flex-wrap:wrap}' +
      '.tp-swatch{width: calc(var(--spacing) * 3.5);height: calc(var(--spacing) * 3.5);border-radius:var(--radius-pill);border:1px solid var(--border);padding: 0;cursor:pointer;flex-shrink:0}' +
      '.tp-swatch.is-on{outline:2px solid var(--ring);outline-offset:1px}' +
      '.tp-body{flex:1 1 auto;min-height: 0;overflow-y:auto;display:flex;flex-direction:column;gap: 1px;padding: calc(var(--spacing) * 0.5) calc(var(--spacing) * 1.5) calc(var(--spacing) * 1.5)}' +
      '.tp-row{display:flex;align-items:center;gap: calc(var(--spacing) * 1.5);height: calc(var(--spacing) * 6.5);padding: 0 calc(var(--spacing) * 1.5);border-radius:calc(var(--radius) * 0.7);cursor:pointer;user-select:none;position:relative}' +
      '.tp-row:hover{background:var(--accent)}' +
      '.tp-row.is-active{background:var(--accent);color:var(--foreground);box-shadow:inset 0 0 0 1px var(--border)}' +
      '.tp-row.tp-root{color:var(--muted-foreground);font-weight:500}' +
      '.tp-hash{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 3.75);height: calc(var(--spacing) * 3.75);flex-shrink:0;font-size:.75rem;font-weight:700;line-height: 1;border-radius:calc(var(--radius) * 0.4);background:color-mix(in oklab,currentColor 14%,transparent)}' +
      '.tp-hash.tp-hash-root{background:transparent;color:var(--muted-foreground)}' +
      '.tp-name{flex:1 1 auto;min-width: 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem}' +
      '.tp-count{flex-shrink:0;min-width: calc(var(--spacing) * 4.5);padding: 0 calc(var(--spacing) * 1);height: calc(var(--spacing) * 4);line-height: calc(var(--spacing) * 4);border-radius:var(--radius-pill);background:var(--muted);color:var(--muted-foreground);font-size:.625rem;text-align:center}' +
      '.tp-more{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 5);height: calc(var(--spacing) * 5);flex-shrink:0;border-radius:calc(var(--radius) * 0.6);border:0;background:transparent;color:var(--muted-foreground);cursor:pointer;opacity:0}' +
      '.tp-row:hover .tp-more,.tp-more[aria-expanded="true"]{opacity:1}' +
      '.tp-more:hover{background:var(--background);color:inherit}' +
      '.tp-more svg{width: calc(var(--spacing) * 3.25);height: calc(var(--spacing) * 3.25)}' +
      '.tp-empty{padding:calc(var(--spacing) * 2) calc(var(--spacing) * 1.5);font-size:.75rem;color:var(--muted-foreground)}' +
      '.tp-body mark{background:transparent;color:inherit;font-weight:700;text-decoration:underline;text-decoration-color:var(--primary);text-underline-offset:2px}' +
      /* 多选下拉 */
      '.tp-picker{display:flex;flex-direction:column;width: calc(var(--spacing) * 64);max-height: calc(var(--spacing) * 88);gap: calc(var(--spacing) * 1)}' +
      '.tp-picker .tp-search{padding:0}' +
      '.tp-pick-list{overflow-y:auto;max-height: calc(var(--spacing) * 56);display:flex;flex-direction:column;gap: 1px;padding: calc(var(--spacing) * 0.5)}' +
      '.tp-opt{display:flex;align-items:center;gap: calc(var(--spacing) * 1.75);padding: calc(var(--spacing) * 1.25) calc(var(--spacing) * 2);border:0;border-radius:calc(var(--radius) * 0.6);background:transparent;color:inherit;font-size:.8125rem;cursor:pointer;text-align:left;outline:none;width: 100%}' +
      '.tp-opt:hover,.tp-opt.is-hip{background:var(--accent)}' +
      '.tp-opt.is-on{color:var(--foreground)}' +
      '.tp-opt.is-on .tp-check{background:var(--primary);color:var(--primary-foreground)}' +
      '.tp-check{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 3.75);height: calc(var(--spacing) * 3.75);flex-shrink:0;border-radius:calc(var(--radius) * 0.4);border:1px solid var(--border);background:var(--background);color:transparent}' +
      '.tp-check svg{width: calc(var(--spacing) * 3);height: calc(var(--spacing) * 3)}' +
      '.tp-opt-name{flex:1 1 auto;min-width: 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.tp-opt-name b{font-weight:600}' +
      '.tp-opt-create{color:var(--primary)}' +
      '.tp-opt-plus{display:inline-flex;color:inherit}' +
      '.tp-opt-plus svg{width: calc(var(--spacing) * 3.5);height: calc(var(--spacing) * 3.5)}' +
      '.tp-pick-foot{display:flex;align-items:center;justify-content:space-between;gap: calc(var(--spacing) * 2);border-top: 1px solid var(--border);padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 0.5) 0}' +
      '.tp-pick-count{font-size:calc(var(--spacing) * 2.75);color:var(--muted-foreground)}' +
      /* 弹窗 */
      /* 新建/重命名标签:锚定 Popover(Chrome 添加联系人风格) */
      '.tp-pop{position:fixed;z-index:1100;width: min(calc(var(--spacing) * 80),calc(100vw - var(--spacing) * 8));max-height: calc(100vh - var(--spacing) * 8);overflow-y:auto;border-radius:calc(var(--radius) * 1.2);background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px var(--shadow-color-popover);border:1px solid var(--border);padding: calc(var(--spacing) * 3.5);display:flex;flex-direction:column;gap: calc(var(--spacing) * 2)}' +
      '.tp-pop-head{display:flex;align-items:center;justify-content:space-between;gap: calc(var(--spacing) * 2)}' +
      '.tp-overlay{position:fixed;inset: 0;z-index:80;display:flex;align-items:center;justify-content:center;background:var(--overlay-bg-soft)}' +
      '.tp-dialog{width: min(calc(var(--spacing) * 88),calc(100vw - var(--spacing) * 8));max-height: calc(100vh - var(--spacing) * 16);display:flex;flex-direction:column;border-radius:calc(var(--radius) * 1.2);background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px var(--shadow-color-popover);padding: calc(var(--spacing) * 3.5)}' +
      '.tp-dialog-head{display:flex;align-items:center;justify-content:space-between;margin-bottom: calc(var(--spacing) * 1)}' +
      '.tp-dialog-title{font-size:calc(var(--spacing) * 3.5);font-weight:600}' +
      '.tp-dialog-desc{font-size:.75rem;color:var(--muted-foreground);margin-bottom: calc(var(--spacing) * 2)}' +
      '.tp-dialog-body{overflow-y:auto;display:flex;flex-direction:column;gap: calc(var(--spacing) * 2.5);padding: calc(var(--spacing) * 1) 0}' +
      '.tp-dialog-foot{display:flex;justify-content:flex-end;gap: calc(var(--spacing) * 1.5);padding-top: calc(var(--spacing) * 2.5)}' +
      '.tp-field{display:flex;flex-direction:column;gap: calc(var(--spacing) * 1.25)}' +
      '.tp-field>label{font-size:calc(var(--spacing) * 3);font-weight:500;color:var(--muted-foreground)}' +
      '.tp-swatches{display:flex;flex-wrap:wrap;gap: calc(var(--spacing) * 1.5);align-items:center}' +
      '.tp-swatch-lg{width: calc(var(--spacing) * 5.5);height: calc(var(--spacing) * 5.5)}' +
      '.tp-swatch-custom{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 5.5);height: calc(var(--spacing) * 5.5);border-radius:var(--radius-pill);border:1px dashed var(--border);cursor:pointer;color:var(--muted-foreground);background:var(--sw,transparent)}' +
      '.tp-swatch-custom svg{width: calc(var(--spacing) * 3.25);height: calc(var(--spacing) * 3.25)}' +
      '.tp-btn{height:calc(var(--spacing) * 7.5);padding: 0 calc(var(--spacing) * 3.5);border-radius:calc(var(--radius) * 0.7);font-size:.8125rem;font-weight:500;border:1px solid var(--border);background:var(--background);color:inherit;cursor:pointer}' +
      '.tp-btn:hover{opacity:.85}' +
      '.tp-btn-primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}' +
      '.tp-btn-danger{background:var(--destructive);color:var(--primary-foreground);border-color:transparent}' +
      '.tp-dlg-x{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 6);height: calc(var(--spacing) * 6);border:0;border-radius:calc(var(--radius) * 0.6);background:transparent;color:var(--muted-foreground);cursor:pointer}' +
      '.tp-dlg-x:hover{background:var(--accent);color:inherit}' +
      '.tp-dlg-x svg{width: calc(var(--spacing) * 3.5);height: calc(var(--spacing) * 3.5)}' +
      /* 深色主题微调 */
      '.dark .tp-row:hover,.dark .tp-row.is-active{background:color-mix(in oklab,var(--accent) 55%,transparent)}' +
      '.dark .tp-opt:hover,.dark .tp-opt.is-hip{background:color-mix(in oklab,var(--accent) 55%,transparent)}' +
      '.dark .tp-count{background:color-mix(in oklab,var(--muted) 40%,transparent)}';
    document.head.appendChild(style);
  }
  injectStyles();

// 对外命名空间不变：App.ui.tagPicker（挂载块逐字保留拆分前原文）
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.tagPicker = {
  create: create,
  PALETTE: PALETTE,
  fuzzyMatch: fuzzyMatch,
  highlight: highlight,
  nextColor: nextColor,
};
