/* ============================================================
 * ai.js — Chats 模块大模型接入(零第三方依赖)
 * ------------------------------------------------------------
 * 职责:
 *   1. 内置供应商目录(baseUrl 免填)+ 用户自定义 openai 兼容供应商
 *   2. 三种协议适配器:openai chat/completions / anthropic messages /
 *      gemini generateContent,统一归一化为流式事件(SSE)
 *   3. MCP 客户端:streamable HTTP 与 传统 SSE 两种传输,工具列表 +
 *      工具调用(多轮 agent 循环)
 *   4. 模型列表自动获取(openai/anthropic/gemini/openai 兼容)
 *   5. 联网搜索(tavily / brave / serper,key 存 app_settings 加密)
 *   6. 会话/消息持久化(收到 conversationId 时自动落库)
 * ------------------------------------------------------------
 * 协议约定(服务端 → 前端 SSE):
 *   event: meta      { conversationId }
 *   event: reasoning { delta }            思考链增量
 *   event: text      { delta }            正文增量
 *   event: tool      { id,name,arguments,state,result?,error? }
 *   event: usage     { input_tokens, output_tokens }
 *   event: done      { messageId }
 *   event: error     { message }
 * 只依赖 node: 全局 fetch(运行时均有)。敏感 api_key 经 decrypt 读取,
 * 不随任何响应返回。
 * ============================================================ */
'use strict';

const MCP_PROTOCOL_VERSION = '2025-03-26';
const MAX_TOOL_ROUNDS = 8;
const REQUEST_TIMEOUT_MS = 90 * 1000;
// 流式对话整体时长上限(长回答/多轮工具调用可能远超普通请求)
const STREAM_TIMEOUT_MS = 5 * 60 * 1000;
// 远程附件抓取上限
const FETCH_URL_MAX_BYTES = 5 * 1024 * 1024;

/* ---------- 内置供应商目录(用户无需填写 base_url;模型可点\"自动获取\"刷新) ---------- */
const PROVIDER_CATALOG = [
  {
    key: 'openai',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.2', 'gpt-5.2-mini', 'o3'],
    vision: true,
  },
  {
    key: 'anthropic',
    name: 'Anthropic (Claude)',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    vision: true,
  },
  {
    key: 'gemini',
    name: 'Google Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-3-pro', 'gemini-3-flash', 'gemini-3-flash-lite'],
    vision: true,
  },
  {
    key: 'openrouter',
    name: 'OpenRouter',
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    vision: true,
  },
  {
    key: 'grok',
    name: 'xAI (Grok)',
    type: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-4', 'grok-4-fast'],
    vision: true,
  },
  {
    key: 'groq',
    name: 'Groq',
    type: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-4-scout-17b-16e-instruct', 'qwen-3-coder-30b-a3b'],
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-flash', 'deepseek-reasoner'],
  },
  {
    key: 'kimi',
    name: 'Moonshot Kimi',
    type: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.5-turbo-preview'],
    vision: true,
  },
  {
    key: 'glm',
    name: 'Zhipu GLM',
    type: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.7', 'glm-4.7-plus'],
  },
  {
    key: 'qwen',
    name: 'Alibaba Qwen',
    type: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max-latest', 'qwen-plus-latest', 'qwen2.5-vl-72b-instruct'],
    vision: true,
  },
  {
    key: 'siliconflow',
    name: 'SiliconFlow',
    type: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['Qwen/Qwen3-Coder-480B-A35B-Instruct', 'deepseek-ai/DeepSeek-R1'],
  },
  {
    key: 'huggingface',
    name: 'Hugging Face',
    type: 'openai',
    baseUrl: 'https://router.huggingface.co/v1',
    models: ['Qwen/Qwen3-235B-A22B-Instruct'],
  },
  {
    key: 'cerebras',
    name: 'Cerebras',
    type: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    models: ['cerebras-nova-instruct', 'llama-3.3-70b'],
  },
  {
    key: 'mistral',
    name: 'Mistral',
    type: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-large-2507', 'codestral-2507'],
  },
  {
    key: 'ollama',
    name: 'Ollama (本地)',
    type: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.3', 'qwen3'],
    local: true,
  },
  {
    key: 'opencode',
    name: 'OpenCode Zen',
    type: 'openai',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    models: ['mimo-v2.5'],
    vision: true,
  },
];

/** 依 key 查内置目录(找不到返回 null) */
function catalog(key) {
  for (let i = 0; i < PROVIDER_CATALOG.length; i++) {
    if (PROVIDER_CATALOG[i].key === key) return PROVIDER_CATALOG[i];
  }
  return null;
}

/** 把数据库供应商行与内置目录合并,对外输出(api_key 只保留\"已配置\"标记) */
function describeProvider(row) {
  const c = catalog(row && row.key);
  const cat = c || {};
  return {
    id: row.id,
    key: row.key,
    name: row.name || cat.name || row.key,
    type: row.type || cat.type || 'openai',
    baseUrl: row.base_url || cat.baseUrl || '',
    builtin: !!c,
    local: !!cat.local,
    vision: !!cat.vision,
    enabled: !!row.enabled,
    hasApiKey: !!row.api_key,
    models: parseJson(row.models, null) || (Array.isArray(cat.models) ? cat.models.slice() : []),
    sort: Number(row.sort) || 0,
  };
}

function parseJson(text, fallback) {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

function trim(s, n) {
  return String(s == null ? '' : s).slice(0, n || 200);
}

function pick(o, keys, fallback) {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
}

function nowIso() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------
 * 模型自动获取
 * ---------------------------------------------------------- */
async function fetchModels(provider, apiKeyOverride) {
  const type = provider.type || 'openai';
  const base = (provider.baseUrl || '').replace(/\/+$/, '');
  const key = apiKeyOverride || provider.apiKey || '';
  let url, headers, parse;
  if (type === 'anthropic') {
    url = base + '/v1/models';
    headers = {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    };
    parse = (json) => (json && Array.isArray(json.data) ? json.data.map((m) => m && m.id).filter(Boolean) : []);
  } else if (type === 'gemini') {
    url = base + '/models?pageSize=200';
    if (key) url += '&key=' + encodeURIComponent(key);
    headers = {};
    parse = (json) => {
      if (!json || !Array.isArray(json.models)) return [];
      return json.models
        .map((m) => m.name || '')
        .filter((n) => n && n.indexOf('tunedModels/') !== 0)
        .map((n) => n.replace(/^models\//, ''));
    };
  } else {
    // openai 兼容(含 ollama 等本地)与 openrouter / 其它
    url = base + '/models';
    headers = key ? { Authorization: 'Bearer ' + key } : {};
    parse = (json) => (json && Array.isArray(json.data) ? json.data.map((m) => m && m.id).filter(Boolean) : []);
  }
  const res = await withTimeout(
    fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    REQUEST_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await readText(res);
    throw new Error('获取模型失败 ' + res.status + (text ? ': ' + trim(text, 180) : ''));
  }
  const json = await res.json();
  let list = parse(json) || [];
  if (!list.length) throw new Error('该供应商未返回模型列表');
  // 去重 + 排序
  list = Array.from(new Set(list)).sort();
  return list;
}

/* ------------------------------------------------------------
 * 联网搜索:tavily / brave / serper
 * key 存于 app_settings(键名含 apikey 自动加密)
 * ---------------------------------------------------------- */
async function webSearch(db, decrypt, ws, cfg) {
  const provider = (cfg && cfg.provider) || 'tavily';
  const query = String((cfg && cfg.query) || '').trim();
  if (!query) return null;
  const keyRow = await db.get(
    'SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?',
    [ws, 'chats:websearch:' + provider + ':apikey']
  );
  const key = keyRow && keyRow.value ? (decrypt(keyRow.value) || '') : '';
  if (!key) {
    throw new Error('未配置 ' + provider + ' 搜索 API Key(设置 → 联网搜索)');
  }
  const maxResults = Math.min(6, Math.max(1, Number(cfg.maxResults) || 3));
  let items = [];
  if (provider === 'tavily') {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, max_results: maxResults, search_depth: 'advanced' }),
    });
    const json = toJson(await readText(res), {});
    items = (Array.isArray(json.results) ? json.results : []).map((r) => ({
      title: trim(r.title, 200),
      url: r.url || '',
      snippet: trim(r.content || r.raw_content, 600),
    }));
  } else if (provider === 'serper') {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query, num: maxResults }),
    });
    const json = toJson(await readText(res), {});
    items = (Array.isArray(json.organic) ? json.organic : []).map((r) => ({
      title: trim(r.title, 200),
      url: r.link || '',
      snippet: trim(r.snippet, 600),
    }));
  } else {
    // brave
    const url = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + maxResults;
    const res = await fetch(url, { headers: { 'X-Subscription-Token': key } });
    const json = toJson(await readText(res), {});
    items = (json.web && Array.isArray(json.web.results) ? json.web.results : []).map((r) => ({
      title: trim(r.title, 200),
      url: r.url || '',
      snippet: trim(r.description, 600),
    }));
  }
  if (!items.length) return '';
  const lines = ['以下是针对「' + query + '」的联网搜索结果(请优先引用其中信息):'];
  items.forEach((it, i) => {
    lines.push(
      (i + 1) + '. ' + it.title + (it.url ? ' [' + it.url + ']' : '') + '\n' + (it.snippet || '')
    );
  });
  return lines.join('\n');
}

function toJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function readText(res) {
  try {
    return await res.text();
  } catch (e) {
    return '';
  }
}

/* ------------------------------------------------------------
 * SSE 工具
 * ---------------------------------------------------------- */
/** 从 Web Response 中逐行读取 SSE,产出 { event, data }。
 * 空行是帧分隔符(必须据此切帧),兼容 \r\n 行尾与注释行。 */
async function* readSse(res) {
  if (!res || !res.body || typeof res.body.getReader !== 'function') return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let evt = null;
  let dataLines = [];
  let lastId = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line === '') {
          // 空行 → 一帧结束
          if (dataLines.length) {
            yield { event: evt || 'message', data: dataLines.join('\n'), id: lastId };
            evt = null;
            dataLines = [];
          }
          continue;
        }
        if (line.charAt(0) === ':') continue; // 注释行
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const val = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') evt = val;
        else if (field === 'data') dataLines.push(val);
        else if (field === 'id') lastId = val;
      }
    }
    if (dataLines.length) {
      yield { event: evt || 'message', data: dataLines.join('\n'), id: lastId };
    }
  } finally {
    try {
      reader.releaseLock();
    } catch (e) {
      /* noop */
    }
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('请求超时(' + ms + 'ms)')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/* ------------------------------------------------------------
 * MCP 客户端(streamable HTTP / 传统 SSE)
 * ---------------------------------------------------------- */
const mcpCache = new Map(); // id -> { client, ts }

function mcpJsonRpc(method, id, params) {
  const msg = { jsonrpc: '2.0', id, method };
  if (params !== undefined) msg.params = params;
  return msg;
}

/** 建立 MCP 连接(含工具列表快照)。返回 { session, tools:[{name,description,inputSchema}] } */
async function connectMcp(server) {
  const cached = mcpCache.get(server.id);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached;
  let client;
  try {
    client = await openMcp(server);
  } catch (e) {
    mcpCache.delete(server.id);
    throw e;
  }
  const tools = await client.listTools();
  const entry = { client, tools, ts: Date.now() };
  mcpCache.set(server.id, entry);
  return entry;
}

function closeMcp(serverId) {
  const cached = mcpCache.get(serverId);
  if (cached && cached.client && cached.client.close) {
    try {
      cached.client.close();
    } catch (e) {
      /* noop */
    }
  }
  mcpCache.delete(serverId);
}

async function openMcp(server) {
  if (server.protocol === 'sse') return openSseMcp(server);
  return openHttpMcp(server);
}

/** streamable HTTP(现代 MCP):JSON 或 SSE 响应均支持 */
async function openHttpMcp(server) {
  const url = (server.url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) throw new Error('MCP 地址必须以 http(s):// 开头');
  let sessionId = '';
  let nextId = 1000;

  async function rpc(method, params) {
    const id = ++nextId;
    const body = mcpJsonRpc(method, id, params);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const res = await withTimeout(fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }), REQUEST_TIMEOUT_MS);
    const newSession = res.headers && res.headers.get ? res.headers.get('mcp-session-id') : null;
    if (newSession) sessionId = newSession;
    if (res.status !== 200 && res.status !== 202) {
      throw new Error('MCP HTTP ' + res.status + ': ' + trim(await readText(res), 160));
    }
    const contentType = (res.headers && res.headers.get ? res.headers.get('content-type') : '') || '';
    if (contentType.indexOf('text/event-stream') !== -1) {
      for await (const ev of readSse(res)) {
        const msg = toJson(ev.data, null);
        if (msg && (msg.id === id || msg.method === 'notifications/message')) return msg;
      }
      throw new Error('MCP 未返回响应(id=' + id + ')');
    }
    return await res.json();
  }

  const init = await rpc('initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'freebuff-chats', version: '1.0.0' },
  });
  try {
    await rpc('notifications/initialized');
  } catch (e) {
    /* 部分实现忽略通知 */
  }
  return {
    async listTools() {
      const res2 = await rpc('tools/list', {});
      const result = res2 && res2.result;
      return Array.isArray(result && result.tools) ? result.tools : [];
    },
    async callTool(name, args) {
      const res3 = await rpc('tools/call', { name, arguments: args || {} });
      return res3 && res3.result;
    },
    close() {},
    _rpc: rpc,
  };
}

/** 传统 SSE 传输:GET /sse 常开流 → endpoint 事件给 POST 地址 → 经同一流返回响应 */
async function openSseMcp(server) {
  let endpoint = '';
  const pending = new Map();
  const streamReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP SSE 端点超时')), REQUEST_TIMEOUT_MS);
    fetch((server.url || '').trim())
      .then((res) => {
        if (!res.ok || !res.body) throw new Error('MCP SSE ' + res.status);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        (async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let idx;
              while ((idx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);
                const colon = line.indexOf(':');
                if (colon === -1) continue;
                const field = line.slice(0, colon).trim();
                const val = line.slice(colon + 1).replace(/^ /, '').trim();
                if (field === 'endpoint' || (field === 'data' && /^\/?messages/.test(val))) {
                  endpoint = endpointBase((server.url || ''), val);
                  clearTimeout(timer);
                  const cb = streamReadyResolve;
                  streamReadyResolve = null;
                  if (cb) cb();
                } else if (field === 'data') {
                  // 响应消息也通过 data 传递(某些实现)
                  const msg = toJson(val, null);
                  if (msg && msg.id && pending.has(msg.id)) {
                    const p = pending.get(msg.id);
                    pending.delete(msg.id);
                    p(msg);
                  }
                } else if (field === 'event' && val === 'closed') {
                  break;
                }
              }
            }
          } catch (e) {
            const cb = streamReadyResolve;
            streamReadyResolve = null;
            if (cb) reject(e);
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              /* noop */
            }
          }
        })();
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
  let streamReadyResolve = resolve;
  let nextId = 1;

  async function rpc(method, params) {
    await streamReady;
    if (!endpoint) throw new Error('MCP SSE 未收到 endpoint');
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, (msg) => {
        if (msg.error) reject(new Error(msg.error.message || 'MCP 错误'));
        else resolve(msg);
      });
      withTimeout(
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(mcpJsonRpc(method, id, params)),
        }),
        REQUEST_TIMEOUT_MS
      )
        .then((res) => {
          if (!res.ok) {
            pending.delete(id);
            reject(new Error('MCP SSE POST ' + res.status));
          }
        })
        .catch((e) => {
          pending.delete(id);
          reject(e);
        });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('MCP 工具调用超时'));
        }
      }, REQUEST_TIMEOUT_MS);
    });
  }

  const init = await rpc('initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'freebuff-chats', version: '1.0.0' },
  });
  await rpc('notifications/initialized').catch(() => {});
  return {
    async listTools() {
      const res2 = await rpc('tools/list', {});
      const result = res2 && res2.result;
      return Array.isArray(result && result.tools) ? result.tools : [];
    },
    async callTool(name, args) {
      const res3 = await rpc('tools/call', { name, arguments: args || {} });
      return res3 && res3.result;
    },
    close() {},
  };
}

function endpointBase(baseUrl, rel) {
  if (/^https?:\/\//.test(rel)) return rel;
  const base = baseUrl.replace(/\/+$/, '');
  if (rel.charAt(0) === '/') return base.split('/').slice(0, 3).join('/') + rel;
  return base + '/' + rel;
}

/** 把 MCP 工具转换成 OpenAI function 定义 */
function toolToOpenAi(t) {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  };
}

function toolToAnthropic(t) {
  return {
    name: t.name,
    description: t.description || '',
    input_schema: t.inputSchema || { type: 'object', properties: {} },
  };
}

function toolToGemini(t) {
  return {
    name: t.name,
    description: t.description || '',
    parameters: t.inputSchema || { type: 'object', properties: {} },
  };
}

/* ------------------------------------------------------------
 * 归一化消息:统一成
 *   { role, content, parts?, toolCallId?, toolCalls? }
 * ---------------------------------------------------------- */
function normalizeHistory(dbRows) {
  return (dbRows || []).map((r) => {
    const msg = {
      id: r.id,
      role: r.role,
      content: r.content || '',
    };
    const parts = parseJson(r.parts, []);
    if (Array.isArray(parts) && parts.length) msg.parts = parts;
    const thinking = parseJson(r.thinking, null);
    if (thinking && thinking.content) msg.thinking = thinking.content;
    const toolCalls = parseJson(r.tool_calls, []);
    if (Array.isArray(toolCalls) && toolCalls.length) msg.toolCalls = toolCalls;
    return msg;
  });
}

/* ------------------------------------------------------------
 * 三种协议请求构造
 * ---------------------------------------------------------- */
function buildSystemMessages(systemPrompt, history) {
  return history.filter((m) => m.role === 'system').map((m) => m.content).concat(
    systemPrompt ? [systemPrompt] : []
  );
}

/** openai chat/completions */
function buildOpenAIRequest(provider, opts) {
  const { system, history, params, thinking, tools } = opts;
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  for (const m of history) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: m.toolCallId || '',
        content: m.content || '',
      });
    } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
      const tc = m.toolCalls.map((t) => ({
        id: t.id,
        type: 'function',
        function: { name: t.name, arguments: typeof t.arguments === 'string' ? t.arguments : JSON.stringify(t.arguments || {}) },
      }));
      messages.push({ role: 'assistant', content: m.content || null, tool_calls: tc });
    } else {
      const content = formatOpenAIContent(m);
      messages.push({ role: m.role, content });
    }
  }
  const body = {
    model: opts.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools && tools.length) {
    body.tools = tools.map(toolToOpenAi);
    body.tool_choice = 'auto';
  }
  if (params) {
    if (params.temperature !== undefined && params.temperature !== '') body.temperature = clampNum(params.temperature, 0, 2);
    if (params.topP !== undefined && params.topP !== '') body.top_p = clampNum(params.topP, 0, 1);
    if (params.topK !== undefined && params.topK !== '') body.top_k = clampNum(params.topK, 1, 100);
    if (params.maxTokens) body.max_tokens = toTokens(params.maxTokens);
  }
  if (thinking && thinking.level && thinking.level !== 0) {
    body.reasoning_effort = thinking.level === 1 ? 'low' : thinking.level >= 3 ? 'high' : 'medium';
  }
  return body;
}

/** 多模态用户内容:openai 格式 */
function formatOpenAIContent(m) {
  if (!m.parts || !m.parts.length) return m.content || '';
  const out = [];
  if (m.content) out.push({ type: 'text', text: m.content });
  for (const p of m.parts) {
    if (p.type === 'image') {
      const data = p.dataUri || p.url || '';
      // 已是 data:image... 直接发射,否则作为远程 url
      if (data.indexOf('data:') === 0) {
        const comma = data.indexOf(',');
        const head = comma === -1 ? data : data.slice(0, comma);
        let mediaType = 'image/png';
        const mm = /data:([^;]+)/.exec(head);
        if (mm) mediaType = mm[1];
        out.push({
          type: 'image_url',
          image_url: { url: data },
          // media_type 提示仅对部分实现有效;通用字段保留 url 即可
          _media_type: mediaType,
        });
      } else if (/^https?:\/\//.test(data)) {
        out.push({ type: 'image_url', image_url: { url: data } });
      }
    } else if (p.type === 'text') {
      out.push({ type: 'text', text: p.text });
    } else if (p.type === 'file') {
      if (p.content) out.push({ type: 'text', text: p.content });
      else out.push({ type: 'text', text: '[' + (p.name || '附件') + ']: ' + (p.text || '') });
    }
  }
  if (!out.length) return m.content || '';
  return out;
}

/** anthropic messages */
function buildAnthropicRequest(provider, opts) {
  const { system, history, params, thinking, tools } = opts;
  const messages = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      // anthropic 工具结果作为 user 消息的 tool_result 块
      const last = messages[messages.length - 1];
      const block = { type: 'tool_result', tool_use_id: m.toolCallId || '', content: m.content || '' };
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        messages.push({ role: 'user', content: [block] });
      }
    } else if (m.role === 'assistant') {
      const content = [];
      if (m.thinking) content.push({ type: 'thinking', thinking: m.thinking });
      if (m.content) content.push({ type: 'text', text: m.content });
      if (m.toolCalls && m.toolCalls.length) {
        for (const t of m.toolCalls) {
          let input = t.arguments;
          if (typeof input === 'string') {
            try {
              input = JSON.parse(input);
            } catch (e) {
              input = {};
            }
          }
          content.push({ type: 'tool_use', id: t.id, name: t.name, input: input || {} });
        }
      }
      messages.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: '' }] });
    } else {
      messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: formatAnthropicContent(m) });
    }
  }
  const body = {
    model: opts.model,
    max_tokens: Math.max(256, toTokens((params && params.maxTokens) || 8192)),
    messages,
  };
  if (system) body.system = system;
  if (thinking && thinking.level && thinking.level !== 0) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: 1024 * Math.min(thinking.level || 1, 4),
    };
  } else {
    body.thinking = { type: 'disabled' };
  }
  if (tools && tools.length) {
    body.tools = tools.map(toolToAnthropic);
  }
  if (params) {
    // Anthropic 约束:开启 thinking 时 temperature 必须为 1 且不能传 top_p/top_k
    const thinkingOn = body.thinking && body.thinking.type === 'enabled';
    if (!thinkingOn) {
      if (params.temperature !== undefined && params.temperature !== '') body.temperature = clampNum(params.temperature, 0, 1);
      if (params.topP !== undefined && params.topP !== '') body.top_p = clampNum(params.topP, 0, 1);
      if (params.topK !== undefined && params.topK !== '') body.top_k = clampNum(params.topK, 1, 100);
    }
  }
  return body;
}

function formatAnthropicContent(m) {
  if (!m.parts || !m.parts.length) return m.content || '';
  const out = [];
  if (m.content) out.push({ type: 'text', text: m.content });
  for (const p of m.parts) {
    if (p.type === 'image') {
      const data = p.dataUri || p.url || '';
      if (data.indexOf('data:') === 0) {
        const mm = /^data:([^;,]+),/.exec(data);
        let mediaType = mm ? mm[1] : 'image/png';
        if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
        const base64 = data.slice(data.indexOf(',') + 1);
        out.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
      } else if (/^https?:\/\//.test(data)) {
        out.push({ type: 'image', source: { type: 'url', url: data } });
      }
    } else if (p.type === 'text') {
      out.push({ type: 'text', text: p.text });
    } else if (p.type === 'file') {
      out.push({ type: 'text', text: (p.content || p.text || '[' + (p.name || '附件') + ']') });
    }
  }
  if (!out.length) return m.content || '';
  return out;
}

/** gemini generateContent */
function buildGeminiRequest(provider, opts) {
  const { system, history, params, thinking, tools } = opts;
  const contents = [];
  for (const m of history) {
    if (m.role === 'system') continue;
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (m.role === 'tool') {
      // function response 附加到前一条 model 消息之后
      const parts = [{ functionResponse: { name: m.toolName || 'tool', response: { content: m.content || '' } } }];
      contents.push({ role: 'user', parts });
    } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const t of m.toolCalls) {
        let args = t.arguments;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch (e) {
            args = {};
          }
        }
        parts.push({ functionCall: { name: t.name, args: args || {} } });
      }
      contents.push({ role: 'model', parts });
    } else {
      contents.push({ role, parts: formatGeminiContent(m) });
    }
  }
  const body = {
    contents,
    generationConfig: {},
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (thinking && thinking.level && thinking.level !== 0) {
    body.generationConfig.thinkingConfig = { includeThoughts: true };
  }
  if (tools && tools.length) {
    body.tools = [{ functionDeclarations: tools.map(toolToGemini) }];
  }
  const gc = body.generationConfig;
  if (params) {
    if (params.temperature !== undefined && params.temperature !== '') gc.temperature = clampNum(params.temperature, 0, 2);
    if (params.topP !== undefined && params.topP !== '') gc.topP = clampNum(params.topP, 0, 1);
    if (params.topK !== undefined && params.topK !== '') gc.topK = Math.max(1, Math.min(100, Math.round(Number(params.topK) || 1)));
    if (params.maxTokens) gc.maxOutputTokens = toTokens(params.maxTokens);
  }
  return body;
}

function formatGeminiContent(m) {
  if (!m.parts || !m.parts.length) return [{ text: m.content || '' }];
  const out = [];
  if (m.content) out.push({ text: m.content });
  for (const p of m.parts) {
    if (p.type === 'image') {
      const data = p.dataUri || p.url || '';
      if (data.indexOf('data:') === 0) {
        const mm = /^data:([^;,]+),/.exec(data);
        out.push({ inlineData: { mimeType: (mm ? mm[1] : 'image/png').replace('image/jpg', 'image/jpeg'), data: data.slice(data.indexOf(',') + 1) } });
      } else if (/^https?:\/\//.test(data)) {
        out.push({ fileData: { fileUri: data } });
      }
    } else if (p.type === 'text') {
      out.push({ text: p.text });
    } else if (p.type === 'file') {
      out.push({ text: p.content || p.text || '[' + (p.name || '附件') + ']' });
    }
  }
  if (!out.length) out.push({ text: m.content || '' });
  return out;
}

function clampNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/** maxTokens 规整:支持 k/M 单位与小数(如 0.5k=512,1M=1048576) */
function toTokens(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return 0;
  const m = /^(\d*\.?\d+)\s*([km]?)$/.exec(s);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  const base = parseFloat(m[1]);
  if (m[2] === 'k') return Math.round(base * 1024);
  if (m[2] === 'm') return Math.round(base * 1024 * 1024);
  return Math.round(base);
}

/* ------------------------------------------------------------
 * 三种协议流解析
 * ---------------------------------------------------------- */
/** openai SSE → emit(text/reasoning/tool/usage),返回 { content, thinking, toolCalls, usage } */
async function parseOpenAI(res, emit) {
  const acc = { content: '', thinking: '', toolCalls: new Map(), usage: null };
  for await (const ev of readSse(res)) {
    let json;
    try {
      json = JSON.parse(ev.data);
    } catch (e) {
      continue;
    }
    if (!json || json.choices === undefined) continue;
    if (json.usage) {
      const u = json.usage;
      emit('usage', { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 });
      acc.usage = u;
    }
    const choice = (json.choices || [])[0];
    if (!choice || !choice.delta) continue;
    const d = choice.delta;
    if (d.reasoning_content) {
      acc.thinking += d.reasoning_content;
      emit('reasoning', { delta: d.reasoning_content });
    }
    if (d.reasoning && d.reasoning.visible_content !== undefined) {
      const t = d.reasoning.visible_content || '';
      acc.thinking += t;
      emit('reasoning', { delta: t });
    }
    if (d.content) {
      acc.content += d.content;
      emit('text', { delta: d.content });
    }
    if (Array.isArray(d.tool_calls)) {
      for (const tc of d.tool_calls) {
        if (!tc || tc.index === undefined) continue;
        if (!acc.toolCalls.has(tc.index)) {
          acc.toolCalls.set(tc.index, { id: (tc.id || ''), name: '', arguments: '' });
        }
        const cur = acc.toolCalls.get(tc.index);
        if (tc.id) cur.id = tc.id;
        if (tc.function) {
          if (tc.function.name) cur.name += tc.function.name;
          if (tc.function.arguments) cur.arguments += tc.function.arguments;
        }
      }
    }
  }
  const toolCalls = [];
  const indices = Array.from(acc.toolCalls.keys()).sort((a, b) => a - b);
  for (const i of indices) {
    const t = acc.toolCalls.get(i);
    let parsed = t.arguments;
    try {
      parsed = t.arguments ? JSON.parse(t.arguments) : {};
    } catch (e) {
      /* 保留原始字符串 */
    }
    toolCalls.push({ id: t.id, name: t.name, arguments: typeof parsed === 'string' ? parsed : parsed || {} });
  }
  return { content: acc.content, thinking: acc.thinking, toolCalls, usage: acc.usage, stopReason: null };
}

/** anthropic SSE → 同上 */
async function parseAnthropic(res, emit) {
  const acc = { content: '', thinking: '', toolCalls: new Map(), usage: null };
  for await (const ev of readSse(res)) {
    let json;
    try {
      json = ev.data ? JSON.parse(ev.data) : null;
    } catch (e) {
      continue;
    }
    if (!json) continue;
    if (ev.event === 'message_start' && json.message && json.message.usage) {
      const u = json.message.usage;
      emit('usage', { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0 });
      acc.usage = u;
    }
    if (ev.event === 'content_block_start' && json.content_block) {
      const cb = json.content_block;
      if (cb.type === 'tool_use') {
        acc.toolCalls.set(json.index, { id: cb.id || '', name: cb.name || '', arguments: '' });
      } else if (cb.type === 'thinking') {
        acc.thinking += cb.thinking || '';
        emit('reasoning', { delta: cb.thinking || '' });
      }
    }
    if (ev.event === 'content_block_delta' && json.delta) {
      const d = json.delta;
      if (d.type === 'text_delta') {
        acc.content += d.text || '';
        emit('text', { delta: d.text || '' });
      } else if (d.type === 'thinking_delta') {
        acc.thinking += d.thinking || '';
        emit('reasoning', { delta: d.thinking || '' });
      } else if (d.type === 'input_json_delta') {
        const cur = acc.toolCalls.get(json.index);
        if (cur) cur.arguments += d.partial_json || '';
      }
    }
    if (ev.event === 'message_delta' && json.delta && json.delta.stop_reason) {
      acc.stopReason = json.delta.stop_reason;
    }
  }
  const toolCalls = [];
  const indices = Array.from(acc.toolCalls.keys()).sort((a, b) => a - b);
  for (const i of indices) {
    const t = acc.toolCalls.get(i);
    let parsed = t.arguments;
    try {
      parsed = t.arguments ? JSON.parse(t.arguments) : {};
    } catch (e) {
      /* keep raw */
    }
    toolCalls.push({ id: t.id, name: t.name, arguments: typeof parsed === 'string' ? parsed : parsed || {} });
  }
  return acc.stopReason === 'tool_use' ? { content: acc.content, thinking: acc.thinking, toolCalls, usage: acc.usage, stopReason: 'tool_use' } : { content: acc.content, thinking: acc.thinking, toolCalls, usage: acc.usage, stopReason: acc.stopReason };
}

/** gemini :streamGenerateContent SSE → 同上 */
async function parseGemini(res, emit) {
  const acc = { content: '', thinking: '', toolCalls: [], usage: null };
  let toolCalls = [];
  for await (const ev of readSse(res)) {
    let json;
    try {
      json = ev.data ? JSON.parse(ev.data) : null;
    } catch (e) {
      continue;
    }
    if (!json) continue;
    if (json.usageMetadata) {
      const u = json.usageMetadata;
      emit('usage', { input_tokens: u.promptTokenCount || 0, output_tokens: u.candidatesTokenCount || 0 });
      acc.usage = u;
    }
    const cand = (json.candidates || [])[0];
    if (!cand || !cand.content || !Array.isArray(cand.content.parts)) continue;
    for (const part of cand.content.parts || []) {
      if (part.thought === true && part.text != null) {
        acc.thinking += part.text;
        emit('reasoning', { delta: part.text });
      } else if (part.text != null) {
        acc.content += part.text;
        emit('text', { delta: part.text });
      } else if (part.functionCall) {
        toolCalls.push({ id: 'gm-' + Math.random().toString(36).slice(2, 8), name: part.functionCall.name, arguments: part.functionCall.args || {} });
      }
    }
  }
  return { content: acc.content, thinking: acc.thinking, toolCalls, usage: acc.usage, stopReason: toolCalls.length ? 'tool_use' : null };
}

/* ------------------------------------------------------------
 * 单轮流式请求
 * ---------------------------------------------------------- */
async function streamOnce(provider, opts, emit) {
  const type = provider.type || 'openai';
  const base = (provider.baseUrl || '').replace(/\/+$/, '');
  const apiKey = provider.apiKey || '';
  let url, headers, body, parser;
  if (type === 'anthropic') {
    url = base + '/v1/messages';
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    body = buildAnthropicRequest(provider, opts);
    parser = parseAnthropic;
  } else if (type === 'gemini') {
    url = base + '/models/' + encodeURIComponent(opts.model) + ':streamGenerateContent?alt=sse';
    if (apiKey) url += '&key=' + encodeURIComponent(apiKey);
    headers = { 'Content-Type': 'application/json' };
    body = buildGeminiRequest(provider, opts);
    parser = parseGemini;
  } else {
    url = base + '/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
    };
    body = buildOpenAIRequest(provider, opts);
    parser = parseOpenAI;
  }
  // 流式响应耗时可能远超普通请求(长回答/多轮工具),用更宽的上限;
  // withTimeout 只兜底连接挂死,正常流由客户端 abort 控制
  const res = await withTimeout(
    fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(STREAM_TIMEOUT_MS) }),
    STREAM_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = trim(await readText(res), 400);
    const msg = text
      ? (() => {
          try {
            const j = JSON.parse(text);
            return (j.error && (j.error.message || JSON.stringify(j.error))) || text;
          } catch (e) {
            return text;
          }
        })()
      : 'HTTP ' + res.status;
    throw new Error(msg || '供应商请求失败');
  }
  return parser(res, emit);
}

/* ------------------------------------------------------------
 * 主入口:多轮 agent 循环 + 持久化
 * payload: { conversationId?, providerKey, model, system?, params?, thinking?,
 *            webSearch?, mcpIds? }
 * emit(type, data): 推送 SSE 事件
 * 返回 { messageId (assistant), userMessageId, content, error? }
 * ---------------------------------------------------------- */
async function runChat(ctx, payload, emit) {
  const { db, decrypt, ws } = ctx;
  const provider = await resolveProvider(db, decrypt, ws, payload.providerKey);
  if (!provider) throw new Error('供应商不存在或已禁用: ' + (payload.providerKey || ''));
  if (!provider.apiKey && !provider.publicKey) {
    // 无 key:允许本地(LAN)供应商或显式留空
    if (!provider.local) throw new Error('供应商 ' + provider.name + ' 未配置 API Key');
  }
  const model = String(payload.model || '').trim();
  if (!model) throw new Error('请选择模型');

  const conversationId = payload.conversationId;
  const params = payload.params && typeof payload.params === 'object' ? payload.params : {};
  const thinking = payload.thinking && typeof payload.thinking === 'object' ? payload.thinking : { level: 0 };

  // 1) 读历史
  let history = [];
  if (conversationId) {
    const rows = await db.query(
      'SELECT id, role, content, parts, thinking, tool_calls FROM chats_messages WHERE conversation_id = ? ORDER BY id',
      [conversationId]
    );
    history = normalizeHistory(rows);
  }

  // 2) 系统提示词(prompt_id 关联)
  let systemPrompt = payload.system || '';
  if (!systemPrompt && payload.promptId) {
    const p = await db.get('SELECT content FROM chats_prompts WHERE id = ? AND workspace_id = ?', [payload.promptId, ws]);
    if (p) systemPrompt = p.content;
  }

  // 3) 联网搜索(注入系统提示)
  if (payload.webSearch && payload.webSearch.enabled) {
    const searchCfg = Object.assign({}, payload.webSearch, { query: lastUserText(history) });
    try {
      const searchText = await webSearch(db, decrypt, ws, searchCfg);
      if (searchText) systemPrompt = systemPrompt + (systemPrompt ? '\n\n' : '') + searchText;
    } catch (e) {
      emit('error', { message: '联网搜索失败: ' + ((e && e.message) || e) + '(已忽略,继续对话)' });
    }
  }

  // 4) MCP 工具
  const tools = [];
  const mcpServers = [];
  if (Array.isArray(payload.mcpIds) && payload.mcpIds.length) {
    const placeholders = payload.mcpIds.map(() => '?').join(',');
    const rows = await db.query(
      'SELECT * FROM chats_mcp WHERE workspace_id = ? AND id IN (' + placeholders + ') AND enabled = 1 ORDER BY sort',
      [ws].concat(payload.mcpIds)
    );
    for (const row of rows) {
      mcpServers.push(row);
    }
  }
  const connected = [];
  const toolRegistry = []; // { server, conn, tool } — 工具 → 所属 MCP 服务器与其连接
  for (const server of mcpServers) {
    try {
      const mcp = await connectMcp(server);
      const toolState = parseJson(server.tools, []);
      const enabledMap = {};
      if (Array.isArray(toolState)) {
        for (const t of toolState) if (t.name && t.enabled === false) enabledMap[t.name] = true;
      }
      for (const t of mcp.tools) {
        if (!t.name) continue;
        if (enabledMap[t.name]) continue; // 该工具被用户关闭
        tools.push(t);
        toolRegistry.push({ server, conn: mcp, tool: t });
      }
      connected.push(mcp);
    } catch (e) {
      emit('error', { message: 'MCP「' + server.name + '」连接失败: ' + ((e && e.message) || e) + '(该工具集已跳过)' });
    }
  }

  // 5) 多轮循环
  let content = '';
  let thinkingText = '';
  let finalToolCalls = [];
  let usage = null;
  let error = null;
  const persistToolCalls = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const opts = {
      model,
      system: systemPrompt,
      history,
      params,
      thinking,
      tools: connected.length ? tools : [],
    };
    let result;
    try {
      result = await streamOnce(provider, opts, emit);
    } catch (e) {
      error = (e && e.message) || String(e);
      throw e; // 外层统一转 error 事件
    }
    usage = result.usage || usage;
    if (error) break;
    if (result.thinking) thinkingText = thinkingText || result.thinking;

    if (result.toolCalls && result.toolCalls.length && connected.length) {
      // 工具调用 → 执行 → 追加结果 → 下一轮。
      // 协议要求 assistant(tool_calls) 必须先于 tool 结果入列(OpenAI/Anthropic 均如此)。
      const roundCalls = result.toolCalls;
      history.push({ role: 'assistant', content: result.content || '', thinking: result.thinking || '', toolCalls: roundCalls });
      for (const tc of roundCalls) {
        const entry = toolRegistry.find((e) => e.tool.name === tc.name) || null;
        const serverName = entry ? entry.server.name : (mcpServers[0] && mcpServers[0].name) || '';
        finalToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}),
          server: serverName,
        });
        emit('tool', { id: tc.id, name: tc.name, arguments: tc.arguments, state: 'running' });
        const client = entry && entry.conn && entry.conn.client ? entry.conn.client : (connected[0] && connected[0].client);
        try {
          const callResult = client ? await client.callTool(tc.name, tc.arguments) : { content: [] };
          const resultText = mcpResultText(callResult);
          const errFlag = callResult && callResult.isError;
          finalToolCalls[finalToolCalls.length - 1].result = errFlag ? { error: resultText } : resultText;
          emit('tool', {
            id: tc.id,
            name: tc.name,
            state: errFlag ? 'error' : 'success',
            result: errFlag ? { error: resultText } : resultText,
          });
          history.push({
            role: 'tool',
            toolCallId: tc.id,
            toolName: tc.name,
            content: resultText,
          });
        } catch (e2) {
          const msg = ((e2 && e2.message) || '工具调用失败').slice(0, 2000);
          finalToolCalls[finalToolCalls.length - 1].result = { error: msg };
          emit('tool', { id: tc.id, name: tc.name, state: 'error', error: msg });
          history.push({
            role: 'tool',
            toolCallId: tc.id,
            toolName: tc.name,
            content: '工具调用错误: ' + msg,
          });
        }
      }
      content = '';
      continue;
    }

    content = result.content || '';
    thinkingText = result.thinking || thinkingText;
    if (result.toolCalls && result.toolCalls.length && !connected.length) {
      // 声明了工具但未连接 MCP——保留 toolCalls 到展示(如供应商内置 web 工具)
      finalToolCalls = finalToolCalls.concat(
        result.toolCalls.map((t) => ({ id: t.id, name: t.name, arguments: typeof t.arguments === 'string' ? t.arguments : JSON.stringify(t.arguments || {}) }))
      );
    }
    break;
  }

  // 6) 持久化
  let messageId = null;
  if (conversationId) {
    try {
      // 追加 assistant 消息
      const ins = await db.run(
        'INSERT INTO chats_messages (conversation_id, role, content, parts, thinking, tool_calls, usage, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          conversationId,
          'assistant',
          content,
          '[]',
          JSON.stringify({ content: thinkingText }),
          JSON.stringify(finalToolCalls),
          JSON.stringify(usage || {}),
          error || '',
          nowIso(),
        ]
      );
      messageId = ins && ins.lastInsertRowid ? Number(ins.lastInsertRowid) : null;
      // 更新会话标题、模型、时间
      const convo = await db.get('SELECT title, model FROM chats_conversations WHERE id = ? AND workspace_id = ?', [conversationId, ws]);
      if (convo && (!convo.model || convo.model !== model)) {
        await db.run('UPDATE chats_conversations SET model = ?, updated_at = ? WHERE id = ? AND workspace_id = ?', [model, nowIso(), conversationId, ws]);
      }
      await db.run('UPDATE chats_conversations SET updated_at = ? WHERE id = ? AND workspace_id = ?', [nowIso(), conversationId, ws]);
    } catch (e) {
      /* 持久化失败不影响流式输出 */
    }
  }

  return { messageId, content, thinking: thinkingText, toolCalls: finalToolCalls, usage, error };
}

function mcpResultText(result) {
  if (!result) return '工具已调用(无返回)';
  const content = Array.isArray(result.content) ? result.content : [];
  const texts = content.map((c) => {
    if (!c) return '';
    if (c.type === 'image') return '[图片: ' + (c.mimeType || 'image') + ']';
    return typeof c.text === 'string' ? c.text : c.type ? JSON.stringify(c) : String(c);
  });
  let out = texts.filter(Boolean).join('\n');
  if (!out && result.structuredContent) out = JSON.stringify(result.structuredContent);
  if (!out && typeof result === 'object') out = JSON.stringify(result).slice(0, 4000);
  return out.slice(0, 6000);
}

function lastUserText(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content || '';
  }
  return '';
}

/* ------------------------------------------------------------
 * 远程附件抓取(输入框"插入文件/图片"的远程 URL 走服务端代理,
 * 规避浏览器 CORS;图片转 dataUri,文本返回 text)
 * ---------------------------------------------------------- */
async function fetchUrlContent(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http(s) 地址');
  const res = await withTimeout(fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }), REQUEST_TIMEOUT_MS);
  if (!res.ok) throw new Error('抓取失败 HTTP ' + res.status);
  const contentType = ((res.headers && res.headers.get ? res.headers.get('content-type') : '') || '').toLowerCase();
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > FETCH_URL_MAX_BYTES) throw new Error('文件超过 5MB 上限');
  if (contentType.indexOf('image/') === 0) {
    const mime = contentType.split(';')[0];
    return { type: 'image', name: url.split('/').pop() || 'image', dataUri: 'data:' + mime + ';base64,' + buffer.toString('base64') };
  }
  return { type: 'file', name: url.split('/').pop() || 'file.txt', content: buffer.toString('utf8').slice(0, 400000) };
}

/** 解析供应商:合并内置目录 / 数据库行 / 解密 key */
async function resolveProvider(db, decrypt, ws, key) {  const row = await db.get('SELECT * FROM chats_providers WHERE key = ? AND workspace_id = ?', [key, ws]);
  if (!row || !row.enabled) {
    // 目录内但尚未入库(如首启未 seed):回退目录
    const c = catalog(key);
    return c ? { key: c.key, name: c.name, type: c.type, baseUrl: c.baseUrl, apiKey: '', models: c.models, local: c.local, vision: c.vision } : null;
  }
  const c = catalog(key) || {};
  return {
    id: row.id,
    key: row.key,
    name: row.name || c.name || row.key,
    type: row.type || c.type || 'openai',
    baseUrl: row.base_url || c.baseUrl || '',
    apiKey: row.api_key ? decrypt(row.api_key) || '' : '',
    models: parseJson(row.models, null) || c.models || [],
    local: !!c.local,
    vision: !!c.vision,
    publicKey: false,
  };
}

module.exports = {
  runChat,
  fetchModels,
  fetchUrlContent,
  connectMcp,
  closeMcp,
  catalog,
  describeProvider,
  PROVIDER_CATALOG,
  toTokens,
  normalizeHistory,
  readSse,
};
