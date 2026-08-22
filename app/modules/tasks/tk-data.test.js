import { test } from 'node:test';
import assert from 'node:assert/strict';

/** 副作用导入：escape.js 无 export，加载后经 globalThis.App.escape 暴露 */
import '../../../shared/escape.js';

import { esc, LABELS, STATUSES, PRIORITIES, PAGE_SIZES, byValue, generateTasks } from './tk-data.js';

test('generateTasks: 固定种子生成 100 条任务', () => {
  const tasks = generateTasks();
  assert.equal(tasks.length, 100);
});

test('generateTasks: 确定性——同一种子两次生成逐字一致', () => {
  const a = generateTasks();
  const b = generateTasks();
  assert.deepEqual(a, b);
});

test('generateTasks: 字段值全部落在合法选项内', () => {
  const tasks = generateTasks();
  const statusValues = STATUSES.map((s) => s.value);
  const labelValues = LABELS.map((l) => l.value);
  const prioValues = PRIORITIES.map((p) => p.value);
  for (const t of tasks) {
    assert.match(t.id, /^TASK-\d{4}$/);
    assert.ok(t.title.length > 0);
    assert.ok(statusValues.includes(t.status), `非法 status: ${t.status}`);
    assert.ok(labelValues.includes(t.label), `非法 label: ${t.label}`);
    assert.ok(prioValues.includes(t.priority), `非法 priority: ${t.priority}`);
  }
});

test('generateTasks: 任务 ID 不重复', () => {
  const tasks = generateTasks();
  const ids = new Set(tasks.map((t) => t.id));
  assert.equal(ids.size, tasks.length);
});

test('byValue: 按 value 查找选项,未命中返回 null', () => {
  assert.equal(byValue(STATUSES, 'done').label, 'Done');
  assert.equal(byValue(STATUSES, 'nope'), null);
  assert.equal(byValue(PRIORITIES, 'high').label, 'High');
});

test('esc: 统一转义收敛点来自 shared/escape.js', () => {
  assert.equal(esc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('PAGE_SIZES: 与 data-table 分页选项一致', () => {
  assert.deepEqual(PAGE_SIZES, [10, 20, 30, 40, 50]);
});
