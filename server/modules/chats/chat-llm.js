/* ============================================================
 * chat-llm.js — Chats 模块纯逻辑:参数合并/钳制、消息协议翻译
 * ------------------------------------------------------------
 * 无 IO 纯函数,供 service / stream 与测试直接复用:
 *   - clampParams / mergeParams:三层参数合并与白名单钳制
 *     (会话 > 供应商覆盖 > 全局默认)
 *   - buildSystemPrompt:技能/提示词/联网检索上下文组装
 *   - buildOpenAIBody / buildAnthropicBody:消息与参数翻译
 *     (openai chat/completions 与 anthropic messages 协议)
 *   - collectToolCalls / parseUsage:响应解析
 * ============================================================ */
'use strict';

const { PARAM_RANGES, DEFAULT_PARAMS, THINKING_BUDGET, PROVIDER_OVERRIDES, clamp } = require('./chat-shared');

/* ---------- 参数合并与钳制 ---------- */
/** 白名单钳制:未知参数剔除,maxTokens 走 1–2000000 */
function clampParams(raw) {
  const out = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  Object.keys(PARAM_RANGES).forEach(function (key) {
    const v = src[key];
    if (v === undefined || v === null || v === '') return;
    if (key === 'maxTokens') {
      out[key] = Math.round(clamp(Number(v), PARAM_RANGES.maxTokens[0], PARAM_RANGES.maxTokens[1], DEFAULT_PARAMS.maxTokens));
      return;
    }
    const r = PARAM_RANGES[key];
    out[key] = clamp(Number(v), r[0], r[1], DEFAULT_PARAMS[key]);
    // 浮点收敛(温度/topP/topK 等)
    out[key] = Math.round(out[key] * 10000) / 10000;
  });
  return out;
}

/**
 * 三层合并(展示层级:全局默认 → 供应商覆盖 → 会话):
 * 最终生效 = { ...全局默认, ...供应商覆盖[providerId], ...会话 params }
 */
function mergeParams(globalParams, providerId, conversationParams) {
  const g = Object.assign({}, DEFAULT_PARAMS, globalParams || {});
  const ov = PROVIDER_OVERRIDES[providerId] || {};
  const merged = Object.assign({}, g, ov, conversationParams || {});
  return clampParams(merged);
}

/* ---------- 系统提示词组装 ---------- */
/** 取生效提示词文本:技能优先(promptId 映射),否则提示词库 */
function resolveSystemPrompt(config, promptId, skillId) {
  // 技能优先:传入 skillId 时用技能 systemPrompt(默认技能 general 也会命中)
  const skills = config.skills || [];
  const skill = skills.filter(function (s) { return s.id === (skillId || 'general'); })[0];
  if (skill && skill.systemPrompt) return skill.systemPrompt;
  const prompts = config.prompts || [];
  const p = prompts.filter(function (x) { return x.id === (promptId || 'general'); })[0];
  return (p && p.content) || '';
}

/** 联网检索结果 → 附加上下文文本 */
function buildSearchContext(results) {
  if (!Array.isArray(results) || !results.length) return '';
  const lines = ['以下是针对用户问题的联网搜索结果(可能包含过时或不准确信息,请以批判性眼光使用):'];
  results.forEach(function (r, i) {
    lines.push(
      (i + 1) + '. ' + (r.title || '') + '\n   链接: ' + (r.url || '') + '\n   摘要: ' + (r.snippet || r.content || '')
    );
  });
  return lines.join('\n');
}

/**
 * 组装最终系统提示词:技能/提示词内容 + 可选联网检索上下文
 */
function buildSystemPrompt(config, promptId, skillId, searchResults) {
  const base = resolveSystemPrompt(config, promptId, skillId);
  const ctx = buildSearchContext(searchResults);
  if (!ctx) return base;
  return base ? base + '\n\n' + ctx : ctx;
}

/* ---------- 工具定义构建 ---------- */
/** 注入函数定义:{type:'function', function:{name, description, parameters}} */
function buildFunctionDef(name, description, schema) {
  return {
    type: 'function',
    function: {
      name: name,
      description: description || '',
      parameters: schema || { type: 'object', properties: {}, additionalProperties: true },
    },
  };
}

/* ---------- 消息翻译 ---------- */
/**
 * 内部消息模型:
 *   { role: 'system'|'user'|'assistant', content: string|Array, toolCalls?: [...],
 *     toolResult?: { id, name, ok, output, error } }
 * 附件部分: { type:'text', text } | { type:'image_url', image_url:{ url } }
 *           | { type:'file', name, size, text? }
 */
/** 用户消息 parts → OpenAI content 数组(多模态) */
function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  content.forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    if (p.type === 'image_url') {
      parts.push({ type: 'image_url', image_url: { url: p.url || '' } });
    } else if (p.type === 'file') {
      // 文本类文件全文已拼入 text;非文本文件仅提示名称
      if (p.text) parts.push({ type: 'text', text: '【文件 ' + p.name + '】\n' + p.text });
      else parts.push({ type: 'text', text: '【文件 ' + (p.name || '附件') + '】' + ((p.size != null ? ' (大小 ' + p.size + ')' : '')) });
    } else {
      parts.push({ type: 'text', text: String(p.text || '') });
    }
  });
  return parts.filter(function (p) { return p.type !== 'text' || p.text; });
}

/** 用户消息 parts → Anthropic content 块(base64 image / text) */
function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const blocks = [];
  content.forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    if (p.type === 'image_url') {
      const url = p.url || '';
      const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(url);
      if (m) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
      } else {
        blocks.push({ type: 'text', text: '![image](' + url + ')' });
      }
    } else if (p.type === 'file') {
      if (p.text) blocks.push({ type: 'text', text: '【文件 ' + p.name + '】\n' + p.text });
      else blocks.push({ type: 'text', text: '【文件 ' + (p.name || '附件') + '】' });
    } else {
      blocks.push({ type: 'text', text: String(p.text || '') });
    }
  });
  return blocks;
}

/** 历史消息 → OpenAI 消息数组(tool_calls / tool 结果完整保留) */
function toOpenAIMessages(messages) {
  const out = [];
  (messages || []).forEach(function (m) {
    if (!m || typeof m !== 'object') return;
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
      out.push({
        role: 'assistant',
        content: typeof m.content === 'string' ? m.content : '',
        tool_calls: m.toolCalls.map(function (tc) {
          return {
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}) },
          };
        }),
      });
      return;
    }
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId || '',
        content: m.toolResult && m.toolResult.ok === false
          ? '工具执行失败: ' + (m.toolResult.error || '未知错误')
          : (m.toolResult && m.toolResult.output) || '',
      });
      return;
    }
    out.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.role === 'user' ? toOpenAIContent(m.content) : typeof m.content === 'string' ? m.content : '',
    });
  });
  return out;
}

/** 历史消息 → Anthropic 消息数组(text/image/tool_use/tool_result 块) */
function toAnthropicMessages(messages) {
  const out = [];
  let toolResultBuffer = []; // 同一 user 消息内合并多个 tool_result
  function flushToolResults() {
    if (!toolResultBuffer.length) return;
    out.push({ role: 'user', content: toolResultBuffer });
    toolResultBuffer = [];
  }
  (messages || []).forEach(function (m) {
    if (!m || typeof m !== 'object') return;
    if (m.role === 'assistant') {
      flushToolResults();
      const content = [];
      const text = typeof m.content === 'string' ? m.content : '';
      if (text) content.push({ type: 'text', text: text });
      (m.toolCalls || []).forEach(function (tc) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args || {} });
      });
      out.push({ role: 'assistant', content: content });
      return;
    }
    if (m.role === 'tool') {
      const r = m.toolResult || {};
      toolResultBuffer.push({
        type: 'tool_result',
        tool_use_id: m.toolCallId || '',
        content: r.ok === false ? (r.error || '工具执行失败') : (r.output || ''),
        is_error: r.ok === false,
      });
      return;
    }
    flushToolResults();
    out.push({ role: 'user', content: toAnthropicContent(m.content) });
  });
  flushToolResults();
  return out;
}

/** OpenAI 流式 chunk → { deltaText, toolCalls, finishReason, usage } */
function parseOpenAIChunk(chunk) {
  if (!chunk || typeof chunk !== 'object') return null;
  if (chunk.choices && chunk.choices.length) {
    const c = chunk.choices[0];
    const delta = c.delta || {};
    return {
      deltaText: typeof delta.content === 'string' ? delta.content : '',
      reasoningText: typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '',
      toolCalls: Array.isArray(delta.tool_calls) ? delta.tool_calls : null,
      finishReason: c.finish_reason || '',
    };
  }
  return null;
}

/** Anthropic 流式 chunk → { deltaText, thinking, toolUse, contentBlockStart... } 原始块 */
function classifyAnthropicBlock(block) {
  if (!block || typeof block !== 'object') return { type: 'other', block: block };
  const t = block.type;
  if (t === 'content_block_delta') {
    const d = block.delta || {};
    if (d.type === 'text_delta') return { type: 'text_delta', text: d.text || '' };
    if (d.type === 'thinking_delta') return { type: 'thinking_delta', text: d.thinking || '' };
    if (d.type === 'input_json_delta') return { type: 'tool_arg_delta', text: d.partial_json || '' };
  }
  if (t === 'content_block_start') {
    const b = block.content_block || {};
    if (b.type === 'tool_use') {
      return { type: 'tool_use_start', id: b.id || '', name: b.name || '' };
    }
  }
  if (t === 'content_block_stop') return { type: 'block_stop' };
  if (t === 'message_delta') {
    const d = block.delta || {};
    return { type: 'message_delta', finishReason: (d.stop_reason || ''), usage: block.usage || null };
  }
  if (t === 'message_start') return { type: 'message_start', message: block.message || null };
  if (t === 'message_stop') return { type: 'message_stop' };
  return { type: 'other', block: block };
}

/** 供应商是否支持多模态(内置目录 + 自定义默认 false) */
function providerMultimodal(provider) {
  if (!provider) return false;
  if (typeof provider.multimodal === 'boolean') return provider.multimodal;
  return false;
}

module.exports = {
  clampParams,
  mergeParams,
  resolveSystemPrompt,
  buildSearchContext,
  buildSystemPrompt,
  buildFunctionDef,
  toOpenAIContent,
  toAnthropicContent,
  toOpenAIMessages,
  toAnthropicMessages,
  parseOpenAIChunk,
  classifyAnthropicBlock,
  providerMultimodal,
};
