/* ============================================================
 * hub-view.js — 视图控制层（C5 拆分）
 * ------------------------------------------------------------
 * 全量/局部重绘的唯一入口。渲染函数（painters）由 index.js 在
 * 装配期注入，本模块不静态依赖任何渲染域文件，从而打破
 * 「动作层 → 重绘 → 渲染层」与「渲染层 → 动作回调」的双向耦合。
 * 依赖方向：hub-view ← actions / groups-tags / dialogs / events / index
 * ============================================================ */
'use strict';

var painters = {};

/** 装配期注入渲染函数（index.js 调用一次） */
function registerPainters(p) {
  Object.assign(painters, p);
}

/** 全量重渲染(状态变更后) */
function renderFull() {
  var area = document.querySelector('[data-content-area]');
  if (!area || !painters.page) return;
  area.innerHTML = painters.page();
}

/** 仅刷新中间列表(搜索输入时避免抢焦点) */
function rerenderList() {
  var body = document.querySelector('[data-hub-list-body]');
  if (body && painters.list) body.innerHTML = painters.list();
}

/** 仅刷新左侧筛选区(分组/标签激活态) */
function rerenderSideFilters() {
  var side = document.querySelector('[data-hub-side]');
  if (side && painters.side) side.innerHTML = painters.side();
}

/* ---------- 关闭下拉 ---------- */
function closeDropdowns() {
  document.querySelectorAll('[data-dropdown-menu]').forEach(function (m) {
    m.classList.remove('open');
  });
  document.querySelectorAll('[data-dropdown-trigger]').forEach(function (tr) {
    tr.removeAttribute('aria-expanded');
  });
}

export { registerPainters, renderFull, rerenderList, rerenderSideFilters, closeDropdowns };
