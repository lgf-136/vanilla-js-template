/* ============================================================
 * db-charts.js — dashboard 模块·图表域(Chart.js 配置与生命周期)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为图表业务域:
 * - 容器 HTML(chartBoxHtml/barChartHtml/areaChartHtml)
 * - 设计系统 CSS 变量读取(cssVar/radiusPx/chartColors)
 * - 柱状/面积图配置(barChartConfig/areaChartConfig)与初始化
 *   (initCharts:force 重建 / 补建+resize;applyChartFont 跟随正文字体)
 * - 主题/强调色变化后由 db-events.js 的 app:themechange 触发重建,
 *   每次初始化重新读取 token(ARCHITECTURE 3.7.4)
 * 依赖:db-data.js(图表数据),全局 window.Chart(deps 预注入的 chart.umd.js)。
 * 方向:data ← charts。
 * ============================================================ */
'use strict';

import { BAR_DATA, AREA_DATA } from './db-data.js';

/** 固定高度容器 + canvas 占位;图表在渲染完成后经 app:afterRender 初始化 */
export function chartBoxHtml(height, kind, ariaLabel) {
  return (
    '<div style="position:relative;height:' +
    height +
    'px">' +
    '<canvas data-db-chart="' +
    kind +
    '" role="img" aria-label="' +
    ariaLabel +
    '"></canvas>' +
    '</div>'
  );
}

export function barChartHtml(t) {
  return chartBoxHtml(350, 'overview-bar', t('dashboard.chart.barAria'));
}

export function areaChartHtml(t) {
  return chartBoxHtml(300, 'analytics-area', t('dashboard.chart.areaAria'));
}

/** 读取设计系统 CSS 变量(主题/强调色变化后重新读取,图表配色随之刷新) */
function cssVar(name) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || '').trim();
}

/** 圆角设置(--radius)换算为 px,供 Chart.js 的 borderRadius / cornerRadius 使用 */
function radiusPx() {
  var m = cssVar('--radius').match(/([\d.]+)(px|rem)?/);
  if (!m) return 8;
  var n = parseFloat(m[1]);
  if (m[2] === 'rem') n *= 16;
  return Math.round(n);
}

function chartColors() {
  return {
    primary: cssVar('--primary'),
    muted: cssVar('--muted-foreground'),
    border: cssVar('--border'),
    popover: cssVar('--popover'),
    foreground: cssVar('--foreground'),
    // 强调色系列(--chart-*):主题设置"强调色"选择后随之变化
    chart1: cssVar('--chart-1'),
    chart2: cssVar('--chart-2'),
    chart3: cssVar('--chart-3'),
  };
}

/** 类 shadcn 的 Tooltip(跟随 popover/边框/前景设计变量) */
function tooltipConfig(colors) {
  return {
    backgroundColor: colors.popover,
    titleColor: colors.foreground,
    bodyColor: colors.muted,
    borderColor: colors.border,
    borderWidth: 1,
    cornerRadius: radiusPx(),
    padding: 8,
    boxPadding: 4,
    displayColors: false,
    titleFont: { size: 12, weight: '600' },
    bodyFont: { size: 12 },
  };
}

/** Overview 柱状图(与参考 recharts BarChart 对齐:无网格、y 轴 $ 前缀、圆角柱) */
function barChartConfig() {
  var colors = chartColors();
  return {
    type: 'bar',
    data: {
      labels: BAR_DATA.map(function (d) {
        return d.name;
      }),
      datasets: [
        {
          label: 'Total',
          data: BAR_DATA.map(function (d) {
            return d.total;
          }),
          backgroundColor: colors.primary,
          borderRadius: radiusPx(),
          borderSkipped: false,
          maxBarThickness: 42,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: false }, tooltip: tooltipConfig(colors) },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: colors.muted, font: { size: 12 } },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: colors.muted,
            font: { size: 12 },
            callback: function (v) {
              return '$' + v;
            },
          },
        },
      },
    },
  };
}

/** Analytics 面积图(与参考 recharts AreaChart 对齐:渐变填充、平滑曲线、无点) */
function areaChartConfig() {
  var colors = chartColors();
  function dataset(key, label, color) {
    return {
      label: label,
      data: AREA_DATA.map(function (d) {
        return d[key];
      }),
      borderColor: color,
      backgroundColor: function (context) {
        var chart = context.chart;
        if (!chart.chartArea) return color;
        var g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
        g.addColorStop(0, color);
        g.addColorStop(1, 'transparent');
        return g;
      },
      tension: 0.4,
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
    };
  }
  return {
    type: 'line',
    data: {
      labels: AREA_DATA.map(function (d) {
        return d.name;
      }),
      datasets: [
        // 主序列用强调主色(--primary 跟随强调色),对比序列用强调色浅变体(--chart-2)
        dataset('clicks', 'Clicks', colors.primary),
        dataset('uniques', 'Uniques', colors.chart2 || colors.muted),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: false }, tooltip: tooltipConfig(colors) },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: colors.muted, font: { size: 12 } },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: colors.muted, font: { size: 12 } },
        },
      },
    },
  };
}

/**
 * 初始化 / 刷新图表。force=true 时销毁重建(路由重渲染、主题变化后重新
 * 读取设计变量);false 时只补建缺失图表并对可见图表 resize(切到
 * Analytics 标签时 analytics-area 首次可见,Chart.js 经 ResizeObserver
 * 自动适配宽度)。
 */
export function initCharts(force) {
  if (!window.Chart) return;
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-db-chart]'), function (cv) {
    var existing = window.Chart.getChart(cv);
    if (existing && !force) {
      if (cv.offsetParent !== null) existing.resize();
      return;
    }
    if (existing) existing.destroy();
    var kind = cv.getAttribute('data-db-chart');
    var cfg = kind === 'overview-bar' ? barChartConfig() : areaChartConfig();
    new window.Chart(cv, cfg);
  });
}

/** 图表默认字体跟随设计系统正文字体 */
export function applyChartFont() {
  if (!window.Chart) return;
  var f = cssVar('--font-sans-base');
  if (f) window.Chart.defaults.font.family = f;
}
