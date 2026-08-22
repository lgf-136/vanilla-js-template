/* ============================================================
 * db-events.js — dashboard 模块·事件域(document 事件委托)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为副作用模块:仅注册 document
 * 监听器、无导出被消费,必须被 index.js 显式 import 才会求值
 * (ESM 不 import 则监听器静默失效,架构 2.3.1 硬性约束 1)。
 * 依赖:db-charts.js(initCharts/applyChartFont)。
 * 方向:data ← charts ← events。
 * ============================================================ */
'use strict';

import { initCharts, applyChartFont } from './db-charts.js';

/* ---------- 交互(事件委托) ---------- */
document.addEventListener('click', function (e) {
  var target = e.target;
  if (!target || !target.closest) return;
  var tab = target.closest('[data-db-tab]');
  if (tab) {
    if (tab.disabled) return;
    document.querySelectorAll('[data-db-tab]').forEach(function (el) {
      el.classList.toggle('is-active', el === tab);
    });
    var id = tab.getAttribute('data-db-tab');
    document.querySelectorAll('[data-db-panel]').forEach(function (panel) {
      panel.classList.toggle('hidden', panel.getAttribute('data-db-panel') !== id);
    });
    initCharts(false); // 首次切到 Analytics 时补建面积图;已可见图表仅 resize
    return;
  }
  if (target.closest('[data-db-download]')) {
    App.ui.toast('Dashboard exported to CSV.', 'default');
    return;
  }
});

/* ---------- 图表生命周期:路由渲染完成后初始化,主题/外观变化后重建 ---------- */
document.addEventListener('app:afterRender', function (e) {
  var path = e.detail && e.detail.path;
  if (path !== '/' && path !== '') return;
  applyChartFont();
  initCharts(true);
});
document.addEventListener('app:themechange', function () {
  if (App.currentPath && App.currentPath() !== '/') return;
  applyChartFont();
  initCharts(true);
});
