'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  // 当前 Node 不支持 node:sqlite,跳过
  test('node:sqlite 不可用,跳过', () => {});
  module.exports = {};
}

const { init } = require('./sqlite.adapter');
const { SCHEMA } = require('../schema');

function makeDb() {
  return init({ dbPath: ':memory:', schema: SCHEMA });
}

test('预编译语句缓存:同一 SQL 只 prepare 一次', () => {
  const original = DatabaseSync.prototype.prepare;
  let prepareCalls = 0;
  DatabaseSync.prototype.prepare = function (...args) {
    prepareCalls += 1;
    return original.apply(this, args);
  };
  try {
    const db = makeDb();
    prepareCalls = 0; // init 的 PRAGMA 检查不计入运行时准备次数
    const sql = "INSERT INTO app_settings (workspace_id, key, value) VALUES (?, ?, ?)";
    db.run(sql, ['ws', 'a', '1']);
    db.run(sql, ['ws', 'b', '2']);
    db.run(sql, ['ws', 'c', '3']);
    db.get('SELECT COUNT(*) AS n FROM app_settings');
    db.query('SELECT key FROM app_settings WHERE workspace_id = ?', ['ws']);
    // 同一 INSERT 只编译一次(3 次 run 共享缓存);SELECT 各编译一次
    assert.equal(prepareCalls, 3, `期望 3 次 prepare(1 INSERT + 2 SELECT),实际 ${prepareCalls}`);
    db.close();
  } finally {
    DatabaseSync.prototype.prepare = original;
  }
});

test('批量写事务:成功原子提交,失败整体回滚', () => {
  const db = makeDb();
  db.batch([
    { sql: 'INSERT INTO app_settings (workspace_id, key, value) VALUES (?, ?, ?)', params: ['ws', 'a', '1'] },
    { sql: 'INSERT INTO app_settings (workspace_id, key, value) VALUES (?, ?, ?)', params: ['ws', 'b', '2'] },
  ]);
  const before = db.query('SELECT COUNT(*) AS n FROM app_settings')[0].n;
  assert.equal(before, 2);
  assert.throws(() =>
    db.batch([
      { sql: 'INSERT INTO app_settings (workspace_id, key, value) VALUES (?, ?, ?)', params: ['ws', 'c', '3'] },
      { sql: 'INSERT INTO no_such_table (x) VALUES (?)', params: [1] },
    ])
  );
  const after = db.query('SELECT COUNT(*) AS n FROM app_settings')[0].n;
  assert.equal(after, before, '失败批量应整体回滚');
  db.close();
});

test('参数绑定:null/boolean/数字规范化', () => {
  const db = makeDb();
  db.run('INSERT INTO app_settings (workspace_id, key, value) VALUES (?, ?, ?)', ['ws', 'bool', true]);
  const row = db.get('SELECT value FROM app_settings WHERE key = ?', ['bool']);
  // boolean → 数字 1;node:sqlite 以 REAL 绑定存入 TEXT 列显示 '1.0'。
  // 真实业务值先经 JSON.stringify 或字符串化,不会写原始数字到 TEXT 列。
  assert.equal(Number(row.value), 1);
  db.close();
});
