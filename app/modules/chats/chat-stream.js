/* ============================================================
 * chat-stream.js — chats 模块·流式控制器(ai-stream-kit 接入)
 * ------------------------------------------------------------
 * 基于 ai-stream-kit 的 createSSEClient(指数退避重连、
 * Last-Event-ID 断点续传、AbortController 中止、事件 id 去重)
 * + StreamMarkdownRenderer(autoClose 标签闭合)+ RenderScheduler
 * (requestAnimationFrame 按帧合并 DOM 更新,保证 60fps)。
 *
 * 事件分发(统一 SSE 协议):
 *   start / delta / thinking / tool_start / tool_arg / tool_end /
 *   tool_result / search / done / error
 *
 * - 发送:sendCurrent(输入框)/ resendLast(重试)
 * - 停止:Abort 不重试;中止后助手消息无内容显示「已停止。」
 * - 完成:done → client.close() 停止重连 → 会话整体落库 → 刷新列表
 * - 渲染:delta → renderer.append + scheduler.schedule;按帧写 DOM
 * ============================================================ */
'use strict';

import {
  createSSEClient,
  StreamMarkdownRenderer,
  RenderScheduler,
} from '../../lib/ai-stream-kit/index.js';
import { state, t, esc, escAttr, icon, activeConversation, createConversation, effectiveDraft, persistConversation, refreshList } from './chat-store.js';
import { buildMessagesForSend, previewText, titleFromFirstUser } from './chat-logic.js';
import { mdToHtml } from './chat-md.js';
import { uid } from './chat-util.js';
import { renderFull, rerenderCenter, rerenderHeader } from './chat-view.js';
import { retrieveKnowledge } from './chat-rag.js';

/* ---------- 每消息渲染器(流式期间常驻) ---------- */
var renderers = new Map(); // msgId -> { renderer, scheduler }

function rendererFor(msgId) {
  var entry = renderers.get(msgId);
  if (!entry) {
    var renderer = new StreamMarkdownRenderer({ markdownToHtml: mdToHtml });
    var scheduler = new RenderScheduler();
    entry = { renderer: renderer, scheduler: scheduler };
    renderers.set(msgId, entry);
  }
  return entry;
}

/** 按帧合并更新消息正文 DOM(闪烁光标在 chat-events 粘贴 caret) */
function scheduleBodyUpdate(msgId, bodyEl) {
  var entry = rendererFor(msgId);
  entry.scheduler.schedule(entry.renderer.getHTML(), function (html) {
    if (!bodyEl || !bodyEl.parentNode) return;
    bodyEl.innerHTML = html;
    if (state.streaming && state.streaming.active && state.streaming.msgId === msgId) {
      bodyEl.appendChild(caretEl());
    }
    scrollMessagesToBottom();
  });
}

function caretEl() {
  var s = document.createElement('span');
  s.className = 'ch-caret';
  return s;
}

function scrollMessagesToBottom() {
  var area = document.querySelector('[data-ch-messages]');
  if (area) area.scrollTop = area.scrollHeight;
}

function msgEl(msgId) {
  return document.querySelector('[data-ch-msg="' + msgId + '"]');
}
function msgBodyEl(msgId) {
  return document.querySelector('[data-ch-msg-body="' + msgId + '"]');
}
function thinkBodyEl(msgId) {
  var el = document.querySelector('[data-ch-think="' + msgId + '"]');
  return el ? el.querySelector('.ch-think-body') : null;
}

/* ============================================================
 * 发送入口
 * ============================================================ */
/** 从输入框发送(新建/续接会话) */
export function sendCurrent() {
  if (state.streaming && state.streaming.active) return;
  var text = String(state.view.composer || '').trim();
  var attachments = state.view.attachments || [];
  if (!text && !attachments.length) return;
  var c = activeConversation();
  if (!c) c = createConversation('');
  var parts = [];
  if (text) parts.push({ type: 'text', text: text });
  attachments.forEach(function (a) {
    if (a.type === 'image') {
      parts.push({ type: 'image_url', url: a.url });
    } else {
      parts.push({ type: 'file', name: a.name || 'file', size: a.size || '', text: a.text || '', url: a.url || '' });
    }
  });
  if (!c.title) {
    c.title = text ? text.replace(/\s+/g, ' ').slice(0, 30) : t('chats.newConversation');
  }
  var userMsg = {
    id: uid('m'),
    role: 'user',
    content: parts,
    ts: new Date().toISOString(),
  };
  c.messages = (c.messages || []).concat(userMsg);
  c.updatedAt = new Date().toISOString();
  state.view.composer = '';
  state.view.attachments = [];
  var assistantMsg = {
    id: uid('m'),
    role: 'assistant',
    content: '',
    ts: new Date().toISOString(),
    toolCalls: [],
    thinking: '',
  };
  c.messages.push(assistantMsg);
  renderFull();
  startStream(c, userMsg, assistantMsg);
}

/** 重试:以上一条用户消息为准重新生成(已删除该 AI 消息) */
export function resendLast() {
  if (state.streaming && state.streaming.active) return;
  var c = activeConversation();
  if (!c || !c.messages.length) return;
  var msgs = c.messages;
  var lastUser = null;
  for (var i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      lastUser = msgs[i];
      break;
    }
  }
  if (!lastUser) return;
  var assistantMsg = {
    id: uid('m'),
    role: 'assistant',
    content: '',
    ts: new Date().toISOString(),
    toolCalls: [],
    thinking: '',
  };
  c.messages.push(assistantMsg);
  c.updatedAt = new Date().toISOString();
  renderFull();
  startStream(c, lastUser, assistantMsg);
}

/* ============================================================
 * 流式主流程
 * ============================================================ */
async function startStream(c, userMsg, assistantMsg) {
  var d = effectiveDraft();
  var params = Object.assign({}, d.params);
  // 技能参数预设合并(技能优先于会话参数)
  var skill = ((state.config && state.config.skills) || []).filter(function (s) {
    return s.id === d.skillId;
  })[0];
  if (skill && skill.paramsPreset && typeof skill.paramsPreset === 'object') {
    params = Object.assign({}, skill.paramsPreset, params);
  }
  // 可选 RAG:技能携带知识文档时本地向量检索(失败优雅降级,不阻塞)
  var ragContext = null;
  if (skill && skill.knowledgeDocs && skill.knowledgeDocs.length) {
    ragContext = await retrieveKnowledge(skill.knowledgeDocs.join('\n\n'), userText(userMsg), 3);
  }

  var streamId = c.id + ':' + Date.now().toString(36);
  var controller = new AbortController();
  state.streaming = {
    conversationId: c.id,
    active: true,
    controller: controller,
    streamId: streamId,
    msgId: assistantMsg.id,
    userMsgId: userMsg.id,
    done: false,
  };
  rerenderHeader();

  // RAG 上下文拼入最后一条用户消息文本(若检索成功)
  if (ragContext && ragContext.length) {
    var ragText = '[知识检索上下文]\n' + ragContext.map(function (r, i) { return (i + 1) + '. ' + r.text; }).join('\n');
    var lastParts = Array.isArray(userMsg.content) ? userMsg.content.slice() : [];
    lastParts.push({ type: 'text', text: ragText });
    userMsg.content = lastParts;
  }

  var messages = buildMessagesForSend(c.messages);

  var client = createSSEClient({
    url: '/api/chat/stream',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': App.auth && App.auth.token ? App.auth.token() : '',
    },
    body: JSON.stringify({
      providerId: d.providerId,
      model: d.model,
      promptId: d.promptId,
      skillId: d.skillId,
      params: params,
      thinking: d.thinking,
      webSearch: !!d.webSearch,
      webSearchProvider: d.webSearchProvider || 'duckduckgo',
      searchResults: Number(d.searchResults) || 5,
      mcpEnabled: !!d.mcpEnabled,
      messages: messages,
      conversationId: c.id,
      streamId: streamId,
    }),
    signal: controller.signal,
    retry: { maxRetries: 5, baseDelay: 1000, jitter: true },
    onMessage: function (event) {
      handleEvent(c, userMsg, assistantMsg, event);
    },
    onError: function (err) {
      handleStreamError(assistantMsg, err);
    },
    onClose: function () {
      finalize(c, assistantMsg, false);
    },
  });
  // 供停止按钮使用
  state.streaming.client = client;
}

function handleEvent(c, userMsg, assistantMsg, event) {
  var payload;
  try {
    payload = JSON.parse(event.data);
  } catch (e) {
    return;
  }
  var type = payload.type || '';
  if (type === 'delta') {
    assistantMsg.content += payload.text || '';
    var entry = rendererFor(assistantMsg.id);
    entry.renderer.append(payload.text || '');
    var bodyEl = msgBodyEl(assistantMsg.id);
    if (bodyEl) scheduleBodyUpdate(assistantMsg.id, bodyEl);
    return;
  }
  if (type === 'thinking') {
    assistantMsg.thinking = (assistantMsg.thinking || '') + (payload.text || '');
    var tb = thinkBodyEl(assistantMsg.id);
    if (tb) {
      var pre = tb.querySelector('pre');
      if (!pre) {
        pre = document.createElement('pre');
        tb.appendChild(pre);
      }
      pre.textContent = assistantMsg.thinking;
      // 流式期间自动展开
      var wrap = document.querySelector('[data-ch-think="' + assistantMsg.id + '"]');
      if (wrap && !wrap.classList.contains('is-open')) wrap.classList.add('is-open');
    }
    return;
  }
  if (type === 'tool_start') {
    addTool(assistantMsg, { id: payload.id, name: payload.name, status: 'pending', args: '', output: '', error: '' });
    return;
  }
  if (type === 'tool_arg') {
    var t0 = toolById(assistantMsg, payload.id);
    if (t0) {
      t0.args += payload.text || '';
      updateToolCard(assistantMsg, t0);
    }
    return;
  }
  if (type === 'tool_end') {
    var t1 = toolById(assistantMsg, payload.id);
    if (t1) {
      t1.args = payload.args != null ? payload.args : t1.args;
      t1.status = t1.status || 'ok';
      updateToolCard(assistantMsg, t1);
    }
    return;
  }
  if (type === 'tool_result') {
    var t2 = toolById(assistantMsg, payload.id);
    if (t2) {
      t2.status = payload.ok ? 'ok' : 'err';
      t2.output = payload.output || '';
      t2.error = payload.error || '';
      t2.name = payload.name || t2.name;
      updateToolCard(assistantMsg, t2);
    }
    return;
  }
  if (type === 'search') {
    assistantMsg.search = payload.results || [];
    return;
  }
  if (type === 'done') {
    assistantMsg.usage = payload.usage || {};
    assistantMsg.finishReason = payload.finishReason || 'stop';
    state.streaming.done = true;
    if (state.streaming.client) state.streaming.client.close(); // 停止重连
    return;
  }
  if (type === 'error') {
    assistantMsg.error = payload.message || t('chats.streamError');
    if (payload.retryable === false && state.streaming.client) {
      state.streaming.client.close();
    }
    return;
  }
}

function handleStreamError(assistantMsg, err) {
  if (!assistantMsg.error) {
    assistantMsg.error = (err && err.message) || t('chats.streamError');
  }
  // 不可重试错误直接收尾;可重试由 ai-stream-kit 自动重连
  if (err && err.retryable === false && state.streaming.client) {
    state.streaming.client.close();
  }
}

/** 收尾:落库 + 清状态 + 重绘(仅当本次消息仍为流式消息时) */
function finalize(c, assistantMsg, aborted) {
  if (!state.streaming || state.streaming.msgId !== assistantMsg.id) return;
  var entry = renderers.get(assistantMsg.id);
  if (entry) {
    entry.scheduler.flush();
    var bodyEl = msgBodyEl(assistantMsg.id);
    if (bodyEl) {
      bodyEl.innerHTML = entry.renderer.getHTML();
    }
    entry.scheduler.dispose();
    renderers.delete(assistantMsg.id);
  }
  if (aborted) {
    assistantMsg.aborted = true;
    if (!assistantMsg.content && !assistantMsg.thinking && !(assistantMsg.toolCalls || []).length) {
      // 无内容:显示「已停止。」
      assistantMsg.stoppedEmpty = true;
    }
  }
  state.streaming = null;
  c.updatedAt = new Date().toISOString();
  // 标题自动生成(未命名时取首条用户消息)
  if (!c.title) {
    c.title = titleFromFirstUser(c.messages) || t('chats.newConversation');
  }
  renderFull();
  persistConversation(true);
  setTimeout(function () {
    refreshList();
  }, 600);
}

/** 停止:AbortController.abort()(Abort 不重试) */
export function stopStream() {
  var s = state.streaming;
  if (!s || !s.active) return;
  var c = activeConversation();
  var assistantMsg = null;
  if (c) {
    var msgs = c.messages || [];
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].id === s.msgId) {
        assistantMsg = msgs[i];
        break;
      }
    }
  }
  try {
    s.controller.abort();
  } catch (e) {
    /* noop */
  }
  if (s.client) {
    try {
      s.client.close();
    } catch (e) {
      /* noop */
    }
  }
  if (assistantMsg) finalize(c, assistantMsg, true);
  else {
    state.streaming = null;
    renderFull();
  }
}

/* ============================================================
 * 工具卡片
 * ============================================================ */
function addTool(assistantMsg, tool) {
  var list = assistantMsg.toolCalls || (assistantMsg.toolCalls = []);
  if (!list.some(function (x) { return x.id === tool.id; })) {
    list.push(tool);
    // 重绘整条消息的工具区(工具卡片实时插入)
    var wrap = document.querySelector('[data-ch-msg="' + assistantMsg.id + '"]');
    if (wrap) {
      var bubble = wrap.querySelector('.ch-bubble-ai');
      if (bubble) {
        // 在正文前插入工具卡片
        var toolHtml = list
          .map(function (tl, i) {
            return toolCardStatic(tl, assistantMsg.id, i, false);
          })
          .join('');
        var holder = bubble.querySelector('[data-ch-tools]');
        if (holder) holder.innerHTML = toolHtml;
      }
    }
  }
}
function toolById(assistantMsg, id) {
  var list = assistantMsg.toolCalls || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
function updateToolCard(assistantMsg, tool) {
  var idx = (assistantMsg.toolCalls || []).indexOf(tool);
  if (idx === -1) return;
  var el = document.querySelector('[data-ch-tool="' + assistantMsg.id + ':' + idx + '"]');
  if (el) {
    var open = el.classList.contains('is-open');
    el.outerHTML = toolCardStatic(tool, assistantMsg.id, idx, open);
  }
}
function toolCardStatic(tool, msgId, index, open) {
  var iconHtml =
    tool.status === 'ok'
      ? icon('circle-check', 'size-3.5 ch-tool-ok')
      : tool.status === 'err'
        ? icon('triangle-alert', 'size-3.5 ch-tool-err')
        : '<span class="ch-tool-spin"></span>';
  var argsText = typeof tool.args === 'string' ? tool.args : JSON.stringify(tool.args || {}, null, 2);
  var result = tool.output != null ? tool.output : tool.error || '';
  return (
    '<div class="ch-tool' +
    (open ? ' is-open' : '') +
    '" data-ch-tool="' +
    escAttr(msgId + ':' + index) +
    '">' +
    '<button type="button" class="ch-tool-head" data-ch-act="toggle-tool" data-id="' +
    escAttr(msgId) +
    '" data-index="' +
    index +
    '">' +
    iconHtml +
    '<span class="ch-tool-name">' +
    esc(tool.name) +
    '</span>' +
    '<span class="ch-tool-caret">' +
    icon('chevron-down', 'size-3.5') +
    '</span>' +
    '</button>' +
    '<div class="ch-tool-body">' +
    '<div class="ch-tool-block"><div class="ch-tool-label">' +
    esc(t('chats.args')) +
    '</div><pre class="ch-tool-json">' +
    esc(argsText) +
    '</pre></div>' +
    '<div class="ch-tool-block"><div class="ch-tool-label">' +
    esc(t('chats.result')) +
    '</div><pre class="ch-tool-json">' +
    esc(result) +
    '</pre></div>' +
    '</div>' +
    '</div>'
  );
}

function userText(m) {
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.content)) {
    return m.content
      .filter(function (p) { return p && p.type === 'text' && p.text; })
      .map(function (p) { return p.text; })
      .join('\n');
  }
  return '';
}

export { previewText };
