/* ============================================================
 * chat-actions-msg.js — chats 模块·动作域·附件/消息操作
 * ------------------------------------------------------------
 * 附件:图片(dataURL/远程 URL)、文件(文本类读全文,其余保留名与
 * 大小)、长粘贴生成 pasted-<ts>.txt;发送为多模态 parts。
 * 消息操作:复制(剪贴板 + 降级)、编辑(删除本条及以后 + 回填输入框
 * 自动触发响应)、重试(删除该条 AI 消息重新生成)、赞成/反对(互斥,
 * 再点取消,状态持久化)。
 * 简单输入弹窗 promptDialog(替代 window.prompt,回调式)。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, activeConversation, persistConversation } from './chat-store.js';
import { fileToImageDataURL, fileToText, isTextFile, fmtSize } from './chat-util.js';
import { renderFull, rerenderCenter } from './chat-view.js';

/* ---------- 附件管理 ---------- */
export function addImageFiles(files) {
  var list = state.view.attachments || [];
  var queue = Array.prototype.slice.call(files || []);
  if (!queue.length) return;
  var idx = 0;
  (function next() {
    if (idx >= queue.length) {
      rerenderCenter();
      return;
    }
    var f = queue[idx++];
    fileToImageDataURL(f)
      .then(function (dataUrl) {
        if (list.length < 12) {
          list.push({ type: 'image', name: f.name, url: dataUrl, size: fmtSize(f.size) });
        }
        next();
      })
      .catch(function () {
        next();
      });
  })();
}
export function addFileFiles(files) {
  var list = state.view.attachments || [];
  var queue = Array.prototype.slice.call(files || []);
  if (!queue.length) return;
  var idx = 0;
  (function next() {
    if (idx >= queue.length) {
      rerenderCenter();
      return;
    }
    var f = queue[idx++];
    var att = { type: 'file', name: f.name, size: fmtSize(f.size) };
    if (isTextFile(f.name)) {
      fileToText(f)
        .then(function (text) {
          att.text = text;
          list.push(att);
          next();
        })
        .catch(function () {
          list.push(att);
          next();
        });
    } else {
      list.push(att);
      next();
    }
  })();
}
/** 远程 URL 插入(图片/文件) */
export function insertRemoteUrl(kind) {
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(kind === 'image' ? t('chats.insertImage') : t('chats.insertFile')) + '</h3>',
    body:
      '<div class="ch-dlg-field">' +
      '<label class="ch-dlg-label">' +
      esc(t('chats.remoteUrl')) +
      '</label>' +
      '<input type="text" class="ch-input-sm" data-ch-act="remote-url-input" placeholder="https://…" />' +
      '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="remote-url-apply" data-kind="' +
      kind +
      '">' +
      esc(t('chats.insert')) +
      '</button>',
  });
}
export function applyRemoteUrl(kind) {
  var input = document.querySelector('[data-ch-act="remote-url-input"]');
  if (!input) return;
  var url = String(input.value || '').trim();
  if (!url) {
    App.ui.toast(t('chats.urlRequired'), 'error');
    return;
  }
  var list = state.view.attachments || [];
  if (kind === 'image') {
    list.push({ type: 'image', name: url.split('/').pop() || 'image', url: url, size: '' });
  } else {
    list.push({ type: 'file', name: url.split('/').pop() || 'file', url: url, size: '' });
  }
  App.ui.closeDialog();
  rerenderCenter();
}
export function removeAttachment(index) {
  var list = state.view.attachments || [];
  if (index >= 0 && index < list.length) list.splice(index, 1);
  rerenderCenter();
}
/** 长文本粘贴 → pasted-<ts>.txt */
export function addPastedText(text) {
  var list = state.view.attachments || [];
  var ts = Date.now();
  list.push({ type: 'file', name: 'pasted-' + ts + '.txt', size: fmtSize(text.length), text: text });
  rerenderCenter();
}

/* ---------- 消息操作(复制/编辑/重试/反馈) ---------- */
export function copyMessage(id) {
  var c = activeConversation();
  var msgs = (c && c.messages) || [];
  var m = msgs.filter(function (x) { return x.id === id; })[0];
  if (!m) return;
  var text = m.role === 'user' ? userText(m) : String(m.content || '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () {
        App.ui.toast(t('chats.copied'));
      },
      function () {
        copyFallback(text);
      }
    );
  } else {
    copyFallback(text);
  }
}
function copyFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    App.ui.toast(t('chats.copied'));
  } catch (e) {
    /* noop */
  }
  ta.remove();
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
/** 编辑:删除该消息及其后所有消息,内容与附件回填输入框并自动触发响应 */
export function editMessage(id) {
  var c = activeConversation();
  if (!c) return;
  var msgs = c.messages || [];
  var idx = -1;
  msgs.forEach(function (m, i) {
    if (m.id === id) idx = i;
  });
  if (idx === -1) return;
  var m = msgs[idx];
  // 回填附件(图片/文件 parts → attachments)
  var attachments = [];
  if (Array.isArray(m.content)) {
    m.content.forEach(function (p) {
      if (p && p.type === 'image_url') attachments.push({ type: 'image', name: '', url: p.url, size: '' });
      else if (p && p.type === 'file') attachments.push({ type: 'file', name: p.name || '', size: p.size || '', text: p.text || '' });
    });
  }
  state.view.attachments = attachments;
  state.view.composer = userText(m);
  c.messages = msgs.slice(0, idx);
  c.updatedAt = new Date().toISOString();
  renderFull();
  // 自动触发响应
  import('./chat-stream.js').then(function (stream) {
    stream.sendCurrent();
  });
}
/** 重试:删除该条 AI 消息并重新生成(以上一条用户消息为准) */
export function retryMessage(id) {
  var c = activeConversation();
  if (!c) return;
  var msgs = c.messages || [];
  var idx = -1;
  msgs.forEach(function (m, i) {
    if (m.id === id) idx = i;
  });
  if (idx === -1) return;
  c.messages = msgs.slice(0, idx);
  c.updatedAt = new Date().toISOString();
  renderFull();
  import('./chat-stream.js').then(function (stream) {
    stream.resendLast();
  });
}
/** 赞成/反对:互斥,再点取消,状态持久化 */
export function setFeedback(id, value) {
  var c = activeConversation();
  var msgs = (c && c.messages) || [];
  var m = msgs.filter(function (x) { return x.id === id; })[0];
  if (!m || m.role !== 'assistant') return;
  m.feedback = m.feedback === value ? null : value;
  persistConversation();
  rerenderCenter();
}
/* ============================================================
 * 简单输入弹窗(替代 window.prompt;回调式)
 * ============================================================ */
var promptCallback = null;
export function promptDialog(title, initial, okLabel, cancelLabel, onConfirm, multiline) {
  promptCallback = onConfirm || null;
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(title) + '</h3>',
    body:
      '<div class="ch-dlg-field">' +
      (multiline
        ? '<textarea class="ch-input-sm ch-dlg-textarea" data-ch-act="prompt-input" rows="8">' +
          esc(initial || '') +
          '</textarea>'
        : '<input type="text" class="ch-input-sm" data-ch-act="prompt-input" value="' +
          escAttr(initial || '') +
          '" />') +
      '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(cancelLabel || t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="dlg-confirm-prompt">' +
      esc(okLabel || t('chats.save')) +
      '</button>',
  });
  var input = document.querySelector('[data-ch-act="prompt-input"]');
  if (input) {
    input.focus();
    input.select();
  }
}
/** 供事件委托确认 prompt 弹窗(OK 按钮 / Enter) */
export function confirmPromptDialog() {
  var input = document.querySelector('[data-ch-act="prompt-input"]');
  var cb = promptCallback;
  promptCallback = null;
  if (!input) return;
  var v = input.value;
  App.ui.closeDialog();
  if (cb) cb(v);
}
