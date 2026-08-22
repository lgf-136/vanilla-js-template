'use strict';

const { handleRequest } = require('../app');
const { toWebRequest } = require('./node.entry');

module.exports = async function vercelHandler(req, res) {
  try {
    const response = await handleRequest(toWebRequest(req), process.env);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (req.method === 'HEAD') return res.end();
    const body = response.body;
    // 流式响应(SSE):Node Functions 直接透传块,避免整段缓冲丢失实时性
    if (body && typeof body.getReader === 'function') {
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    }
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'internal', message: '服务器内部错误' }));
    } else {
      res.end();
    }
    console.error('[vercel] API 处理失败:', error);
  }
};
