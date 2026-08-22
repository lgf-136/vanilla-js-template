/* ============================================================
 * dashboard 模块 — 入口装配（H1 拆分）
 * ------------------------------------------------------------
 * 复刻参考项目 shadcn-admin 的 Dashboard 页:统计卡 + 标签页 +
 * Chart.js 柱状/面积图 + 最近销售 + 分析(流量/来源/设备)。
 * 只依赖核心层 App.ui / App.icon;图表用 js/lib/chart.umd.js
 * (单文件 Chart.js v4.4.7,index.html 入口同步加载)。
 *
 * 拆分设计（按业务域，方向严格单向 data → charts → view ← events）：
 *   db-data.js   数据域:STATS/BAR_DATA/AREA_DATA/RECENT_SALES 等固定数据
 *   db-charts.js 图表域:chartBoxHtml、柱状/面积图配置、initCharts、
 *                applyChartFont(每次初始化重读 token,主题变化后重建)
 *   db-view.js   视图域:statCard/recentSalesHtml/barListHtml/tabsHtml/
 *                overviewTab/analyticsTab/renderDashboard 整页组装
 *   db-events.js 事件域:document 事件委托(标签切换/下载)+ 图表生命周期
 *                (app:afterRender / app:themechange),副作用模块,
 *                被本文件显式 import 才会求值
 *
 * 本文件只负责装配:render 透传 ctx.t 给 renderDashboard,再注册模块。
 * ============================================================ */
'use strict';

import { renderDashboard } from './db-view.js';
// 副作用导入:事件委托与图表生命周期监听器在 db-events 求值时注册(无导出被消费,勿删)
import './db-events.js';

function render(_route, ctx) {
  return renderDashboard(ctx.t);
}

App.defineModule({ id: 'dashboard', render: render });
