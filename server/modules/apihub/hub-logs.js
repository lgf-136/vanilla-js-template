/* ============================================================
 * hub-logs.js — 请求访问日志写入器(自 service.js 拆出,红线 12)
 * ------------------------------------------------------------
 * 热路径每请求零阻塞 DB 往返:日志先入内存队列,满批立即落库,
 * 否则最多滞留 LOG_FLUSH_MS;清理 DELETE 降频为每 LOG_CLEANUP_EVERY
 * 条一次;工作空间优先取 loadAll 的 TTL 缓存(handleApi 每请求已预热)。
 * 进程退出时未刷盘的队列最多丢 500ms 日志(可接受,换取热路径零开销)。
 *
 * 依赖注入:{ db, ensureMigrated, resolveWorkspace, getCachedWs }。
 * ============================================================ */
'use strict';

const { normalizeLogEntry, DEFAULT_LOGGING } = require('./hub-shared');

function createLogWriter(deps) {
  const { db, ensureMigrated, resolveWorkspace, getCachedWs } = deps;
  const LOG_FLUSH_MS = 500;
  const LOG_FLUSH_BATCH = 20;
  const LOG_CLEANUP_EVERY = 100;
  let logQueue = [];
  let logFlushTimer = null;
  let logWritesSinceCleanup = 0;

  /** 落库当前队列:批量 INSERT;每满 LOG_CLEANUP_EVERY 条执行一次降频清理 */
  async function flushLogs() {
    if (logFlushTimer) {
      clearTimeout(logFlushTimer);
      logFlushTimer = null;
    }
    const batch = logQueue;
    logQueue = [];
    if (!batch.length) return;
    try {
      await ensureMigrated();
      const ws = getCachedWs() || (await resolveWorkspace());
      const statements = batch.map(function (item) {
        return {
          sql: 'INSERT INTO apihub_logs (workspace_id, method, path, status, ts, ip, ua, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          params: [
            ws,
            item.clean.method,
            item.clean.path,
            item.clean.status,
            item.clean.ts,
            item.clean.ip,
            item.clean.ua,
            item.clean.ms,
          ],
        };
      });
      if (typeof db.batch === 'function') await db.batch(statements);
      else {
        for (const s of statements) await db.run(s.sql, s.params);
      }
      logWritesSinceCleanup += batch.length;
      if (logWritesSinceCleanup >= LOG_CLEANUP_EVERY) {
        logWritesSinceCleanup = 0;
        const logging = batch[batch.length - 1].logging;
        const cutoff = Date.now() - (Number(logging.retentionDays) || 7) * 86400000;
        const maxLogs = Number(logging.maxLogs) || 500;
        await db.run(
          'DELETE FROM apihub_logs WHERE workspace_id = ? AND (ts < ? OR id NOT IN (SELECT id FROM apihub_logs WHERE workspace_id = ? ORDER BY ts DESC LIMIT ?))',
          [ws, cutoff, ws, maxLogs]
        );
      }
    } catch (e) {
      /* 日志落库失败静默忽略,绝不影响请求本身 */
    }
  }

  /** 追加一条请求访问日志:入内存队列,批量异步落库 */
  function appendLog(entry, cfg) {
    const clean = normalizeLogEntry(entry);
    if (!clean) return;
    const logging = (cfg && cfg.logging) || DEFAULT_LOGGING;
    logQueue.push({ clean, logging });
    if (logQueue.length >= LOG_FLUSH_BATCH) {
      flushLogs();
      return;
    }
    if (!logFlushTimer) {
      logFlushTimer = setTimeout(function () {
        logFlushTimer = null;
        flushLogs();
      }, LOG_FLUSH_MS);
      if (logFlushTimer.unref) logFlushTimer.unref();
    }
  }

  /** 读请求访问日志(按工作空间过滤 + 保留天数 + 条数上限,倒序返回) */
  async function loadLogs(cfg) {
    await flushLogs(); // 先落库待写日志,保证读到的日志包含最新请求
    await ensureMigrated();
    const logging = (cfg && cfg.logging) || DEFAULT_LOGGING;
    const ws = getCachedWs() || (await resolveWorkspace());
    const cutoff = Date.now() - (Number(logging.retentionDays) || 7) * 86400000;
    const rows = await db.query(
      'SELECT method, path, status, ts, ip, ua, ms FROM apihub_logs WHERE workspace_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?',
      [ws, cutoff, Number(logging.maxLogs) || 500]
    );
    return (rows || []).map(normalizeLogEntry).filter(Boolean);
  }

  /** 清空请求访问日志(当前工作空间) */
  async function clearLogs() {
    await ensureMigrated();
    const ws = getCachedWs() || (await resolveWorkspace());
    await db.run('DELETE FROM apihub_logs WHERE workspace_id = ?', [ws]);
    return [];
  }

  return { appendLog, flushLogs, loadLogs, clearLogs };
}

module.exports = { createLogWriter };
