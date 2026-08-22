/* ============================================================
 * client-ip.js — 可信客户端 IP 提取(纯函数,Node / Worker 共用)
 * ------------------------------------------------------------
 * 信任模型(按优先级):
 *   1. Node 直连:req.socket.remoteAddress 为真实 TCP 对端,不可伪造
 *      (仅在 server/adapters/node.entry.js 的直连监听中由 __realRemoteAddress 注入);
 *   2. Cloudflare:cf-connecting-ip 由 CF 边缘注入,可信;
 *   3. 其它 serverless(vercel / deno deploy):x-forwarded-for 由平台在
 *      末尾追加真实 IP,因此取最后一个值。
 * 禁止直接取 x-forwarded-for 首值——该位置由客户端可控,取首值即可
 * 伪造任意 IP 绕过登录限流 / 日志归属。
 * ============================================================ */
'use strict';

function getHeader(req, name) {
  if (!req) return null;
  if (typeof req.headers.get === 'function') return req.headers.get(name);
  if (req.headers) {
    const v = req.headers[name.toLowerCase()];
    return v === undefined ? req.headers[name] : v;
  }
  return null;
}

/** 取 x-forwarded-for 最后一个非空值(平台追加的真实 IP);无则返回 null */
function lastXff(req) {
  const fwd = getHeader(req, 'x-forwarded-for');
  if (typeof fwd !== 'string' || !fwd) return null;
  const parts = fwd
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

/**
 * 从 Node req / Worker Request 提取可信客户端 IP。
 * @param {object} req  Node req 或 Web Request(兼容两者形态)
 * @param {string} [fallback] 无任何可信来源时的兜底值(默认 '')
 */
function clientIp(req, fallback) {
  if (req && req.socket && req.socket.remoteAddress && req.socket.remoteAddress !== 'request') {
    return String(req.socket.remoteAddress);
  }
  const cf = getHeader(req, 'cf-connecting-ip');
  if (typeof cf === 'string' && cf) return cf;
  const last = lastXff(req);
  if (last) return last;
  return fallback === undefined ? '' : fallback;
}

module.exports = { clientIp, lastXff };
