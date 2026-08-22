/* ============================================================
 * routes.js — Chats 模块 API 路由(薄路由,AGENTS §6)
 * ------------------------------------------------------------
 *   GET    /api/chat/state            配置 + 密钥 + 会话列表
 *   PUT    /api/chat/config           保存配置与密钥(密钥加密落库)
 *   GET    /api/chat/conversations    ?id= 取单个含消息,否则列表元数据
 *   POST   /api/chat/conversations    upsert 新建/更新
 *   PUT    /api/chat/conversations    upsert(与 POST 同语义)
 *   DELETE /api/chat/conversations    { ids } 批量删除
 *   GET    /api/chat/providers        内置供应商目录
 *   POST   /api/chat/models           { providerId } 拉模型列表
 *   POST   /api/chat/mcp/tools        拉取 MCP 工具列表(按名称合并由前端做)
 *   POST   /api/chat/stream           SSE 流式补全(支持 Last-Event-ID 续传)
 *
 * 本文件只做参数校验、状态码映射与调用 service;SQL/加解密在
 * service/stream 层。除流式接口外统一 JSON 响应;stream 输出 SSE。
 * 所有接口默认经过 server/core/api.js 的会话门禁(x-auth-token)。
 * ============================================================ */
'use strict';

const { sendJson, readBody } = require('../../core/http/json');
const { getHeader } = require('./chat-shared');
const { createChatService } = require('./chat-service');
const { handleStream } = require('./chat-stream');

function chatRoutes(ctx) {
  const service = createChatService(ctx);

  function sendError(res, e) {
    return sendJson(res, e && e.status ? e.status : 500, {
      error: (e && e.code) || 'internal_error',
      message: String((e && e.message) || e),
    });
  }

  async function readJsonBody(req) {
    try {
      return await readBody(req);
    } catch (e) {
      throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400, code: 'bad_json' });
    }
  }

  /** 读 body(stream 用:流式接口错误以 SSE error 事件返回) */
  async function readStreamBody(req) {
    try {
      return await readBody(req);
    } catch (e) {
      throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400, code: 'bad_json' });
    }
  }

  async function getState(req, res) {
    try {
      const { config, secrets, ws } = await service.loadAll(true);
      const conversations = await service.listConversations();
      return sendJson(res, 200, {
        config: config,
        secrets: secrets,
        workspace: ws,
        conversations: conversations,
      });
    } catch (e) {
      return sendError(res, e);
    }
  }

  async function putConfig(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return sendError(res, e);
    }
    try {
      const saved = await service.saveAll(body);
      return sendJson(res, 200, { ok: true, config: saved.config, secrets: saved.secrets });
    } catch (e) {
      return sendError(res, e);
    }
  }

  async function getConversations(req, res) {
    try {
      let id = '';
      try {
        id = new URL(req.url || '/', 'http://localhost').searchParams.get('id') || '';
      } catch (e) {
        id = '';
      }
      if (id) {
        return sendJson(res, 200, await service.getConversation(id));
      }
      return sendJson(res, 200, { conversations: await service.listConversations() });
    } catch (e) {
      return sendError(res, e);
    }
  }

  async function upsertConversation(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return sendError(res, e);
    }
    try {
      const saved = await service.upsertConversation(body || {});
      return sendJson(res, 200, { ok: true, conversation: saved });
    } catch (e) {
      return sendError(res, e);
    }
  }

  async function deleteConversations(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return sendError(res, e);
    }
    try {
      const out = await service.deleteConversations(body && body.ids);
      return sendJson(res, 200, { ok: true, removed: out.removed });
    } catch (e) {
      return sendError(res, e);
    }
  }

  async function getProviders(req, res) {
    return sendJson(res, 200, { providers: service.providerCatalog() });
  }

  async function postModels(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return sendError(res, e);
    }
    try {
      const out = await service.fetchModels(body && body.providerId);
      return sendJson(res, 200, out);
    } catch (e) {
      return sendError(res, e);
    }
  }

  async function postMcpTools(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return sendError(res, e);
    }
    try {
      const out = await service.fetchMcpTools(body || {});
      return sendJson(res, 200, out);
    } catch (e) {
      return sendError(res, e);
    }
  }

  /** SSE 流式补全:支持 Last-Event-ID 断点续传 */
  async function postStream(req, res) {
    let body;
    try {
      body = await readStreamBody(req);
    } catch (e) {
      // 读体失败 → 以 SSE 错误事件返回
      res.writeHead(400, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' });
      res.write('data: ' + JSON.stringify({ type: 'error', code: 'bad_json', message: '请求体不是合法 JSON' }) + '\n\n');
      res.end();
      return;
    }
    const lastEventId = getHeader(req, 'last-event-id');
    // 每次流式请求强制刷新配置缓存,保证密钥/开关即时生效
    await service.loadAll(true);
    try {
      await handleStream({
        req: req,
        res: res,
        body: body || {},
        lastEventId: lastEventId,
        service: service,
      });
    } catch (e) {
      try {
        res.write('data: ' + JSON.stringify({ type: 'error', code: 'internal_error', message: String((e && e.message) || e) }) + '\n\n');
        res.end();
      } catch (e2) {
        /* noop */
      }
    }
  }

  return [
    { method: 'GET', path: '/api/chat/state', desc: '读取 Chats 配置/密钥/会话列表', handler: getState },
    { method: 'PUT', path: '/api/chat/config', desc: '保存 Chats 配置与密钥(密钥加密落库)', handler: putConfig },
    { method: 'GET', path: '/api/chat/conversations', desc: '会话列表(元数据)或单会话(含消息,?id=)', handler: getConversations },
    { method: 'POST', path: '/api/chat/conversations', desc: 'upsert 会话(新建/更新)', handler: upsertConversation },
    { method: 'PUT', path: '/api/chat/conversations', desc: 'upsert 会话(与 POST 同语义)', handler: upsertConversation },
    { method: 'DELETE', path: '/api/chat/conversations', desc: '批量删除会话({ ids })', handler: deleteConversations },
    { method: 'GET', path: '/api/chat/providers', desc: '内置供应商目录', handler: getProviders },
    { method: 'POST', path: '/api/chat/models', desc: '拉取供应商模型列表', handler: postModels },
    { method: 'POST', path: '/api/chat/mcp/tools', desc: '拉取 MCP 服务器工具列表', handler: postMcpTools },
    { method: 'POST', path: '/api/chat/stream', desc: 'SSE 流式补全(支持 Last-Event-ID 续传)', handler: postStream },
  ];
}

module.exports = chatRoutes;
