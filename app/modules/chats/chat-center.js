/* ============================================================
 * chat-center.js — chats 模块·中栏(聊天主界面)
 * ------------------------------------------------------------
 * 顶栏:汉堡(折叠左栏)+ 主标题(会话标题 / 供应商 · 模型,流式中
 *      追加「· 生成中…」)+ 停止按钮 + 右栏开关
 * 消息区(内层 max-width 52rem 居中,唯一滚动区):
 *   - 空态(sparkles + 开始新的对话)
 *   - 用户气泡(头像 U / primary 底 / 附件行 / 复制/编辑)
 *   - AI 气泡(头像 AI / card 底 / 流式 Markdown / 复制/重试/赞成/反对)
 *   - 思维链块(brain + 展开折叠,流式自动展开,状态按消息持久化)
 *   - 工具调用卡片(状态图标 + 名称 + 默认折叠,Args/Result JSON)
 * 输入框由 chat-composer.js 渲染(composerHtml)。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon, activeConversation, effectiveDraft } from './chat-store.js';
import { mdToHtml } from './chat-md.js';
import { fmtDateTime } from './chat-util.js';
import { rerenderCenter } from './chat-view.js';
import { composerHtml } from './chat-composer.js';

/* ---------- 顶栏 ---------- */
export function headerHtml() {
  var c = activeConversation();
  var d = effectiveDraft();
  var provider = state.providerCatalog.filter(function (p) { return p.id === d.providerId; })[0] ||
    (state.config && state.config.providers || []).filter(function (p) { return p.id === d.providerId; })[0] ||
    null;
  var providerName = provider ? provider.name : (d.providerId || '');
  var model = d.model || t('chats.noModel');
  var streaming = !!(state.streaming && state.streaming.active);
  var title = c && c.title ? c.title : t('chats.newConversation');
  if (!c) title = t('chats.newConversation');
  return (
    '<header class="ch-header" data-ch-header>' +
    '<div class="ch-header-left">' +
    '<button type="button" class="ch-icon-btn ch-hamburger" data-ch-act="toggle-left" aria-label="' +
    escAttr(t('chats.toggleSidebar')) +
    '" data-tip="' +
    escAttr(t('chats.toggleSidebar')) +
    '">' +
    icon('panel-left-close', 'size-4') +
    '</button>' +
    '<button type="button" class="ch-title-btn" data-ch-act="center-title" title="' +
    escAttr(title) +
    '">' +
    '<span class="ch-title-main">' +
    esc(title) +
    '</span>' +
    '<span class="ch-title-sub">' +
    esc(providerName + ' · ' + model) +
    (streaming ? ' · ' + esc(t('chats.generating')) : '') +
    '</span>' +
    '</button>' +
    '</div>' +
    '<div class="ch-header-right">' +
    (streaming
      ? '<button type="button" class="ch-stop-btn" data-ch-act="stop" aria-label="' +
        escAttr(t('chats.stop')) +
        '">' +
        icon('stop', 'size-4') +
        esc(t('chats.stop')) +
        '</button>'
      : '') +
    '<button type="button" class="ch-icon-btn' +
    (state.view.rightOpen ? ' is-on' : '') +
    '" data-ch-act="toggle-right" aria-label="' +
    escAttr(t('chats.parameters')) +
    '" data-tip="' +
    escAttr(t('chats.parameters')) +
    '">' +
    icon('sliders-horizontal', 'size-4') +
    '</button>' +
    '</div>' +
    '</header>'
  );
}

/* ---------- 消息区 ---------- */
function emptyHtml() {
  return (
    '<div class="ch-welcome">' +
    '<span class="ch-welcome-ic">' +
    icon('sparkles', 'size-7') +
    '</span>' +
    '<h2>' +
    esc(t('chats.startNew')) +
    '</h2>' +
    '<p>' +
    esc(t('chats.startDesc')) +
    '</p>' +
    '</div>'
  );
}

/** 附件行(图片缩略图 / 文件 chip) */
function attachmentsHtml(parts) {
  var html = '';
  (parts || []).forEach(function (p) {
    if (p.type === 'image_url') {
      html +=
        '<span class="ch-msg-img"><img src="' +
        escAttr(p.url) +
        '" alt="" loading="lazy" /></span>';
    } else if (p.type === 'file') {
      html +=
        '<span class="ch-file-chip">' +
        icon('file-text', 'size-3.5') +
        esc(p.name || '') +
        (p.size ? '<span class="ch-file-size">' + esc(p.size) + '</span>' : '') +
        '</span>';
    }
  });
  return html ? '<div class="ch-msg-att">' + html + '</div>' : '';
}

function userPartsText(parts) {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter(function (p) { return p && p.type === 'text' && p.text; })
    .map(function (p) { return p.text; })
    .join('\n');
}

function userMessageHtml(m) {
  var text = userPartsText(m.content);
  var streaming = state.streaming && state.streaming.active;
  return (
    '<div class="ch-msg ch-msg-user" data-ch-msg="' +
    escAttr(m.id) +
    '">' +
    '<div class="ch-msg-row">' +
    '<div class="ch-msg-body">' +
    attachmentsHtml(m.content) +
    '<div class="ch-bubble-user">' +
    esc(text) +
    (m.error ? '<div class="ch-msg-error">' + esc(m.error) + '</div>' : '') +
    '</div>' +
    '<div class="ch-msg-actions">' +
    '<button type="button" class="ch-act-btn" data-ch-act="copy-msg" data-id="' +
    escAttr(m.id) +
    '" data-tip="' +
    escAttr(t('chats.copy')) +
    '" aria-label="' +
    escAttr(t('chats.copy')) +
    '">' +
    icon('copy', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-act-btn" data-ch-act="edit-msg" data-id="' +
    escAttr(m.id) +
    '" data-tip="' +
    escAttr(t('chats.edit')) +
    '" aria-label="' +
    escAttr(t('chats.edit')) +
    '">' +
    icon('pencil', 'size-3.5') +
    '</button>' +
    '</div>' +
    '<div class="ch-msg-time">' +
    esc(fmtDateTime(m.ts)) +
    '</div>' +
    '</div>' +
    '<span class="ch-avatar ch-avatar-user">U</span>' +
    '</div>' +
    (streaming && state.streaming.userMsgId === m.id ? '<div class="ch-streaming"></div>' : '') +
    '</div>'
  );
}

/* ---------- 思维链块 ---------- */
function thinkingHtml(m) {
  if (!m.thinking) return '';
  var open = m._thinkOpen || (state.streaming && state.streaming.active && state.streaming.msgId === m.id);
  return (
    '<div class="ch-think' +
    (open ? ' is-open' : '') +
    '" data-ch-think="' +
    escAttr(m.id) +
    '">' +
    '<button type="button" class="ch-think-head" data-ch-act="toggle-think" data-id="' +
    escAttr(m.id) +
    '">' +
    '<span class="ch-think-ic">' +
    icon('brain', 'size-3.5') +
    '</span>' +
    '<span class="ch-think-label">' +
    esc(t('chats.thinkingChain')) +
    '</span>' +
    '<span class="ch-think-caret">' +
    icon('chevron-down', 'size-3.5') +
    '</span>' +
    '</button>' +
    '<div class="ch-think-body">' +
    '<pre>' +
    esc(m.thinking) +
    '</pre>' +
    '</div>' +
    '</div>'
  );
}

/* ---------- 工具卡片 ---------- */
function toolStatusIcon(status) {
  if (status === 'ok') return icon('circle-check', 'size-3.5 ch-tool-ok');
  if (status === 'err') return icon('triangle-alert', 'size-3.5 ch-tool-err');
  return '<span class="ch-tool-spin"></span>';
}

function toolCardHtml(tool, index, msgId) {
  var open = msgToolOpen(msgId, index);
  var args = tool.args;
  var argsText = typeof args === 'string' ? args : JSON.stringify(args || {}, null, 2);
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
    toolStatusIcon(tool.status) +
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
function msgToolOpen(msgId, index) {
  var msg = messageById(msgId);
  return !!(msg && msg._toolsOpen && msg._toolsOpen[index]);
}
function messageById(id) {
  var c = activeConversation();
  var msgs = (c && c.messages) || [];
  for (var i = 0; i < msgs.length; i++) if (msgs[i].id === id) return msgs[i];
  return null;
}

/* ---------- AI 气泡 ---------- */
function assistantMessageHtml(m) {
  var streaming = state.streaming && state.streaming.active && state.streaming.msgId === m.id;
  var bodyHtml = streaming
    ? '<div class="ch-md ch-stream-body" data-ch-msg-body="' + escAttr(m.id) + '"><span class="ch-caret"></span></div>'
    : m.content
      ? '<div class="ch-md">' + mdToHtml(m.content) + '</div>'
      : '';
  var tools = (m.toolCalls || []).map(function (tc, i) { return toolCardHtml(tc, i, m.id); }).join('');
  var errorHtml = m.error ? '<div class="ch-msg-error">' + esc(m.error) + '</div>' : '';
  var stoppedHtml = m.aborted && !m.content ? '<div class="ch-stopped">' + esc(t('chats.stopped')) + '</div>' : '';
  return (
    '<div class="ch-msg ch-msg-ai" data-ch-msg="' +
    escAttr(m.id) +
    '">' +
    '<div class="ch-msg-row">' +
    '<span class="ch-avatar ch-avatar-ai">AI</span>' +
    '<div class="ch-msg-body">' +
    thinkingHtml(m) +
    '<div class="ch-bubble-ai">' +
    '<div class="ch-tools" data-ch-tools>' +
    tools +
    '</div>' +
    bodyHtml +
    stoppedHtml +
    errorHtml +
    '<div class="ch-msg-actions">' +
    '<button type="button" class="ch-act-btn" data-ch-act="copy-msg" data-id="' +
    escAttr(m.id) +
    '" data-tip="' +
    escAttr(t('chats.copy')) +
    '" aria-label="' +
    escAttr(t('chats.copy')) +
    '">' +
    icon('copy', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-act-btn" data-ch-act="retry-msg" data-id="' +
    escAttr(m.id) +
    '" data-tip="' +
    escAttr(t('chats.retry')) +
    '" aria-label="' +
    escAttr(t('chats.retry')) +
    '">' +
    icon('refresh', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-act-btn' +
    (m.feedback === 'up' ? ' is-on' : '') +
    '" data-ch-act="feedback" data-id="' +
    escAttr(m.id) +
    '" data-value="up" data-tip="' +
    escAttr(t('chats.thumbsUp')) +
    '" aria-label="' +
    escAttr(t('chats.thumbsUp')) +
    '">' +
    icon('thumbUp', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-act-btn' +
    (m.feedback === 'down' ? ' is-on' : '') +
    '" data-ch-act="feedback" data-id="' +
    escAttr(m.id) +
    '" data-value="down" data-tip="' +
    escAttr(t('chats.thumbsDown')) +
    '" aria-label="' +
    escAttr(t('chats.thumbsDown')) +
    '">' +
    icon('thumbDown', 'size-3.5') +
    '</button>' +
    '</div>' +
    '<div class="ch-msg-time">' +
    esc(fmtDateTime(m.ts)) +
    (m.usage && m.usage.totalTokens ? ' · ' + esc(m.usage.totalTokens + ' tokens') : '') +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function messagesHtml() {
  var c = activeConversation();
  var msgs = (c && c.messages) || [];
  if (!msgs.length && !(state.streaming && state.streaming.active)) return emptyHtml();
  return msgs.map(function (m) {
    return m.role === 'user' ? userMessageHtml(m) : assistantMessageHtml(m);
  }).join('');
}

/* ---------- 主渲染 ---------- */
export function centerHtml() {
  var streaming = state.streaming && state.streaming.active;
  return (
    '<section class="ch-center' +
    (state.view.leftOpen ? '' : ' ch-left-collapsed') +
    '" data-ch-center>' +
    headerHtml() +
    '<div class="ch-messages" data-ch-messages>' +
    '<div class="ch-messages-inner">' +
    messagesHtml() +
    '</div>' +
    '</div>' +
    composerHtml() +
    (streaming ? '<div class="ch-stream-overlay"></div>' : '') +
    '</section>'
  );
}

export { rerenderCenter, userPartsText };
