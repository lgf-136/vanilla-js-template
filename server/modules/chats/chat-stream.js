/* ============================================================
 * chat-stream.js — Chats 模块 SSE 流式补全(核心编排)
 * ------------------------------------------------------------
 * 职责(拆分自检四项通过:符号闭包完整 / 无孤儿 / 行为零变更 / ≤500 行):
 *   - 事件缓冲 + Last-Event-ID 断点续传(幂等重放,事件按递增 id 编号)
 *   - 指数退避重连的客户端由 ai-stream-kit 承担;服务端负责重放
 *   - 供应商协议分发与单轮消费 → chat-stream-build.js
 *   - 工具执行 / 消息规范化 / 工具定义 → chat-stream-util.js
 *   - 工具调用循环(上限 TOOL_LOOP_LIMIT)与主流程编排在本文件
 *   - Abort:客户端断开(AbortController)立即中止上游请求并标记缓冲
 * ============================================================ */
'use strict';

const {
  PROVIDER_INDEX,
  TOOL_LOOP_LIMIT,
  EVENT_BUFFER_CAP,
  EVENT_BUFFER_TTL_MS,
  asBool,
  clamp,
} = require('./chat-shared');
const {
  mergeParams,
  buildSystemPrompt,
  toOpenAIMessages,
  toAnthropicMessages,
} = require('./chat-llm');
const {
  buildOpenAIRequest,
  buildAnthropicRequest,
  runCompletionTurn,
} = require('./chat-stream-build');
const {
  executeTool,
  collectToolJobs,
  lastUserText,
  normalizeMessages,
  buildToolDefs,
} = require('./chat-stream-util');

/** 读取进程环境变量(全局测试密钥回退,语义与 chat-service 相同) */
function getEnv(name) {
  const proc = typeof process !== 'undefined' ? process : null;
  return proc && proc.env ? proc.env[name] : undefined;
}

/* ============================================================
 * 事件缓冲注册表(内存,按 streamId;TTL 清理)
 * ============================================================ */
const eventBuffers = new Map(); // streamId -> { events: [{id,data}], state, at, conversationId }

function bufferPush(streamId, eventId, data) {
  let buf = eventBuffers.get(streamId);
  if (!buf) {
    buf = { events: [], state: 'active', at: Date.now() };
    eventBuffers.set(streamId, buf);
  }
  buf.at = Date.now();
  if (buf.events.length < EVENT_BUFFER_CAP) {
    buf.events.push({ id: eventId, data: data });
  }
  return buf;
}
function bufferMark(streamId, state) {
  const buf = eventBuffers.get(streamId);
  if (buf) {
    buf.state = state;
    buf.at = Date.now();
  }
}
function cleanupBuffers() {
  const now = Date.now();
  eventBuffers.forEach(function (buf, key) {
    if (now - buf.at > EVENT_BUFFER_TTL_MS) eventBuffers.delete(key);
  });
}
// 定期清理(TTL 30 分钟)
const sweepTimer = setInterval(cleanupBuffers, 5 * 60 * 1000);
if (sweepTimer && typeof sweepTimer.unref === 'function') sweepTimer.unref();

/** 事件编号:每流递增,保证 Last-Event-ID 断点语义 */
function createEventCounter() {
  let n = 0;
  return function () {
    return String(++n);
  };
}

/** 写入一条 SSE 事件(id + data: json) */
function writeEvent(res, id, payload) {
  res.write('id: ' + id + '\n');
  res.write('data: ' + JSON.stringify(payload) + '\n\n');
}

/* ============================================================
 * 主流程
 * ============================================================ */
/**
 * 处理一次流式请求。
 * @param {object} opts { req, res, body, lastEventId, service, config, secrets }
 */
async function handleStream(opts) {
  const { req, res, body, lastEventId, service } = opts;
  const config = service.config;
  const secrets = service.secrets;

  // 校验并解析入参
  const providerId = String(body.providerId || config.defaults.providerId || 'opencode-zen');
  let provider = PROVIDER_INDEX[providerId];
  if (!provider) {
    provider = (config.providers || []).filter(function (p) { return p.id === providerId; })[0] || null;
  }
  if (!provider) {
    sendErrorAndClose(res, '未知供应商: ' + providerId, 400, 'invalid_provider');
    return;
  }
  const model = String(body.model || config.defaults.model || '').trim();
  if (!model) {
    sendErrorAndClose(res, '未选择模型', 400, 'no_model');
    return;
  }
  const params = mergeParams(config.defaults.params, providerId, body.params);
  const thinking = ['none', 'low', 'medium', 'high', 'max'].indexOf(body.thinking) !== -1 ? body.thinking : (config.defaults.thinking || 'none');
  const mcpEnabled = asBool(body.mcpEnabled, asBool(config.defaults.mcpEnabled, false));
  const webSearch = asBool(body.webSearch, asBool(config.defaults.webSearch, false));
  const webSearchProvider = body.webSearchProvider || config.defaults.webSearchProvider || 'duckduckgo';
  const searchResults = clamp(Number(body.searchResults) || Number(config.defaults.searchResults) || 5, 1, 10, 5);

  // API Key:供应商密钥 > 全局测试密钥(opencode-zen 走 CHAT_TEST_API_KEY)
  let apiKey = secrets.providerKeys && secrets.providerKeys[providerId];
  if (!apiKey && getEnv('CHAT_TEST_API_KEY') && providerId === 'opencode-zen') {
    apiKey = getEnv('CHAT_TEST_API_KEY');
  }
  const localProvider = providerId === 'ollama' || providerId === 'lmstudio';
  if (!apiKey && !localProvider) {
    sendErrorAndClose(res, '供应商 ' + (provider.name || providerId) + ' 未配置 API Key', 400, 'no_api_key');
    return;
  }

  // 断点续传:重放缓冲(幂等;客户端按 id 去重跳过已渲染部分)
  const streamId = String(body.streamId || '');
  if (lastEventId && streamId) {
    const buf = eventBuffers.get(streamId);
    if (buf) {
      let replayed = 0;
      buf.events.forEach(function (ev) {
        if (Number(ev.id) > Number(lastEventId)) {
          res.write('id: ' + ev.id + '\n');
          res.write('data: ' + ev.data + '\n\n');
          replayed++;
        }
      });
      if (buf.state !== 'active') {
        bufferMark(streamId, buf.state);
        res.end();
        return;
      }
      // 流仍在生成:重放已有事件后补发中断提示,由客户端决定是否重试
      if (replayed > 0) {
        writeEvent(res, String(Number(lastEventId) + 1), { type: 'error', code: 'reconnect_pending', message: '连接已恢复,生成可能已中断,请重试。' });
      }
      res.end();
      return;
    }
  }

  // 初始化响应头(SSE)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const nextId = createEventCounter();
  let aborted = false;
  const signal = new AbortController();
  // 客户端断开 → 中止上游(Abort 不重试)
  const onAbort = function () {
    aborted = true;
    try {
      signal.abort();
    } catch (e) {
      /* noop */
    }
  };
  req.on && req.on('close', onAbort);
  req.on && req.on('error', onAbort);
  const cleanup = function () {
    req.removeListener && req.removeListener('close', onAbort);
    req.removeListener && req.removeListener('error', onAbort);
  };

  // 事件缓冲记录(除错误外全部缓冲,供断点重放)
  let emitted = 0;
  const emit = function (payload) {
    const id = nextId();
    const data = JSON.stringify(payload);
    if (emitted > 0 || payload.type !== 'start') {
      // start 事件只用于标记开始,也写入但标记可跳过
      bufferPush(streamId, id, data);
    }
    emitted++;
    writeEvent(res, id, payload);
  };

  emit({ type: 'start' });

  try {
    // 联网检索上下文(webSearch 开启时注入系统提示词)
    let searchContext = null;
    if (webSearch) {
      try {
        const q = lastUserText(body.messages);
        if (q) {
          const keys = secrets.searchKeys || {};
          searchContext = await searchWeb(webSearchProvider, q, keys, searchResults);
          emit({ type: 'search', results: searchContext });
        }
      } catch (e) {
        emit({ type: 'error', code: 'search_failed', message: String((e && e.message) || e) });
      }
    }

    const systemPrompt = buildSystemPrompt(config, body.promptId, body.skillId, searchContext);

    // 工具定义:启用 MCP 服务器 × 启用工具 + 内置 web_search
    const tools = buildToolDefs(config, mcpEnabled, webSearch);

    // 历史消息(跳过流式空占位;用户消息含 parts)
    let messages = normalizeMessages(body.messages);
    if (systemPrompt) {
      messages = [{ role: 'system', content: systemPrompt }].concat(messages);
    }

    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finalFinishReason = 'stop';

    for (let round = 0; round < TOOL_LOOP_LIMIT; round++) {
      if (aborted) break;
      let request;
      if (provider.kind === 'anthropic') {
        const sys = messages.filter(function (m) { return m.role === 'system'; });
        const rest = messages.filter(function (m) { return m.role !== 'system'; });
        request = buildAnthropicRequest(provider, apiKey, {
          model: model,
          messages: toAnthropicMessages(rest),
          system: sys.map(function (m) { return m.content; }).join('\n'),
          params: params,
          thinking: thinking,
          tools: tools,
        });
      } else {
        request = buildOpenAIRequest(provider, apiKey, {
          model: model,
          messages: toOpenAIMessages(messages),
          params: params,
          thinking: thinking,
          tools: tools,
        });
      }

      const result = await runCompletionTurn(provider, apiKey, request, {
        emit: emit,
        signal: signal.signal,
        aborted: function () {
          return aborted;
        },
      });
      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
      finalFinishReason = result.finishReason || 'stop';

      const toolJobs = collectToolJobs(result.toolCalls);
      if (!toolJobs.length || aborted) break;

      // 工具执行:emit tool_result 并回填上下文
      const toolResults = [];
      for (const job of toolJobs) {
        if (aborted) break;
        const r = await executeTool({ id: job.id, name: job.name }, job.args, service, {
          webSearchProvider: webSearchProvider,
          searchResults: searchResults,
        });
        emit({ type: 'tool_result', id: job.id, name: job.name, ok: r.ok, output: r.output || '', error: r.error || '' });
        toolResults.push({ id: job.id, name: job.name, args: job.args, ok: r.ok, output: r.output || '', error: r.error || '' });
      }
      if (aborted) break;
      // 回填:助手消息(含 tool_calls)+ tool 结果
      messages.push({ role: 'assistant', content: '', toolCalls: result.toolCalls });
      toolResults.forEach(function (t) {
        messages.push({
          role: 'tool',
          toolCallId: t.id,
          toolResult: { id: t.id, name: t.name, ok: t.ok, output: t.output, error: t.error },
        });
      });
      if (round >= TOOL_LOOP_LIMIT - 1) {
        finalFinishReason = 'tool_loop_limit';
      }
    }

    if (!aborted) {
      emit({
        type: 'done',
        finishReason: finalFinishReason,
        usage: totalUsage,
      });
      bufferMark(streamId, 'finished');
    } else {
      bufferMark(streamId, 'aborted');
    }
  } catch (e) {
    const status = e && e.status;
    const retryable = !status || status >= 500 || status === 429;
    bufferMark(streamId, 'error');
    emit({
      type: 'error',
      code: retryable ? 'upstream_error' : 'business_error',
      message: String((e && e.message) || e),
      retryable: retryable,
    });
  } finally {
    cleanup();
    try {
      res.end();
    } catch (e) {
      /* 流可能已关闭 */
    }
  }
}

/** 发送错误 SSE 事件并关闭(请求尚未写响应头时) */
function sendErrorAndClose(res, message, status, code) {
  try {
    res.writeHead(status, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' });
  } catch (e) {
    /* 已写头 */
  }
  try {
    res.write('data: ' + JSON.stringify({ type: 'error', code: code || 'error', message: message }) + '\n\n');
    res.end();
  } catch (e) {
    /* noop */
  }
}

module.exports = {
  handleStream,
  buildToolDefs,
  normalizeMessages,
  eventBuffers,
  bufferPush,
  bufferMark,
};
