/* ============================================================
 * chat-stream-util.js — Chats 模块 SSE 流式·工具执行与消息工具
 * ------------------------------------------------------------
 *   executeTool     按名称匹配「启用服务器 × 启用工具」→ tools/call;
 *                   内置 web_search 走联网搜索;isError 透传失败
 *   collectToolJobs 本轮需要执行的工具(去重按 id)
 *   lastUserText    从历史取最后一条用户文本(联网检索 query)
 *   normalizeMessages 规范化客户端消息(跳过流式空占位)
 *   buildToolDefs   注入函数定义(父子开关 + 内置 web_search)
 * ============================================================ */
'use strict';

const { buildFunctionDef } = require('./chat-llm');
const { mcpCallTool, searchWeb } = require('./chat-mcp');

/**
 * 按名称匹配启用 MCP 服务器中的启用工具 → tools/call;
 * 内置 web_search 走联网搜索模块。返回 { ok, output, error }。
 */
async function executeTool(tool, args, service, streamOpts) {
  // 内置 web_search
  if (tool.name === 'web_search') {
    try {
      const provider = streamOpts.webSearchProvider || 'duckduckgo';
      const keys = service.secrets.searchKeys || {};
      const results = await searchWeb(provider, String(args.query || args.q || ''), keys, streamOpts.searchResults || 5);
      return { ok: true, output: JSON.stringify(results, null, 2) };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }
  // MCP 工具:匹配「启用服务器 × 启用工具」
  const mcp = service.config.mcp || [];
  for (const server of mcp) {
    if (!server.enabled) continue;
    const toolDef = (server.tools || []).filter(function (t) { return t.name === tool.name; })[0];
    if (!toolDef || !toolDef.enabled) continue;
    try {
      const r = await mcpCallTool(
        { url: server.url, protocol: server.protocol || 'https', apiKey: server.apiKey, authHeader: server.authHeader, headers: server.headers },
        tool.name,
        args
      );
      return { ok: !r.isError, output: r.output, error: r.isError ? r.output : '' };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }
  return { ok: false, error: '工具不可用:' + tool.name + '(服务器未启用或工具未启用)' };
}

/** 收集本轮需要执行的工具(去重按 id) */
function collectToolJobs(toolCalls) {
  const jobs = [];
  const seen = {};
  (toolCalls || []).forEach(function (tc) {
    if (!tc.id || seen[tc.id]) return;
    seen[tc.id] = true;
    jobs.push({ id: tc.id, name: tc.name, args: tc.args || {} });
  });
  return jobs;
}

/** 从历史消息取最后一条用户文本(用于联网检索 query) */
function lastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content.slice(0, 300);
    if (Array.isArray(m.content)) {
      const parts = m.content.filter(function (p) { return p && p.type === 'text' && p.text; });
      if (parts.length) return parts[parts.length - 1].text.slice(0, 300);
    }
  }
  return '';
}

/** 规范化客户端消息(跳过流式空占位 / 空内容) */
function normalizeMessages(messages) {
  const out = [];
  (Array.isArray(messages) ? messages : []).forEach(function (m) {
    if (!m || typeof m !== 'object' || !m.role) return;
    if (m.role === 'assistant') {
      // 跳过流式空占位(无内容无工具)
      const hasText = typeof m.content === 'string' && m.content.trim();
      const hasTools = Array.isArray(m.toolCalls) && m.toolCalls.length;
      if (!hasText && !hasTools && !m.aborted) return;
      const copy = { role: 'assistant', content: m.content || '' };
      if (m.toolCalls) copy.toolCalls = m.toolCalls;
      out.push(copy);
      return;
    }
    if (m.role === 'user') {
      const hasText = typeof m.content === 'string' ? m.content.trim() : Array.isArray(m.content) && m.content.length;
      if (!hasText) return;
      out.push({ role: 'user', content: m.content });
      return;
    }
    if (m.role === 'tool') {
      if (!m.toolCallId) return;
      out.push({ role: 'tool', toolCallId: m.toolCallId, toolResult: m.toolResult });
    }
  });
  return out;
}

/** 工具定义:启用 MCP 服务器 × 启用工具(父子开关) + 内置 web_search */
function buildToolDefs(config, mcpEnabled, webSearch) {
  const tools = [];
  if (webSearch) {
    tools.push(buildFunctionDef('web_search', '搜索互联网获取最新信息,返回相关网页结果列表', {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索查询关键词' } },
      required: ['query'],
    }));
  }
  if (!mcpEnabled) return tools;
  const servers = (config.mcp || []).filter(function (s) { return s.enabled; });
  servers
    .slice()
    .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
    .forEach(function (server) {
      (server.tools || []).forEach(function (t) {
        if (!t.enabled || !t.name) return;
        tools.push(buildFunctionDef(t.name, t.description || '', t.inputSchema || { type: 'object', properties: {}, additionalProperties: true }));
      });
    });
  return tools;
}

module.exports = {
  executeTool,
  collectToolJobs,
  lastUserText,
  normalizeMessages,
  buildToolDefs,
};
