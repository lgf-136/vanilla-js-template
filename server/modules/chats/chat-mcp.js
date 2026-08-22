/* ============================================================
 * chat-mcp.js — Chats 模块 MCP 客户端(零依赖)与联网搜索
 * ------------------------------------------------------------
 * MCP(零依赖实现):
 *   - 'https' = Streamable HTTP:POST JSON-RPC 2.0,Mcp-Session-Id 维持会话,
 *     响应 JSON 或 SSE 两种形态均可解析
 *   - 'sse'   = 先 GET 建立 SSE 通道取 endpoint(POST URL),再 POST JSON-RPC,
 *     响应经 SSE message 事件回传(兼容 2025-03-26 协议版本)
 *   - 流程:initialize(protocolVersion 2025-03-26)→ tools/list → tools/call
 * 联网搜索(duckduckgo 免 Key;serper/tavily/bing/google 需 secrets.searchKeys):
 *   统一返回 [{ title, url, snippet }]
 * ============================================================ */
'use strict';

const { getHeader } = require('./chat-shared');

/* ---------- SSE 块解析(兼容 \r\n / \r / \n 行尾与 BOM) ---------- */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
function parseSseBlock(block) {
  const ev = { event: 'message', data: '', id: '', retry: null };
  stripBom(block)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .forEach(function (line) {
      if (!line || line[0] === ':') return; // 注释 / 空行
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') ev.event = value;
      else if (field === 'data') ev.data = ev.data ? ev.data + '\n' + value : value;
      else if (field === 'id') ev.id = value;
      else if (field === 'retry') ev.retry = parseInt(value, 10) || null;
    });
  return ev;
}

/** 从响应体异步迭代 SSE 事件 */
async function* readSseEvents(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        yield parseSseBlock(buf.slice(0, idx));
        buf = buf.slice(idx + 2);
      }
    }
    const tail = decoder.decode();
    if (tail) buf += tail;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      yield parseSseBlock(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
    if (buf.trim()) yield parseSseBlock(buf);
  } finally {
    reader.releaseLock();
  }
}

/* ---------- 请求头组装 ---------- */
/** 自定义 headers + API Key(Bearer → Authorization,或自定义鉴权头) */
function buildMcpHeaders(cfg) {
  const headers = {};
  const custom = cfg.headers && typeof cfg.headers === 'object' ? cfg.headers : {};
  Object.keys(custom).forEach(function (k) {
    if (k && k.toLowerCase() !== 'authorization') headers[k] = String(custom[k]);
  });
  if (cfg.apiKey) {
    const authName = (cfg.authHeader && cfg.authHeader.trim()) || 'Authorization';
    headers[authName] = String(cfg.apiKey).indexOf('Bearer ') === 0 ? cfg.apiKey : 'Bearer ' + cfg.apiKey;
  }
  return headers;
}

/* ---------- 会话式 JSON-RPC 客户端 ---------- */
let RPC_ID = 0;
function nextId() {
  return ++RPC_ID;
}

function jsonRpc(payload, postUrl, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs || 60000);
  return fetch(postUrl, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, headers),
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).finally(function () {
    clearTimeout(timer);
  });
}

/**
 * 执行一次 MCP 请求(按需建立会话):返回 JSON-RPC 响应对象 { result } 或抛错。
 * cfg: { url, protocol, apiKey, authHeader, headers }
 */
async function mcpRequest(cfg, method, params, session) {
  const headers = buildMcpHeaders(cfg);
  if (session && session.id) headers['Mcp-Session-Id'] = session.id;
  const payload = { jsonrpc: '2.0', id: nextId(), method: method, params: params || {} };
  const res = await jsonRpc(payload, cfg.url, headers, 60000);
  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    throw new Error('MCP HTTP ' + res.status + ': ' + text.slice(0, 300));
  }
  const sessionHeader = res.headers.get('mcp-session-id');
  if (sessionHeader) session.id = sessionHeader;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.indexOf('text/event-stream') !== -1) {
    if (!res.body) throw new Error('MCP 响应体为空');
    for await (const ev of readSseEvents(res.body)) {
      if (ev.event === 'message' && ev.data) {
        const j = JSON.parse(ev.data);
        if (j && j.id === payload.id) return j;
      }
    }
    throw new Error('MCP SSE 响应超时(' + method + ')');
  }
  const text = await res.text();
  if (!text.trim()) throw new Error('MCP 空响应(' + method + ')');
  const j = JSON.parse(text);
  return j && j.id === payload.id ? j : j;
}

/** 校验 JSON-RPC 响应:有 result 返回 result,有 error 抛错 */
function unwrapRpc(resp) {
  if (!resp) throw new Error('MCP 无响应');
  if (resp.error) {
    throw new Error('MCP 错误 ' + (resp.error.code || '') + ': ' + (resp.error.message || 'unknown'));
  }
  return resp.result;
}

/** 完整会话流程:initialize → 业务请求序列(共享同一 session) */
async function mcpSession(cfg, requests) {
  const session = { id: null };
  const init = await mcpRequest(
    cfg,
    'initialize',
    {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'one-api-chat', version: '1.0.0' },
    },
    session
  );
  const initResult = unwrapRpc(init);
  // 会话能力协商:服务器协议版本取交集(简化:采用服务器版本)
  session.protocolVersion = (initResult && initResult.protocolVersion) || '2025-03-26';
  // 通知服务器 initialized(尽力而为,失败忽略)
  try {
    await mcpRequest(cfg, 'notifications/initialized', {}, session);
  } catch (e) {
    /* noop */
  }
  const out = [];
  for (const req of requests) {
    const r = await mcpRequest(cfg, req.method, req.params, session);
    out.push(unwrapRpc(r));
  }
  return out;
}

/**
 * sse 协议:先 GET 建立 SSE 通道取 endpoint,再 POST JSON-RPC,
 * 响应经 SSE message 事件回传。
 */
async function mcpSseRequest(cfg, requests) {
  const headers = Object.assign({ Accept: 'text/event-stream' }, buildMcpHeaders(cfg));
  const res = await fetch(cfg.url, { method: 'GET', headers: headers });
  if (!res.ok || !res.body) {
    throw new Error('MCP SSE 连接失败 HTTP ' + (res.status || 0));
  }
  const channel = {
    postUrl: cfg.url,
    sessionId: null,
    waiters: new Map(),
    payloads: [],
  };
  // 后台消费 SSE 流:endpoint 事件取 POST URL;message 事件按 id 分发
  const pump = (async function () {
    try {
      for await (const ev of readSseEvents(res.body)) {
        if (ev.event === 'endpoint' && ev.data) {
          channel.postUrl = ev.data.trim();
          // 通道就绪后补发积压的 POST
          const pending = channel.payloads.splice(0);
          pending.forEach(function (p) {
            postAndWait(p).catch(function (e) {
              const w = channel.waiters.get(p.payload.id);
              if (w) {
                channel.waiters.delete(p.payload.id);
                w({ error: { message: String(e.message || e) } });
              }
            });
          });
        } else if (ev.event === 'message' && ev.data) {
          let j = null;
          try {
            j = JSON.parse(ev.data);
          } catch (e) {
            continue;
          }
          if (j && j.id && channel.waiters.has(j.id)) {
            channel.waiters.get(j.id)(j);
            channel.waiters.delete(j.id);
          }
        }
      }
    } catch (e) {
      /* 流结束 */
    }
    channel.waiters.forEach(function (resolve) {
      resolve({ error: { message: 'MCP SSE 通道已关闭' } });
    });
    channel.waiters.clear();
  })();

  function postAndWait(entry) {
    const payload = entry.payload;
    const h = Object.assign({ 'Content-Type': 'application/json' }, headers);
    if (channel.sessionId) h['Mcp-Session-Id'] = channel.sessionId;
    return jsonRpc(payload, channel.postUrl, h, 60000)
      .then(function (resp) {
        const sh = resp.headers.get('mcp-session-id');
        if (sh) channel.sessionId = sh;
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('text/event-stream') !== -1) {
          return consumeSseResponse(resp.body, payload.id);
        }
        return resp.text().then(function (t) {
          return t.trim() ? JSON.parse(t) : null;
        });
      })
      .then(function (j) {
        if (j) {
          const w = channel.waiters.get(payload.id);
          if (w) {
            channel.waiters.delete(payload.id);
            w(j);
          }
          return j;
        }
        // 空响应:等 SSE 通道 message 事件
        return new Promise(function (resolve) {
          const timer = setTimeout(function () {
            channel.waiters.delete(payload.id);
            resolve({ error: { message: 'MCP SSE 响应超时' } });
          }, 60000);
          channel.waiters.set(payload.id, function (j) {
            clearTimeout(timer);
            resolve(j);
          });
        });
      })
      .catch(function (e) {
        return { error: { message: String(e.message || e) } };
      });
  }

  async function consumeSseResponse(body, id) {
    for await (const ev of readSseEvents(body)) {
      if (ev.event === 'message' && ev.data) {
        const j = JSON.parse(ev.data);
        if (j && j.id === id) return j;
      }
    }
    return null;
  }

  const session = { id: '' };
  // 第一步:initialize(POST 可能早于 endpoint 事件,先发出去由通道补发)
  const initPayload = {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'one-api-chat', version: '1.0.0' } },
  };
  const initEntry = { payload: initPayload };
  channel.payloads.push(initEntry);
  const initRpc = postAndWait(initEntry);
  const init = await initRpc;
  const initResult = unwrapRpc(init);
  session.id = channel.sessionId || '';

  const out = [initResult];
  for (const req of requests) {
    const payload = { jsonrpc: '2.0', id: nextId(), method: req.method, params: req.params || {} };
    const entry = { payload: payload };
    channel.payloads.push(entry);
    const r = await postAndWait(entry);
    out.push(unwrapRpc(r));
  }
  try {
    channel.reader && channel.reader.cancel();
  } catch (e) {
    /* noop */
  }
  void pump;
  return out;
}

/** 统一入口:按协议分发 https / sse */
async function mcpRun(cfg, requests) {
  if (cfg.protocol === 'sse') {
    const out = await mcpSseRequest(cfg, requests);
    return out[out.length - 1];
  }
  const out = await mcpSession(cfg, requests);
  return out[out.length - 1];
}

/** 拉取 MCP 服务器工具列表:返回 [{name, description, inputSchema}] */
async function mcpListTools(cfg) {
  const result = await mcpRun(cfg, [{ method: 'tools/list', params: {} }]);
  return (result && Array.isArray(result.tools) ? result.tools : []).map(function (t) {
    return {
      name: t.name || '',
      description: t.description || '',
      inputSchema: t.inputSchema || null,
    };
  });
}

/** 调用 MCP 工具:返回 { output, isError } */
async function mcpCallTool(cfg, name, args) {
  const result = await mcpRun(cfg, [{ method: 'tools/call', params: { name: name, arguments: args || {} } }]);
  const isError = !!(result && result.isError);
  const content = (result && Array.isArray(result.content) ? result.content : [])
    .map(function (c) {
      if (!c || typeof c !== 'object') return '';
      if (c.type === 'text') return c.text || '';
      if (c.type === 'image') return '[图片结果]';
      return JSON.stringify(c);
    })
    .join('\n');
  return { output: content, isError: isError };
}

/* ============================================================
 * 联网搜索(零依赖;duckduckgo 免 Key,其余经 secrets.searchKeys)
 * ============================================================ */
async function searchWeb(provider, query, keys, count) {
  const q = String(query || '').slice(0, 300);
  const n = Math.min(Math.max(Number(count) || 5, 1), 10);
  if (provider === 'duckduckgo') return searchDuckDuckGo(q, n);
  if (provider === 'serper') return searchSerper(q, n, keys);
  if (provider === 'tavily') return searchTavily(q, n, keys);
  if (provider === 'bing') return searchBing(q, n, keys);
  if (provider === 'google') return searchGoogle(q, n, keys);
  throw new Error('未知搜索供应商: ' + provider);
}

async function searchDuckDuckGo(q, n) {
  const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; one-api-chat/1.0)' },
  });
  const text = await res.text();
  const out = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const reSnip = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const snips = [];
  let m;
  while ((m = reSnip.exec(text)) && snips.length < n) {
    snips.push(stripHtml(m[1]));
  }
  let i = 0;
  while ((m = re.exec(text)) && out.length < n) {
    const title = stripHtml(m[2]);
    let url = decodeDdgUrl(m[1]);
    if (!url) continue;
    out.push({ title: title, url: url, snippet: snips[i] || '' });
    i++;
  }
  return out;
}
function decodeDdgUrl(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    if (u.hostname === 'duckduckgo.com' && u.searchParams.get('uddg')) {
      return u.searchParams.get('uddg');
    }
    return u.href;
  } catch (e) {
    return href;
  }
}
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .trim();
}

function requireKey(keys, name, providerLabel) {
  const k = keys && keys[name];
  if (!k) throw new Error(providerLabel + ' 需要 API Key(请在 参数设置 → 搜索密钥 中配置)');
  return k;
}

async function searchSerper(q, n, keys) {
  const key = requireKey(keys, 'serper', 'Serper');
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: q, num: n }),
  });
  if (!res.ok) throw new Error('Serper HTTP ' + res.status);
  const j = await res.json();
  return (j.organic || []).slice(0, n).map(function (r) {
    return { title: r.title || '', url: r.link || '', snippet: r.snippet || '' };
  });
}

async function searchTavily(q, n, keys) {
  const key = requireKey(keys, 'tavily', 'Tavily');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query: q, max_results: n }),
  });
  if (!res.ok) throw new Error('Tavily HTTP ' + res.status);
  const j = await res.json();
  return (j.results || []).slice(0, n).map(function (r) {
    return { title: r.title || '', url: r.url || '', snippet: r.content || '' };
  });
}

async function searchBing(q, n, keys) {
  const key = requireKey(keys, 'bing', 'Bing');
  const res = await fetch('https://api.bing.microsoft.com/v7.0/search?q=' + encodeURIComponent(q) + '&count=' + n, {
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
  if (!res.ok) throw new Error('Bing HTTP ' + res.status);
  const j = await res.json();
  return (j.webPages && j.webPages.value || []).slice(0, n).map(function (r) {
    return { title: r.name || '', url: r.url || '', snippet: r.snippet || '' };
  });
}

async function searchGoogle(q, n, keys) {
  const key = requireKey(keys, 'google', 'Google Custom Search');
  const cx = keys && keys.googleCx;
  if (!cx) throw new Error('Google 搜索需要配置 googleCx(Custom Search Engine ID)');
  const url =
    'https://www.googleapis.com/customsearch/v1?key=' + encodeURIComponent(key) + '&cx=' + encodeURIComponent(cx) + '&num=' + n + '&q=' + encodeURIComponent(q);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Google HTTP ' + res.status);
  const j = await res.json();
  return (j.items || []).slice(0, n).map(function (r) {
    return { title: r.title || '', url: r.link || '', snippet: r.snippet || '' };
  });
}

module.exports = {
  mcpListTools,
  mcpCallTool,
  mcpRun,
  searchWeb,
  stripHtml,
  parseSseBlock,
};
