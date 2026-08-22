'use strict';

const { getDb, SCHEMA } = require('./db');
const { encrypt, decrypt } = require('./core/security');
const { verifyPassword } = require('./core/auth');
const { createApiHandler } = require('./core/api');

let runtimePromise = null;

function makeNodeRequest(request) {
  const headers = Object.fromEntries(request.headers.entries());
  const listeners = { data: [], end: [], error: [] };
  // socket.remoteAddress 仅在 Node 直连时由 node.entry.js 注入真实 TCP 对端 IP
  // (__realRemoteAddress);serverless 形态不伪造,由 clientIp 按 cf-connecting-ip /
  // x-forwarded-for 末位解析,防止客户端可控的 x-forwarded-for 首值绕过 IP 限流。
  const nodeRequest = {
    method: request.method,
    headers,
    url: request.url,
    socket: { remoteAddress: request.__realRemoteAddress },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      return nodeRequest;
    },
  };

  // Delay body consumption until the route handler has attached its data/end
  // listeners; otherwise a fast Request can resolve before readBody subscribes.
  setImmediate(() => {
    readCappedBody(request)
      .then((body) => {
        if (body) listeners.data.forEach((callback) => callback(body));
        listeners.end.forEach((callback) => callback());
      })
      .catch((error) => listeners.error.forEach((callback) => callback(error)));
  });

  return nodeRequest;
}

/** 请求体大小上限(与 readBody 一致,防止超大请求体被整段读入内存) */
const MAX_BODY_BYTES = 1e6;

/**
 * 以流方式读取请求体并限制大小:超过上限即 cancel 底层流、
 * 停止消费并 reject,避免超大请求体被 request.text() 整段缓冲。
 * 兼容 Cloudflare / Deno / Vercel 原生 Request(不依赖 Buffer)。
 */
function readCappedBody(request) {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return Promise.reject(new Error('body too large'));
  }
  const stream = request.body;
  if (!stream) return Promise.resolve('');
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  return new Promise((resolve, reject) => {
    function pump() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            resolve(text + decoder.decode());
            return;
          }
          size += value.length;
          if (size > MAX_BODY_BYTES) {
            reader.cancel().catch(() => {}); // 停止消费,释放底层流
            reject(new Error('body too large'));
            return;
          }
          text += decoder.decode(value, { stream: true });
          pump();
        })
        .catch(reject);
    }
    pump();
  });
}

function makeNodeResponse() {
  let status = 200;
  let headers = {};
  let stream = null; // 首个 writeHead 时惰性创建,写入期间持续对外可读(SSE 流式)
  let controller = null;
  let encoder = new TextEncoder();
  let ended = false;
  return {
    writeHead(nextStatus, nextHeaders) {
      status = nextStatus;
      headers = { ...headers, ...(nextHeaders || {}) };
      this.statusCode = nextStatus;
      this.headersSent = true;
      if (!stream) {
        stream = new ReadableStream({
          start(c) {
            controller = c;
          },
          cancel() {
            ended = true;
          },
        });
      }
    },
    /** 流式写块(SSE 等):适配器实时透传给客户端,不等整段响应完成 */
    write(chunk) {
      if (chunk == null) return;
      if (!stream) this.writeHead(status, headers);
      if (ended || !controller) return;
      try {
        controller.enqueue(encoder.encode(String(chunk)));
      } catch (e) {
        /* 流已关闭 */
      }
    },
    end(nextBody) {
      if (nextBody != null) this.write(nextBody);
      if (ended) return;
      ended = true;
      if (controller) {
        try {
          controller.close();
        } catch (e) {
          /* 流已关闭 */
        }
      }
    },
    statusCode: status,
    headersSent: false,
    toResponse() {
      return new Response(stream || '', { status, headers });
    },
  };
}

async function getRuntime(env = process.env) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const db = getDb(env);
      if (typeof db.initSchema === 'function') await db.initSchema(SCHEMA);
      const handler = createApiHandler({
        db,
        encrypt: (value) => encrypt(value, env),
        decrypt: (value) => decrypt(value, env),
        verifyPassword: (password) => verifyPassword(password, env),
      });
      return { db, handler };
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

/** 统一平台入口：API Request → Response；静态资源由平台适配器处理。 */
async function handleRequest(request, env = process.env) {
  const { handler } = await getRuntime(env);
  const url = new URL(request.url);
  const nodeRequest = makeNodeRequest(request);
  const nodeResponse = makeNodeResponse();
  await handler(nodeRequest, nodeResponse, url.pathname);
  return nodeResponse.toResponse();
}

async function createApp(env = process.env) {
  const runtime = await getRuntime(env);
  return { ...runtime, env, handleRequest: (request) => handleRequest(request, env) };
}

module.exports = { createApp, getOrCreateApp: createApp, handleRequest };
