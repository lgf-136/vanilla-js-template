/* ============================================================
 * db-data.js — dashboard 模块·数据域(纯静态数据,与参考项目一致)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为最底层数据域,无逻辑、无副作用,
 * 仅导出图表/列表所需的固定数据。
 * ============================================================ */
'use strict';

export var STATS = [
  { key: 'revenue', value: '$45,231.89', delta: '+20.1% from last month', ic: 'dollar-sign' },
  { key: 'subscriptions', value: '+2350', delta: '+180.1% from last month', ic: 'users' },
  { key: 'sales', value: '+12,234', delta: '+19% from last month', ic: 'credit-card' },
  { key: 'active', value: '+573', delta: '+201 since last hour', ic: 'activity' },
];

export var ANALYTICS_STATS = [
  { key: 'clicks', value: '1,248', delta: '+12.4% vs last week', ic: 'activity' },
  { key: 'uniques', value: '832', delta: '+5.8% vs last week', ic: 'users' },
  { key: 'bounce', value: '42%', delta: '-3.2% vs last week', ic: 'circle-dot' },
  { key: 'session', value: '3m 24s', delta: '+18s vs last week', ic: 'timer' },
];

export var BAR_DATA = [
  { name: 'Jan', total: 1870 },
  { name: 'Feb', total: 2250 },
  { name: 'Mar', total: 1320 },
  { name: 'Apr', total: 3120 },
  { name: 'May', total: 2490 },
  { name: 'Jun', total: 3980 },
  { name: 'Jul', total: 2110 },
  { name: 'Aug', total: 3540 },
  { name: 'Sep', total: 2830 },
  { name: 'Oct', total: 1890 },
  { name: 'Nov', total: 3310 },
  { name: 'Dec', total: 4140 },
];

export var AREA_DATA = [
  { name: 'Mon', clicks: 420, uniques: 260 },
  { name: 'Tue', clicks: 510, uniques: 330 },
  { name: 'Wed', clicks: 640, uniques: 410 },
  { name: 'Thu', clicks: 580, uniques: 380 },
  { name: 'Fri', clicks: 720, uniques: 450 },
  { name: 'Sat', clicks: 460, uniques: 310 },
  { name: 'Sun', clicks: 390, uniques: 240 },
];

export var RECENT_SALES = [
  {
    initials: 'OM',
    name: 'Olivia Martin',
    email: 'olivia.martin@email.com',
    amount: '+$1,999.00',
  },
  { initials: 'JL', name: 'Jackson Lee', email: 'jackson.lee@email.com', amount: '+$39.00' },
  {
    initials: 'IN',
    name: 'Isabella Nguyen',
    email: 'isabella.nguyen@email.com',
    amount: '+$299.00',
  },
  { initials: 'WK', name: 'William Kim', email: 'will@email.com', amount: '+$99.00' },
  { initials: 'SD', name: 'Sofia Davis', email: 'sofia.davis@email.com', amount: '+$39.00' },
];

export var REFERRERS = [
  { name: 'Direct', value: 512 },
  { name: 'Product Hunt', value: 238 },
  { name: 'Twitter', value: 174 },
  { name: 'Blog', value: 104 },
];

export var DEVICES = [
  { name: 'Desktop', value: 74 },
  { name: 'Mobile', value: 22 },
  { name: 'Tablet', value: 4 },
];
