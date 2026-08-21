/* ============================================================
 * routes.js — Chats 模块管理路由(薄层)
 * ------------------------------------------------------------
 * 所有 /api/chats/* 默认会话鉴权(server/core/api.js 强制)。
 * 路由只做参数读取与状态码,业务在 service.js(数据)/ ai.js(大模型)。
 *
 * GET    /api/chats/state                侧栏 + 配置面板全量数据
 * POST   /api/chats/conversations        新建会话
 * GET    /api/chats/conversations/:id    会话详情
 * GET    /api/chats/conversations/:id/messages  消息列表
 * PUT    /api/chats/conversations/:id    更新会话(收藏/置顶/归档/标题/分组/标签…)
 * DELETE /api/chats/conversations/:id    删除会话(级联删消息)
 * POST   /api/chats/conversations/:id/messages  新增消息
 * PUT    /api/chats/messages/:id         更新消息(编辑正文/反馈)
 * POST   /api/chats/messages/truncate    删除某消息之后的内容(编辑后重生成)
 * DELETE /api/chats/messages/:id         删除单条消息(级联删除其后)
 * POST   /api/chats/chat                 SSE 流式对话
 * POST   /api/chats/models               自动获取供应商模型列表
 * POST   /api/chats/providers            新增/更新供应商(key upsert)
 * DELETE /api/chats/providers?key=       删除供应商
 * POST   /api/chats/prompts              新增提示词
 * PUT    /api/chats/prompts/:id          更新提示词
 * DELETE /api/chats/prompts/:id          删除提示词
 * PUT    /api/chats/groups               分组整表替换
 * PUT    /api/chats/tags                 标签整表替换
 * POST   /api/chats/mcp                  新增/更新 MCP(带 id 为更新)
 * POST   /api/chats/mcp/test             测试 MCP 连接并抓取工具
 * DELETE /api/chats/mcp?key=id           删除 MCP
 * PUT    /api/chats/prefs                保存用户偏好
 * ============================================================ */
'use strict';

const { sendJson, readBody } = require('../../core/http/json');
const { createService } = require('./service');
const AI = require('./ai');

function parseJson(text, fallback) {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

/** 写 SSE 事件:event: <type>\ndata: <json>\n\n */
function writeSse(res, type, data) {
  res.write('event: ' + type + '\ndata: ' + safeJson(data) + '\n\n');
}

function safeJson(v) {
  try {
    return JSON.stringify(v === undefined ? null : v);
  } catch (e) {
    return '"[unserializable]"';
  }
}

function chatsRoutes(deps) {
  const svc = createService(Object.assign({}, deps));
  const { db, decrypt } = deps;

  const fail = (res, status, code, msg) => sendJson(res, status, { error: code, message: msg });

  async function state(req, res) {
    try {
      const ws = await svc.resolveWorkspace();
      const data = await svc.loadState(ws);
      return sendJson(res, 200, Object.assign({ ok: true }, data));
    } catch (e) {
      return fail(res, 500, 'state_failed', (e && e.message) || String(e));
    }
  }

  async function createConversation(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const conv = await svc.createConversation(ws, body || {});
      return sendJson(res, 200, { ok: true, conversation: conv });
    } catch (e) {
      return fail(res, 400, 'bad_conversation', (e && e.message) || String(e));
    }
  }

  async function getConversation(req, res, ctx) {
    try {
      const ws = await svc.resolveWorkspace();
      const conv = await svc.getConversation(ws, (ctx && ctx.params && ctx.params.id) || '');
      if (!conv) return fail(res, 404, 'not_found', '会话不存在');
      return sendJson(res, 200, { ok: true, conversation: conv });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function messages(req, res, ctx) {
    try {
      const ws = await svc.resolveWorkspace();
      const rows = await svc.listMessages(ws, (ctx && ctx.params && ctx.params.id) || '');
      if (rows === null) return fail(res, 404, 'not_found', '会话不存在');
      return sendJson(res, 200, { ok: true, messages: rows });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function updateConversation(req, res, ctx) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const conv = await svc.updateConversation(ws, (ctx && ctx.params && ctx.params.id) || '', body || {});
      if (!conv) return fail(res, 404, 'not_found', '会话不存在');
      return sendJson(res, 200, { ok: true, conversation: conv });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function deleteConversation(req, res, ctx) {
    try {
      const ws = await svc.resolveWorkspace();
      await svc.deleteConversation(ws, (ctx && ctx.params && ctx.params.id) || '');
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function addMessage(req, res, ctx) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const msg = await svc.addMessage(ws, (ctx && ctx.params && ctx.params.id) || '', body || {});
      if (!msg) return fail(res, 404, 'not_found', '会话不存在');
      return sendJson(res, 200, { ok: true, message: msg });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function updateMessage(req, res, ctx) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const msg = await svc.updateMessage(ws, Number((ctx && ctx.params && ctx.params.id) || 0), body || {});
      if (!msg) return fail(res, 404, 'not_found', '消息不存在');
      return sendJson(res, 200, { ok: true, message: msg });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function truncate(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const outcome = await svc.truncateAfter(ws, Number(body && body.messageId));
      return sendJson(res, 200, outcome);
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function deleteMessage(req, res, ctx) {
    try {
      const ws = await svc.resolveWorkspace();
      const outcome = await svc.deleteMessage(ws, Number((ctx && ctx.params && ctx.params.id) || 0));
      return sendJson(res, outcome.ok ? 200 : 404, outcome);
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  /** SSE 流式对话(核心) */
  async function chat(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const emit = (type, data) => writeSse(res, type, data);
    try {
      const ws = await svc.resolveWorkspace();
      if (body && body.conversationId) emit('meta', { conversationId: body.conversationId });
      const result = await AI.runChat({ db, decrypt, ws }, body || {}, emit);
      emit('done', { messageId: result.messageId, usage: result.usage || null });
      res.end();
    } catch (e) {
      // 已开始流式输出 → error 事件收尾;未开始则退化 JSON
      const msg = (e && e.message) || String(e);
      try {
        emit('error', { message: msg });
        res.end();
      } catch (e2) {
        fail(res, 500, 'chat_failed', msg);
      }
    }
  }

  /** 自动获取模型列表(供应商 key 已入库用库内 key;否则用请求体的临时 key) */
  async function models(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      let provider = null;
      if (body && body.key) {
        const row = await db.get('SELECT * FROM chats_providers WHERE key = ? AND workspace_id = ?', [body.key, ws]);
        if (row) {
          provider = {
            type: row.type,
            baseUrl: row.base_url,
            apiKey: row.api_key ? decrypt(row.api_key) || '' : '',
          };
        }
      }
      if (!provider) {
        const cat = AI.catalog(body && (body.key || body.name || ''));
        provider = {
          type: (body && body.type) || (cat && cat.type) || 'openai',
          baseUrl: (body && body.baseUrl) || (cat && cat.baseUrl) || '',
          apiKey: (body && body.apiKey) || '',
        };
      }
      if (!provider.baseUrl) throw new Error('缺少 baseUrl,无法获取模型');
      const models = await AI.fetchModels(provider, body && body.apiKey ? body.apiKey : undefined);
      if (body && body.key) {
        await svc.saveProviderModels(ws, body.key, models);
      }
      return sendJson(res, 200, { ok: true, models });
    } catch (e) {
      return fail(res, 400, 'models_failed', (e && e.message) || String(e));
    }
  }

  async function upsertProvider(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const provider = await svc.saveProvider(ws, body || {});
      return sendJson(res, 200, { ok: true, provider });
    } catch (e) {
      return fail(res, 400, 'bad_provider', (e && e.message) || String(e));
    }
  }

  async function deleteProvider(req, res) {
    try {
      const ws = await svc.resolveWorkspace();
      const id = new URL(req.url || '/', 'http://localhost').searchParams.get('key') || '';
      const row = await db.get('SELECT id FROM chats_providers WHERE key = ? AND workspace_id = ?', [id, ws]);
      if (!row) return fail(res, 404, 'not_found', '供应商不存在');
      await svc.deleteProvider(ws, row.id);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function createPrompt(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const name = String((body && body.name) || '').trim().slice(0, 40);
      const content = String((body && body.content) || '').trim();
      const category = String((body && body.category) || '').trim().slice(0, 20);
      if (!name || !content) return fail(res, 400, 'bad_prompt', '需要名称与内容');
      const id = 'pr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      const sort = body && body.sort != null ? Math.floor(Number(body.sort) || 0) : 0;
      await db.run(
        'INSERT INTO chats_prompts (id, workspace_id, name, category, content, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, ws, name, category, content, sort, new Date().toISOString(), new Date().toISOString()]
      );
      return sendJson(res, 200, { ok: true, prompt: { id, name, category, content, sort } });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function updatePrompt(req, res, ctx) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const id = (ctx && ctx.params && ctx.params.id) || '';
      const row = await db.get('SELECT * FROM chats_prompts WHERE id = ? AND workspace_id = ?', [id, ws]);
      if (!row) return fail(res, 404, 'not_found', '提示词不存在');
      const name = body && body.name !== undefined ? String(body.name).trim().slice(0, 40) : row.name;
      const content = body && body.content !== undefined ? String(body.content).trim() : row.content;
      const category = body && body.category !== undefined ? String(body.category).trim().slice(0, 20) : row.category;
      const sort = body && body.sort !== undefined ? Math.floor(Number(body.sort) || 0) : Number(row.sort) || 0;
      if (!name || !content) return fail(res, 400, 'bad_prompt', '需要名称与内容');
      await db.run('UPDATE chats_prompts SET name = ?, category = ?, content = ?, sort = ?, updated_at = ? WHERE id = ? AND workspace_id = ?', [name, category, content, sort, new Date().toISOString(), id, ws]);
      return sendJson(res, 200, { ok: true, prompt: { id, name, category, content, sort } });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function deletePrompt(req, res, ctx) {
    try {
      const ws = await svc.resolveWorkspace();
      const id = (ctx && ctx.params && ctx.params.id) || '';
      await db.run('DELETE FROM chats_prompts WHERE id = ? AND workspace_id = ?', [id, ws]);
      // 会话的 prompt_id 复位
      await db.run('UPDATE chats_conversations SET prompt_id = ? WHERE prompt_id = ? AND workspace_id = ?', ['', id, ws]);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function saveGroups(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const groups = await svc.saveGroups(ws, (body && body.groups) || []);
      return sendJson(res, 200, { ok: true, groups });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function saveTags(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const tags = await svc.saveTags(ws, (body && body.tags) || []);
      return sendJson(res, 200, { ok: true, tags });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function upsertMcp(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const id = body && body.id ? String(body.id) : null;
      const mcp = await svc.saveMcp(ws, id, body || {});
      return sendJson(res, 200, { ok: true, mcp });
    } catch (e) {
      return fail(res, 400, 'bad_mcp', (e && e.message) || String(e));
    }
  }

  async function testMcp(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const result = await svc.testMcp(ws, body || {});
      return sendJson(res, 200, Object.assign({ ok: true }, result));
    } catch (e) {
      return fail(res, 400, 'mcp_test_failed', (e && e.message) || String(e));
    }
  }

  async function deleteMcp(req, res) {
    try {
      const ws = await svc.resolveWorkspace();
      const id = new URL(req.url || '/', 'http://localhost').searchParams.get('key') || '';
      await svc.deleteMcp(ws, id);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  async function savePrefs(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const ws = await svc.resolveWorkspace();
      const prefs = await svc.savePrefs(ws, (body && body.prefs) || {});
      return sendJson(res, 200, { ok: true, prefs });
    } catch (e) {
      return fail(res, 500, 'failed', (e && e.message) || String(e));
    }
  }

  /** 远程 URL 抓取(插入远程图片/文件附件) */
  async function fetchUrl(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return fail(res, 400, 'bad_json', '请求体必须是 JSON');
    }
    try {
      const result = await svc.fetchUrl(null, body || {});
      return sendJson(res, 200, Object.assign({ ok: true }, result));
    } catch (e) {
      return fail(res, 400, 'fetch_failed', (e && e.message) || String(e));
    }
  }

  return [
    { method: 'GET', path: '/api/chats/state', desc: '聊天模块全量数据(供应商/提示词/MCP/分组/标签/会话/偏好)', handler: state },
    { method: 'POST', path: '/api/chats/conversations', desc: '新建会话', handler: createConversation },
    { method: 'GET', path: '/api/chats/conversations/:id', desc: '会话详情', handler: getConversation },
    { method: 'GET', path: '/api/chats/conversations/:id/messages', desc: '会话消息列表', handler: messages },
    { method: 'PUT', path: '/api/chats/conversations/:id', desc: '更新会话(收藏/置顶/归档/标题/分组/标签/模型)', handler: updateConversation },
    { method: 'DELETE', path: '/api/chats/conversations/:id', desc: '删除会话', handler: deleteConversation },
    { method: 'POST', path: '/api/chats/conversations/:id/messages', desc: '新增会话消息', handler: addMessage },
    { method: 'PUT', path: '/api/chats/messages/:id', desc: '更新消息(编辑正文/评分反馈)', handler: updateMessage },
    { method: 'POST', path: '/api/chats/messages/truncate', desc: '删除某消息之后的全部内容', handler: truncate },
    { method: 'DELETE', path: '/api/chats/messages/:id', desc: '删除消息(级联删除其后消息)', handler: deleteMessage },
    { method: 'POST', path: '/api/chats/chat', desc: '流式对话(SSE,多轮工具调用/MCP/联网)', handler: chat },
    { method: 'POST', path: '/api/chats/models', desc: '自动获取供应商模型列表', handler: models },
    { method: 'POST', path: '/api/chats/providers', desc: '新增/更新供应商(key upsert)', handler: upsertProvider },
    { method: 'DELETE', path: '/api/chats/providers', desc: '删除供应商', handler: deleteProvider },
    { method: 'POST', path: '/api/chats/prompts', desc: '新增提示词', handler: createPrompt },
    { method: 'PUT', path: '/api/chats/prompts/:id', desc: '更新提示词', handler: updatePrompt },
    { method: 'DELETE', path: '/api/chats/prompts/:id', desc: '删除提示词', handler: deletePrompt },
    { method: 'PUT', path: '/api/chats/groups', desc: '分组整表替换(拖拽排序/多级)', handler: saveGroups },
    { method: 'PUT', path: '/api/chats/tags', desc: '标签整表替换(排序/改色)', handler: saveTags },
    { method: 'POST', path: '/api/chats/mcp', desc: '新增/更新 MCP(带 id 为更新)', handler: upsertMcp },
    { method: 'POST', path: '/api/chats/mcp/test', desc: '测试 MCP 连接并抓取工具', handler: testMcp },
    { method: 'DELETE', path: '/api/chats/mcp', desc: '删除 MCP', handler: deleteMcp },
    { method: 'PUT', path: '/api/chats/prefs', desc: '保存用户偏好(默认供应商/模型/参数/搜索/MCP)', handler: savePrefs },
    { method: 'POST', path: '/api/chats/fetch-url', desc: '抓取远程 URL 为附件(图片转 dataUri/文本)', handler: fetchUrl },
  ];
}

module.exports = chatsRoutes;
