'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createLogWriter } = require('./hub-logs');

function fakeDb() {
  const runs = [];
  const queries = [];
  return {
    runs,
    queries,
    async run(sql, params) {
      runs.push({ sql, params });
      return { changes: 1 };
    },
    async query(sql, params) {
      queries.push({ sql, params });
      return [];
    },
  };
}

function makeWriter(db, opts) {
  return createLogWriter({
    db,
    ensureMigrated: async () => {},
    resolveWorkspace: async () => 'ws-test',
    getCachedWs: () => (opts && opts.cachedWs) || null,
  });
}

const ENTRY = { method: 'GET', path: '/v1/x', status: 200, ts: Date.now(), ip: '1.2.3.4', ua: 'curl/8', ms: 5 };
const CFG = { logging: { maxLogs: 10, retentionDays: 7 } };

test('日志入队不落库(热路径零 DB),满批后批量落库', async () => {
  const db = fakeDb();
  const w = makeWriter(db, { cachedWs: 'ws-test' });
  // 未满批:仅 1 条入队,不应有任何 DB 写
  w.appendLog(ENTRY, CFG);
  assert.equal(db.runs.length, 0);
  // 凑满 20 条触发批量落库(异步)
  for (let i = 0; i < 19; i++) w.appendLog(ENTRY, CFG);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(db.runs.length, 20);
  // 每条 INSERT 都带工作空间
  assert.equal(db.runs.every((r) => r.params[0] === 'ws-test'), true);
  // 20 条 < 100 清理阈值:不应出现清理 DELETE
  assert.equal(db.runs.some((r) => r.sql.includes('DELETE FROM apihub_logs')), false);
});

test('超过清理阈值后执行降频清理 DELETE', async () => {
  const db = fakeDb();
  const w = makeWriter(db, { cachedWs: 'ws-test' });
  for (let i = 0; i < 100; i++) w.appendLog(ENTRY, CFG);
  await new Promise((r) => setTimeout(r, 50));
  const deletes = db.runs.filter((r) => r.sql.includes('DELETE FROM apihub_logs'));
  // 100 条 → 第 100 条起触发一次清理
  assert.equal(deletes.length, 1);
  assert.equal(db.runs.length, 101); // 100 INSERT + 1 清理
});

test('loadLogs 先刷盘待写日志,再查询', async () => {
  const db = fakeDb();
  const w = makeWriter(db, { cachedWs: 'ws-test' });
  w.appendLog(ENTRY, CFG);
  await w.loadLogs(CFG);
  assert.equal(db.runs.length, 1, '读取前应先把待写日志落库');
  assert.equal(db.queries.length, 1);
});

test('无效日志条目被忽略', async () => {
  const db = fakeDb();
  const w = makeWriter(db, { cachedWs: 'ws-test' });
  w.appendLog({ method: 'NOPE', path: '', status: 999, ts: -1 }, CFG);
  w.appendLog(null, CFG);
  w.appendLog('str', CFG);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(db.runs.length, 0);
});
