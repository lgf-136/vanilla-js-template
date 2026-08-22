/* ============================================================
 * json.js — Node 风格 HTTP JSON 工具(零第三方依赖)
 * ------------------------------------------------------------
 * sendJson / readBody 只面向 Node 的 http req/res 风格
 * (dev-server.js、Vercel 函数、Deno 经 makeNodeReq/makeNodeRes 适配)。
 * Cloudflare Worker 使用原生 Response,不经过本模块。
 * ============================================================ */
'use strict';

const { SECURITY_HEADERS } = require('./headers');

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(
    status,
    Object.assign(
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      SECURITY_HEADERS
    )
  );
  res.end(body);
}

const MAX_BODY_BYTES = 1e6;

function readBody(req) {
  return new Promise((resolve, reject) => {
    // content-length 预检:超限直接拒绝,不消费请求体
    const declared = req.headers && req.headers['content-length'];
    if (declared && Number(declared) > MAX_BODY_BYTES) {
      if (typeof req.destroy === 'function') {
        try {
          req.destroy();
        } catch (e) {}
      }
      reject(new Error('body too large'));
      return;
    }
    let data = '';
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    req.on('data', (c) => {
      if (settled) return; // 超限后不再累积,避免内存无界增长
      data += c;
      if (data.length > MAX_BODY_BYTES) {
        settled = true;
        if (typeof req.destroy === 'function') {
          try {
            req.destroy(); // 主动终止底层流,停止消费
          } catch (e) {}
        }
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', fail);
  });
}

module.exports = { sendJson, readBody };
