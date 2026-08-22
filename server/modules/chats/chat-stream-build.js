/* ============================================================
 * chat-stream-build.js — Chats 模块 SSE 流式·请求构建与单轮消费
 * ------------------------------------------------------------
 * 纯逻辑/IO 边界:
 *   - 供应商协议请求构建(kind: openai / anthropic)
 *   - 上游 fetch 可迭代 SSE 行读取(signal 中止)
 *   - 单轮补全执行 runCompletionTurn → 解析增量 → emit 事件
 * 与 chat-stream.js(缓冲/主流程)解耦,便于单元测试。
 * ============================================================ */
'use strict';

const { THINKING_BUDGET, clamp } = require('./chat-shared');
const { toOpenAIMessages, toAnthropicMessages, parseOpenAIChunk, classifyAnthropicBlock } = require('./chat-llm');

/** 推理模型判断(openai 形态 reasoning_effort 映射) */
function isReasoningModel(model) {
  return /\b(o[0-9]|o[0-9]-mini|deepseek-reasoner|r1|thinking|reasoner|glm-z1|z1)\b/i.test(String(model || ''));
}

function buildOpenAIRequest(provider, apiKey, opts) {
  const body = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    temperature: opts.params.temperature,
    top_p: opts.params.topP,
    max_tokens: opts.params.maxTokens,
  };
  if (opts.params.topK) body.top_k = opts.params.topK;
  if (opts.params.presencePenalty) body.presence_penalty = opts.params.presencePenalty;
  if (opts.params.frequencyPenalty) body.frequency_penalty = opts.params.frequencyPenalty;
  if (opts.tools && opts.tools.length) {
    body.tools = opts.tools;
    body.tool_choice = 'auto';
  }
  if (opts.thinking !== 'none' && isReasoningModel(opts.model)) {
    // 推理模型:按档位映射 reasoning_effort(o 系)或直接启用
    const effortMap = { low: 'low', medium: 'medium', high: 'high', max: 'high' };
    body.reasoning_effort = effortMap[opts.thinking] || 'medium';
  }
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  return { url: provider.baseUrl.replace(/\/+$/, '') + '/chat/completions', headers: headers, body: body };
}

function buildAnthropicRequest(provider, apiKey, opts) {
  const budget = THINKING_BUDGET[opts.thinking] || 0;
  const body = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: Math.max(Math.round(opts.params.maxTokens || 8192), budget + 1024),
    stream: true,
    temperature: clamp(opts.params.temperature, 0, 1, 0.7),
  };
  if (opts.system) body.system = opts.system;
  if (opts.tools && opts.tools.length) {
    body.tools = opts.tools.map(function (t) {
      return { name: t.function.name, description: t.function.description, input_schema: t.function.parameters };
    });
    body.tool_choice = { type: 'auto' };
  }
  if (budget > 0) {
    body.thinking = { type: 'enabled', budget_tokens: budget };
  }
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (apiKey) headers['x-api-key'] = apiKey;
  return { url: provider.baseUrl.replace(/\/+$/, '') + '/messages', headers: headers, body: body };
}

/** 请求上游并返回可迭代 SSE 数据行;signal 用于中止 */
async function fetchProviderStream(url, headers, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
    signal: signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    const err = new Error(text.slice(0, 400) || ('上游 HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  if (!res.body) throw new Error('上游响应体为空');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  return {
    next: async function () {
      for (;;) {
        const nl = buf.indexOf('\n');
        if (nl !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          return { done: false, line: line.replace(/\r$/, '') };
        }
        const { done, value } = await reader.read();
        if (done) {
          if (buf.trim()) {
            const line = buf;
            buf = '';
            return { done: false, line: line };
          }
          return { done: true, line: '' };
        }
        buf += decoder.decode(value, { stream: true });
      }
    },
    cancel: function () {
      try {
        reader.cancel();
      } catch (e) {
        /* noop */
      }
    },
  };
}

/* ============================================================
 * 单轮提供商调用 → SSE 事件
 * ============================================================ */
/**
 * 执行一轮补全,返回 { finishReason, usage, toolCalls }。
 * ctx: { emit(eventPayload), nextId(), signal, aborted }
 */
async function runCompletionTurn(provider, apiKey, request, ctx) {
  const stream = await fetchProviderStream(request.url, request.headers, request.body, ctx.signal);
  try {
    if (provider.kind === 'anthropic') {
      return await consumeAnthropic(stream, ctx);
    }
    return await consumeOpenAI(stream, ctx);
  } finally {
    stream.cancel();
  }
}

async function consumeOpenAI(stream, ctx) {
  const toolAcc = {}; // index -> { id, name, args }
  let finishReason = '';
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  for (;;) {
    const r = await stream.next();
    if (r.done || ctx.aborted()) break;
    const line = r.line;
    if (!line || line.indexOf('data:') !== 0) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') break;
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch (e) {
      continue;
    }
    const p = parseOpenAIChunk(chunk);
    if (!p) continue;
    if (p.reasoningText) ctx.emit({ type: 'thinking', text: p.reasoningText });
    if (p.deltaText) ctx.emit({ type: 'delta', text: p.deltaText });
    if (p.toolCalls) {
      p.toolCalls.forEach(function (tc) {
        const idx = tc.index != null ? tc.index : 0;
        const acc = (toolAcc[idx] = toolAcc[idx] || { id: '', name: '', args: '' });
        if (tc.id) {
          acc.id = tc.id;
          if (!acc._started) {
            acc._started = true;
            ctx.emit({ type: 'tool_start', id: tc.id, name: tc.function && tc.function.name ? tc.function.name : acc.name });
          }
        }
        if (tc.function && tc.function.name) acc.name = tc.function.name;
        if (tc.function && typeof tc.function.arguments === 'string') {
          acc.args += tc.function.arguments;
          ctx.emit({ type: 'tool_arg', id: acc.id, text: tc.function.arguments });
        }
      });
    }
    if (p.finishReason) finishReason = p.finishReason;
    if (chunk.usage) {
      usage.promptTokens += chunk.usage.prompt_tokens || 0;
      usage.completionTokens += chunk.usage.completion_tokens || 0;
      usage.totalTokens += chunk.usage.total_tokens || 0;
    }
  }
  const toolCalls = Object.keys(toolAcc)
    .sort(function (a, b) { return Number(a) - Number(b); })
    .map(function (k) {
      const t = toolAcc[k];
      let args = {};
      try {
        args = JSON.parse(t.args || '{}');
      } catch (e) {
        args = { _raw: t.args };
      }
      ctx.emit({ type: 'tool_end', id: t.id, name: t.name, args: args });
      return { id: t.id, name: t.name, args: args };
    })
    .filter(function (t) { return t.id && t.name; });
  return { finishReason: finishReason, usage: usage, toolCalls: toolCalls };
}

async function consumeAnthropic(stream, ctx) {
  const blocks = {}; // blockIndex -> { id, name, args, type }
  let finishReason = '';
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let current = null;
  for (;;) {
    const r = await stream.next();
    if (r.done || ctx.aborted()) break;
    const line = r.line;
    if (!line || line.indexOf('data:') !== 0) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') break;
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch (e) {
      continue;
    }
    if (chunk.type === 'message_start' && chunk.message && chunk.message.usage) {
      const u = chunk.message.usage;
      usage.promptTokens += u.input_tokens || 0;
      usage.completionTokens += u.output_tokens || 0;
      usage.totalTokens = usage.promptTokens + usage.completionTokens;
      continue;
    }
    const c = classifyAnthropicBlock(chunk);
    if (c.type === 'text_delta') {
      ctx.emit({ type: 'delta', text: c.text });
    } else if (c.type === 'thinking_delta') {
      ctx.emit({ type: 'thinking', text: c.text });
    } else if (c.type === 'tool_use_start') {
      current = { index: chunk.index, id: c.id, name: c.name, args: '' };
      blocks[chunk.index] = current;
      ctx.emit({ type: 'tool_start', id: c.id, name: c.name });
    } else if (c.type === 'tool_arg_delta') {
      const b = blocks[chunk.index] || current;
      if (b) {
        b.args += c.text;
        ctx.emit({ type: 'tool_arg', id: b.id, text: c.text });
      }
    } else if (c.type === 'message_delta') {
      if (c.finishReason) finishReason = c.finishReason;
      if (c.usage && c.usage.output_tokens) {
        usage.completionTokens = c.usage.output_tokens;
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
      }
    }
  }
  const toolCalls = Object.keys(blocks)
    .sort(function (a, b) { return Number(a) - Number(b); })
    .map(function (k) {
      const t = blocks[k];
      let args = {};
      try {
        args = JSON.parse(t.args || '{}');
      } catch (e) {
        args = { _raw: t.args };
      }
      ctx.emit({ type: 'tool_end', id: t.id, name: t.name, args: args });
      return { id: t.id, name: t.name, args: args };
    })
    .filter(function (t) { return t.id && t.name; });
  return { finishReason: finishReason, usage: usage, toolCalls: toolCalls };
}

module.exports = {
  isReasoningModel,
  buildOpenAIRequest,
  buildAnthropicRequest,
  fetchProviderStream,
  runCompletionTurn,
  consumeOpenAI,
  consumeAnthropic,
};
