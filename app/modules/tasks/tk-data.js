/* ============================================================
 * tk-data.js — tasks 模块·数据域(选项定义 + 固定种子任务数据)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为最底层数据域,无副作用,
 * 仅导出选项定义、种子生成器与统一转义(红线 13 收敛点)。
 * 方向:data ← cells ← store ← view/events。
 * ============================================================ */
'use strict';

/** 统一转义(shared/escape.js,红线 13) */
export var esc = App.escape.escHtml;

/* ---------- 选项定义(与参考项目一致) ---------- */
export var LABELS = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'documentation', label: 'Documentation' },
];
export var STATUSES = [
  { value: 'backlog', label: 'Backlog', icon: 'circle-help' },
  { value: 'todo', label: 'Todo', icon: 'circle' },
  { value: 'in progress', label: 'In Progress', icon: 'timer' },
  { value: 'done', label: 'Done', icon: 'circle-check' },
  { value: 'canceled', label: 'Canceled', icon: 'circle-off' },
];
export var PRIORITIES = [
  { value: 'low', label: 'Low', icon: 'arrow-down' },
  { value: 'medium', label: 'Medium', icon: 'arrow-right' },
  { value: 'high', label: 'High', icon: 'arrow-up' },
  { value: 'critical', label: 'Critical', icon: 'circle-alert' },
];
export var PAGE_SIZES = [10, 20, 30, 40, 50];

export function byValue(arr, v) {
  for (var i = 0; i < arr.length; i++) if (arr[i].value === v) return arr[i];
  return null;
}

/* ---------- 固定种子任务数据(100 条,每次加载一致) ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(rnd, min, max) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
var WORDS = [
  'implement',
  'design',
  'review',
  'refactor',
  'optimize',
  'document',
  'fix',
  'integrate',
  'migrate',
  'configure',
  'validate',
  'monitor',
  'dashboard',
  'checkout',
  'payment',
  'auth',
  'session',
  'webhook',
  'notification',
  'search',
  'filter',
  'pagination',
  'sidebar',
  'layout',
  'theme',
  'component',
  'table',
  'form',
  'dialog',
  'toast',
  'export',
  'import',
  'endpoint',
  'database',
  'schema',
  'migration',
  'index',
  'caching',
  'rate-limit',
  'logging',
  'error-handling',
  'responsive',
  'accessibility',
  'dark-mode',
  'onboarding',
  'billing',
  'subscription',
  'reporting',
  'analytics',
  'sync',
  'batch',
  'queue',
  'upload',
  'preview',
];
var VERBS = [
  'flow',
  'page',
  'system',
  'module',
  'service',
  'view',
  'pipeline',
  'workflow',
  'API',
  'UX',
  'UI',
  'panel',
  'modal',
  'card',
  'screen',
];

/** 生成 100 条固定种子任务(每次加载一致,与拆分前行为逐字一致) */
export function generateTasks() {
  var rnd = mulberry32(20240817);
  function title() {
    var w = pick(WORDS, rnd);
    var v = pick(VERBS, rnd);
    return w.charAt(0).toUpperCase() + w.slice(1) + ' ' + v + ' #' + int(rnd, 1, 99);
  }
  var tasks = [];
  var usedIds = {};
  for (var i = 0; i < 100; i++) {
    var id;
    do {
      id = 'TASK-' + int(rnd, 1000, 9999);
    } while (usedIds[id]);
    usedIds[id] = true;
    tasks.push({
      id: id,
      title: title(),
      status: pick(STATUSES, rnd).value,
      label: pick(LABELS, rnd).value,
      priority: pick(PRIORITIES, rnd).value,
    });
  }
  return tasks;
}
