/* ============================================================
 * chat-logic.js — chats 模块·纯逻辑域(无 DOM / 无 App 依赖)
 * ------------------------------------------------------------
 * 可在 Node(node --test)直接测试:
 *   - clampParams / mergeParams:三层参数覆盖(会话 > 供应商 > 全局)
 *   - filterConversations / sortConversations:搜索/过滤/排序
 *   - filterMcpTools:MCP 父子开关(服务器关 → 子工具不注入)
 *   - skillToolIds:技能勾选 ∩ 已启用 MCP 工具
 *   - buildMessagesForSend:历史组装(跳过空占位;用户消息 parts 化)
 *   - previewText / titleFromFirstUser
 * ============================================================ */
'use strict';

export var PARAM_RANGES = {
  temperature: [0, 2],
  topP: [0, 1],
  topK: [0, 1000],
  maxTokens: [1, 2000000],
  presencePenalty: [-2, 2],
  frequencyPenalty: [-2, 2],
};
export var DEFAULT_PARAMS = {
  temperature: 0.7,
  topP: 0.95,
  topK: 0,
  maxTokens: 8192,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

export function clamp(v, min, max, fallback) {
  var n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 白名单钳制:未知参数剔除,maxTokens 取整(1–2000000) */
export function clampParams(raw) {
  var out = {};
  var src = raw && typeof raw === 'object' ? raw : {};
  Object.keys(PARAM_RANGES).forEach(function (key) {
    var v = src[key];
    if (v === undefined || v === null || v === '') return;
    if (key === 'maxTokens') {
      out[key] = Math.round(clamp(Number(v), PARAM_RANGES.maxTokens[0], PARAM_RANGES.maxTokens[1], DEFAULT_PARAMS.maxTokens));
      return;
    }
    var r = PARAM_RANGES[key];
    out[key] = Math.round(clamp(Number(v), r[0], r[1], DEFAULT_PARAMS[key]) * 10000) / 10000;
  });
  return out;
}

/** 三层合并:会话 > 供应商覆盖 > 全局默认 */
export function mergeParams(globalParams, providerOverride, conversationParams) {
  var g = Object.assign({}, DEFAULT_PARAMS, globalParams || {});
  var merged = Object.assign({}, g, providerOverride || {}, conversationParams || {});
  return clampParams(merged);
}

/* ---------- 会话过滤与排序 ---------- */
export function filterConversations(list, opts) {
  var o = opts || {};
  var q = String(o.search || '').trim().toLowerCase();
  return (list || []).filter(function (c) {
    if (c.archived && o.filter !== 'archived') return false;
    if (o.filter === 'favorite' && !c.favorite) return false;
    if (o.filter === 'pinned' && !c.pinned) return false;
    if (o.filter === 'archived' && !c.archived) return false;
    if (o.groupFilter && (c.groupId || '') !== o.groupFilter) {
      // 分组过滤含子孙:命中子孙分组也保留
      var ids = o.groupDescendants || [];
      if (ids.indexOf(c.groupId || '') === -1) return false;
    }
    if (o.tagFilter === '__untagged__') {
      if ((c.tagIds || []).length) return false;
    } else if (o.tagFilter) {
      if ((c.tagIds || []).indexOf(o.tagFilter) === -1) return false;
    }
    if (q) {
      var hay = ((c.title || '') + ' ' + (c.preview || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

export function sortConversations(list) {
  return (list || []).slice().sort(function (a, b) {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
}

/** 分组(含子孙)下未存档会话数 */
export function groupConversationCount(list, groupIds) {
  var n = 0;
  (list || []).forEach(function (c) {
    if (c.archived) return;
    if (groupIds.indexOf(c.groupId || '') !== -1) n++;
  });
  return n;
}

/* ---------- MCP 父子开关 ---------- */
/**
 * 过滤可注入工具:会话总开关 mcpEnabled 关闭 → 全部不注入;
 * 服务器 enabled 关闭 → 该服务器全部工具停用(不注入);
 * 工具级 enabled 默认开,只能在服务器开启时细化。
 * 返回 [{ server, tool }] 有效组合。
 */
export function effectiveMcpTools(servers, mcpEnabled) {
  if (!mcpEnabled) return [];
  var out = [];
  (servers || []).forEach(function (server) {
    if (!server || !server.enabled) return;
    (server.tools || []).forEach(function (tool) {
      if (tool && tool.enabled && tool.name) out.push({ server: server, tool: tool });
    });
  });
  return out;
}

/** 技能勾选的 toolIds ∩ 已启用的 MCP 工具名(父开关约束已由 effectiveMcpTools 保证) */
export function skillToolIds(skill, effectiveList) {
  if (!skill || !Array.isArray(skill.toolIds) || !skill.toolIds.length) return [];
  var names = {};
  effectiveList.forEach(function (e) {
    names[e.tool.name] = true;
  });
  return skill.toolIds.filter(function (id) {
    return names[id];
  });
}

/* ---------- 消息组装 ---------- */
/** 用户消息内容(parts 或字符串)→ parts 数组 */
export function toParts(content) {
  if (typeof content === 'string') {
    return content.trim() ? [{ type: 'text', text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  return content.filter(function (p) {
    return p && p.type === 'text' ? p.text : true;
  });
}

/**
 * 组装发送给服务端的历史消息:
 *   - 跳过流式空占位(无内容无工具无 aborted)
 *   - 用户消息 parts 化(多模态)
 *   - 助手消息携带 toolCalls;工具结果消息携带 toolResult
 */
export function buildMessagesForSend(messages) {
  var out = [];
  (messages || []).forEach(function (m) {
    if (!m || !m.role) return;
    if (m.role === 'assistant') {
      var hasText = typeof m.content === 'string' && m.content.trim();
      var hasTools = Array.isArray(m.toolCalls) && m.toolCalls.length;
      if (!hasText && !hasTools) return; // 空占位
      out.push({ role: 'assistant', content: m.content || '', toolCalls: m.toolCalls || [] });
      return;
    }
    if (m.role === 'user') {
      var parts = toParts(m.content);
      if (!parts.length) return;
      out.push({ role: 'user', content: parts });
      return;
    }
    if (m.role === 'tool') {
      if (!m.toolCallId) return;
      out.push({ role: 'tool', toolCallId: m.toolCallId, toolResult: m.toolResult });
    }
  });
  return out;
}

/** 消息预览文本(最长 limit 字;图片/文件标注) */
export function previewText(message, limit) {
  var n = limit || 120;
  if (!message) return '';
  if (typeof message.content === 'string') return message.content.slice(0, n);
  if (Array.isArray(message.content)) {
    var parts = message.content.filter(function (p) { return p && p.type === 'text' && p.text; });
    if (parts.length) return parts[parts.length - 1].text.slice(0, n);
    if (message.content.some(function (p) { return p && p.type === 'image_url'; })) return '[图片]';
    return '[附件]';
  }
  return '';
}

/** 会话标题:首条用户文本,去换行,最长 30 字 */
export function titleFromFirstUser(messages) {
  for (var i = 0; i < (messages || []).length; i++) {
    var m = messages[i];
    if (m && m.role === 'user') {
      var t = previewText(m, 30).replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
  }
  return '';
}
