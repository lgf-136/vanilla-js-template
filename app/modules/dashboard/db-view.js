/* ============================================================
 * db-view.js — dashboard 模块·视图域(卡片/列表/标签页渲染)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为视图域:
 * - statCard / recentSalesHtml / barListHtml 信息卡片与列表
 * - tabsHtml / overviewTab / analyticsTab 标签页内容
 * - renderDashboard(t):整页组装(由 index.js 装配期调用)
 * 依赖:db-data.js(数据)、db-charts.js(chartBoxHtml 系列);
 * 方向:data ← charts ← view。
 * ============================================================ */
'use strict';

import {
  STATS,
  ANALYTICS_STATS,
  RECENT_SALES,
  REFERRERS,
  DEVICES,
} from './db-data.js';
import { barChartHtml, areaChartHtml } from './db-charts.js';

var icon = function () {
  return App.icon;
};

function statCard(t, stat) {
  return (
    '<div data-slot="card" class="' +
    App.ui.cardClass('') +
    '">' +
    '<div class="' +
    App.ui.cardHeaderClass('flex! flex-row items-center justify-between gap-3') +
    '">' +
    '<div data-slot="card-title" class="' +
    App.ui.cardTitleClass('text-sm font-medium') +
    '">' +
    t('dashboard.stat.' + stat.key) +
    '</div>' +
    '<span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">' +
    icon().iconSvg(stat.ic, { class: 'size-4' }) +
    '</span>' +
    '</div>' +
    '<div class="' +
    App.ui.cardContentClass('') +
    '">' +
    '<div class="text-2xl font-bold">' +
    stat.value +
    '</div>' +
    '<p class="text-xs text-muted-foreground">' +
    stat.delta +
    '</p>' +
    '</div></div>'
  );
}

function recentSalesHtml(_t) {
  return (
    '<div class="space-y-8">' +
    RECENT_SALES.map(function (s) {
      return (
        '<div class="flex items-center gap-4">' +
        '<span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">' +
        s.initials +
        '</span>' +
        '<div class="flex flex-1 flex-wrap items-center justify-between">' +
        '<div class="space-y-1">' +
        '<p class="text-sm leading-none font-medium">' +
        s.name +
        '</p>' +
        '<p class="text-sm text-muted-foreground">' +
        s.email +
        '</p>' +
        '</div>' +
        '<div class="font-medium">' +
        s.amount +
        '</div>' +
        '</div></div>'
      );
    }).join('') +
    '</div>'
  );
}

function barListHtml(t, items, formatter, barClass) {
  var max = Math.max.apply(
    null,
    items
      .map(function (i) {
        return i.value;
      })
      .concat([1])
  );
  return (
    '<ul class="space-y-3">' +
    items
      .map(function (i) {
        var width = Math.round((i.value / max) * 100);
        return (
          '<li class="flex items-center justify-between gap-3">' +
          '<div class="min-w-0 flex-1">' +
          '<div class="mb-1 truncate text-xs text-muted-foreground">' +
          i.name +
          '</div>' +
          '<div class="h-2.5 w-full rounded-full bg-muted">' +
          '<div class="h-2.5 rounded-full ' +
          barClass +
          '" style="width:' +
          width +
          '%"></div>' +
          '</div></div>' +
          '<div class="ps-2 text-xs font-medium tabular-nums">' +
          formatter(i.value) +
          '</div>' +
          '</li>'
        );
      })
      .join('') +
    '</ul>'
  );
}

function tabsHtml(t) {
  var tabs = [
    { id: 'overview', label: t('dashboard.tab.overview'), disabled: false },
    { id: 'analytics', label: t('dashboard.tab.analytics'), disabled: false },
    { id: 'reports', label: t('dashboard.tab.reports'), disabled: true },
    { id: 'notifications', label: t('dashboard.tab.notifications'), disabled: true },
  ];
  return (
    '<div class="w-full overflow-x-auto pb-2">' +
    '<div role="tablist" class="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">' +
    tabs
      .map(function (tab) {
        return (
          '<button type="button" role="tab" data-db-tab="' +
          tab.id +
          '" class="db-tab' +
          (tab.id === 'overview' ? ' is-active' : '') +
          (tab.disabled ? ' is-disabled' : '') +
          '"' +
          (tab.disabled ? ' disabled' : '') +
          '>' +
          tab.label +
          '</button>'
        );
      })
      .join('') +
    '</div></div>'
  );
}

function overviewTab(t) {
  return (
    '<div data-db-panel="overview" class="db-panel space-y-4">' +
    '<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">' +
    STATS.map(function (s) {
      return statCard(t, s);
    }).join('') +
    '</div>' +
    '<div class="grid grid-cols-1 gap-4 lg:grid-cols-7">' +
    '<div data-slot="card" class="' +
    App.ui.cardClass('col-span-1 lg:col-span-4') +
    '">' +
    '<div class="' +
    App.ui.cardHeaderClass('') +
    '">' +
    '<div data-slot="card-title" class="' +
    App.ui.cardTitleClass('') +
    '">' +
    t('dashboard.overview.title') +
    '</div>' +
    '</div>' +
    '<div class="' +
    App.ui.cardContentClass('ps-2') +
    '">' +
    barChartHtml(t) +
    '</div>' +
    '</div>' +
    '<div data-slot="card" class="' +
    App.ui.cardClass('col-span-1 lg:col-span-3') +
    '">' +
    '<div class="' +
    App.ui.cardHeaderClass('') +
    '">' +
    '<div data-slot="card-title" class="' +
    App.ui.cardTitleClass('') +
    '">' +
    t('dashboard.recent.title') +
    '</div>' +
    '<div data-slot="card-description" class="text-sm text-muted-foreground">' +
    t('dashboard.recent.desc') +
    '</div>' +
    '</div>' +
    '<div class="' +
    App.ui.cardContentClass('') +
    '">' +
    recentSalesHtml(t) +
    '</div>' +
    '</div></div></div>'
  );
}

function analyticsTab(t) {
  return (
    '<div data-db-panel="analytics" class="db-panel hidden space-y-4">' +
    '<div data-slot="card" class="' +
    App.ui.cardClass('') +
    '">' +
    '<div class="' +
    App.ui.cardHeaderClass('') +
    '">' +
    '<div data-slot="card-title" class="' +
    App.ui.cardTitleClass('') +
    '">' +
    t('dashboard.traffic.title') +
    '</div>' +
    '<div data-slot="card-description" class="text-sm text-muted-foreground">' +
    t('dashboard.traffic.desc') +
    '</div>' +
    '</div>' +
    '<div class="' +
    App.ui.cardContentClass('px-6') +
    '">' +
    areaChartHtml(t) +
    '</div>' +
    '</div>' +
    '<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">' +
    ANALYTICS_STATS.map(function (s) {
      return statCard(t, s);
    }).join('') +
    '</div>' +
    '<div class="grid grid-cols-1 gap-4 lg:grid-cols-7">' +
    '<div data-slot="card" class="' +
    App.ui.cardClass('col-span-1 lg:col-span-4') +
    '">' +
    '<div class="' +
    App.ui.cardHeaderClass('') +
    '">' +
    '<div data-slot="card-title" class="' +
    App.ui.cardTitleClass('') +
    '">' +
    t('dashboard.referrers.title') +
    '</div>' +
    '<div data-slot="card-description" class="text-sm text-muted-foreground">' +
    t('dashboard.referrers.desc') +
    '</div>' +
    '</div>' +
    '<div class="' +
    App.ui.cardContentClass('') +
    '">' +
    barListHtml(
      t,
      REFERRERS,
      function (n) {
        return String(n);
      },
      'bg-primary'
    ) +
    '</div>' +
    '</div>' +
    '<div data-slot="card" class="' +
    App.ui.cardClass('col-span-1 lg:col-span-3') +
    '">' +
    '<div class="' +
    App.ui.cardHeaderClass('') +
    '">' +
    '<div data-slot="card-title" class="' +
    App.ui.cardTitleClass('') +
    '">' +
    t('dashboard.devices.title') +
    '</div>' +
    '<div data-slot="card-description" class="text-sm text-muted-foreground">' +
    t('dashboard.devices.desc') +
    '</div>' +
    '</div>' +
    '<div class="' +
    App.ui.cardContentClass('') +
    '">' +
    barListHtml(
      t,
      DEVICES,
      function (n) {
        return n + '%';
      },
      'bg-muted-foreground'
    ) +
    '</div>' +
    '</div></div></div>'
  );
}

/** 整页组装(与拆分前 render(route, ctx) 返回的 HTML 逐字一致) */
export function renderDashboard(t) {
  return (
    '<div class="mx-auto flex max-w-7xl flex-col gap-4">' +
    '<div class="mb-2 flex items-center justify-between space-y-2">' +
    '<h1 class="font-heading text-2xl font-bold tracking-tight">' +
    t('dashboard.title') +
    '</h1>' +
    '<button type="button" data-db-download data-slot="button" class="' +
    App.ui.buttonClass('default') +
    '">' +
    t('dashboard.download') +
    '</button>' +
    '</div>' +
    tabsHtml(t) +
    overviewTab(t) +
    analyticsTab(t) +
    '</div>'
  );
}
