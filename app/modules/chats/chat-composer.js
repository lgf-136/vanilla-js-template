/* ============================================================
 * chat-composer.js — chats 模块·输入框(参考 claude.ai 风格)
 * ------------------------------------------------------------
 * - textarea 自动增高(最大 6 行),Enter 发送 / Shift+Enter 换行
 * - 附件 chips 行(图片缩略图 / 文件 chip,× 移除)
 * - 左下角:供应商下拉(内置/自定义分组 + 搜索 + 新增)、模型组合框
 *   (可输入/筛选/下拉)、思考程度分段(关闭/低/中/高/最高)、
 *   MCP 开关下拉(总开关 + 服务器开关 + 工具开关,父子级)
 * - 右下角:插入图片(上传/URL)、插入文件(上传/URL)、联网搜索开关
 *   (搜索供应商下拉)、圆形发送按钮(空态禁用,发送中 spinner)
 * - 粘贴:图片 → dataURL;纯文本超 4000 字符 → pasted-<ts>.txt
 * 事件全部走 chat-events.js 的 document 委托。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon, effectiveDraft, providerById, persistView } from './chat-store.js';
import { fmtSize, isImageFile, isTextFile } from './chat-util.js';

/* ---------- 附件 chips ---------- */
function attachmentChipsHtml() {
  var list = state.view.attachments || [];
  if (!list.length) return '';
  return (
    '<div class="ch-att-row">' +
    list
      .map(function (a, i) {
        if (a.type === 'image') {
          return (
            '<span class="ch-att ch-att-img">' +
            '<img src="' +
            escAttr(a.url) +
            '" alt="" /><button type="button" class="ch-att-x" data-ch-act="remove-att" data-index="' +
            i +
            '" aria-label="' +
            escAttr(t('chats.remove')) +
            '">' +
            icon('x', 'size-3') +
            '</button></span>'
          );
        }
        return (
          '<span class="ch-att ch-att-file">' +
          icon('file-text', 'size-3.5') +
          '<span class="ch-att-name">' +
          esc(a.name) +
          '</span>' +
          (a.size ? '<span class="ch-att-size">' + esc(a.size) + '</span>' : '') +
          '<button type="button" class="ch-att-x" data-ch-act="remove-att" data-index="' +
          i +
          '" aria-label="' +
          escAttr(t('chats.remove')) +
          '">' +
          icon('x', 'size-3') +
          '</button></span>'
        );
      })
      .join('') +
    '</div>'
  );
}

/* ---------- 思考程度分段 ---------- */
var THINK_LEVELS = ['none', 'low', 'medium', 'high', 'max'];
function thinkLabel(level) {
  return t('chats.thinking.' + level);
}
function thinkingBtnHtml(d) {
  return (
    '<div class="ch-seg" role="tablist" aria-label="' +
    escAttr(t('chats.thinking')) +
    '">' +
    THINK_LEVELS.map(function (lv) {
      return (
        '<button type="button" role="tab" aria-selected="' +
        (d.thinking === lv ? 'true' : 'false') +
        '" class="ch-seg-item' +
        (d.thinking === lv ? ' is-on' : '') +
        '" data-ch-act="set-thinking" data-value="' +
        lv +
        '" data-tip="' +
        escAttr(thinkLabel(lv)) +
        '">' +
        esc(thinkLabel(lv)) +
        '</button>'
      );
    }).join('') +
    '</div>'
  );
}

/* ---------- 思考程度下拉(与 composer 按钮 data-ch-act=thinking-dd 对应) ---------- */
export function thinkingDropdownHtml() {
  var d = effectiveDraft();
  return (
    '<div class="ch-dd-list">' +
    THINK_LEVELS.map(function (lv) {
      return (
        '<button type="button" class="ch-dd-item' +
        (d.thinking === lv ? ' is-on' : '') +
        '" data-ch-act="set-thinking" data-value="' +
        lv +
        '">' +
        '<span class="ch-dd-ic">' +
        icon('brain', 'size-3.5') +
        '</span>' +
        '<span class="ch-dd-name">' +
        esc(thinkLabel(lv)) +
        '</span>' +
        (d.thinking === lv ? '<span class="ch-dd-check">' + icon('check', 'size-3.5') + '</span>' : '') +
        '</button>'
      );
    }).join('') +
    '</div>'
  );
}

/* ---------- 供应商下拉 ---------- */
export function providerDropdownHtml() {
  var d = effectiveDraft();
  var builtIn = state.providerCatalog || [];
  var custom = ((state.config && state.config.providers) || []).filter(function (p) {
    return builtIn.every(function (b) { return b.id !== p.id; });
  });
  var search = state.view.providerSearch || '';
  function row(p) {
    var key = state.secrets.providerKeys && state.secrets.providerKeys[p.id];
    var local = p.id === 'ollama' || p.id === 'lmstudio';
    var miss = !key && !local && !(p.id === 'opencode-zen' && window.__chatTestKey);
    return (
      '<button type="button" class="ch-dd-item' +
      (d.providerId === p.id ? ' is-on' : '') +
      '" data-ch-act="set-provider" data-id="' +
      escAttr(p.id) +
      '">' +
      '<span class="ch-dd-name">' +
      esc(p.name) +
      '</span>' +
      (miss ? '<span class="ch-dd-hint">' + esc(t('chats.noKey')) + '</span>' : '') +
      (d.providerId === p.id ? '<span class="ch-dd-check">' + icon('check', 'size-3.5') + '</span>' : '') +
      '</button>'
    );
  }
  function group(title, list) {
    var filtered = list.filter(function (p) {
      return !search || p.name.toLowerCase().indexOf(search.toLowerCase()) !== -1;
    });
    if (!filtered.length) return '';
    return (
      '<div class="ch-dd-label">' +
      esc(title) +
      '</div>' +
      filtered.map(row).join('')
    );
  }
  var html =
    '<div class="ch-dd-search">' +
    '<span>' +
    icon('search', 'size-3.5') +
    '</span>' +
    '<input type="text" class="ch-dd-search-input" data-ch-act="provider-search" value="' +
    escAttr(search) +
    '" placeholder="' +
    escAttr(t('chats.searchProvider')) +
    '" />' +
    '</div>' +
    '<div class="ch-dd-list">' +
    group(t('chats.builtin'), builtIn) +
    group(t('chats.custom'), custom) +
    '</div>' +
    '<div class="ch-dd-foot">' +
    '<button type="button" class="ch-dd-action" data-ch-act="new-provider">' +
    icon('plus', 'size-3.5') +
    esc(t('chats.addProvider')) +
    '</button>' +
    '</div>';
  return html;
}

/* ---------- 模型组合框 ---------- */
export function modelDropdownHtml() {
  var d = effectiveDraft();
  var provider = providerById(d.providerId);
  var models = (provider && provider.models) || [];
  var fetched = state.view.fetchedModels || [];
  var all = [];
  var seen = {};
  fetched.concat(models).forEach(function (m) {
    if (!m || seen[m]) return;
    seen[m] = true;
    all.push(m);
  });
  var search = (state.view.modelSearch || '').toLowerCase();
  var filtered = all.filter(function (m) {
    return !search || m.toLowerCase().indexOf(search) !== -1;
  });
  var html =
    '<div class="ch-dd-search">' +
    '<span>' +
    icon('search', 'size-3.5') +
    '</span>' +
    '<input type="text" class="ch-dd-search-input" data-ch-act="model-search" value="' +
    escAttr(state.view.modelSearch || '') +
    '" placeholder="' +
    escAttr(t('chats.searchModel')) +
    '" />' +
    '</div>' +
    '<div class="ch-dd-list">' +
    filtered
      .map(function (m) {
        return (
          '<button type="button" class="ch-dd-item' +
          (d.model === m ? ' is-on' : '') +
          '" data-ch-act="set-model" data-value="' +
          escAttr(m) +
          '">' +
          '<span class="ch-dd-name">' +
          esc(m) +
          '</span>' +
          (d.model === m ? '<span class="ch-dd-check">' + icon('check', 'size-3.5') + '</span>' : '') +
          '</button>'
        );
      })
      .join('') +
    (filtered.length ? '' : '<div class="ch-dd-empty">' + esc(t('chats.noModelMatch')) + '</div>') +
    '</div>' +
    '<div class="ch-dd-foot">' +
    '<button type="button" class="ch-dd-action" data-ch-act="fetch-models">' +
    icon('refresh', 'size-3.5') +
    esc(t('chats.fetchModels')) +
    '</button>' +
    '</div>';
  return html;
}

/* ---------- MCP 下拉(父子开关) ---------- */
export function mcpDropdownHtml() {
  var d = effectiveDraft();
  var servers = (state.config && state.config.mcp) || [];
  var master = d.mcpEnabled;
  var html =
    '<div class="ch-dd-note">' +
    esc(t('chats.mcpHint')) +
    '</div>' +
    '<label class="ch-dd-switch-row">' +
    '<span class="ch-dd-switch-label">' +
    esc(t('chats.mcpEnabled')) +
    '</span>' +
    '<span role="switch" aria-checked="' +
    (master ? 'true' : 'false') +
    '" class="ch-switch' +
    (master ? ' is-on' : '') +
    '" data-ch-act="mcp-master"></span>' +
    '</label>' +
    '<div class="ch-dd-list">' +
    (servers.length
      ? servers.map(function (s) {
          return (
            '<div class="ch-mcp-server">' +
            '<label class="ch-dd-switch-row">' +
            '<span class="ch-dd-switch-label">' +
            icon('server', 'size-3.5') +
            '<span class="ch-dd-sname">' +
            esc(s.name) +
            '</span>' +
            '<span class="ch-dd-badge">' +
            esc(s.protocol === 'sse' ? 'sse' : 'http') +
            '</span>' +
            (s.enabled ? '' : '<span class="ch-dd-badge ch-dd-badge-off">' + esc(t('chats.disabled')) + '</span>') +
            '</span>' +
            '<span role="switch" aria-checked="' +
            (s.enabled ? 'true' : 'false') +
            '" class="ch-switch' +
            (s.enabled ? ' is-on' : '') +
            '" data-ch-act="mcp-server" data-id="' +
            escAttr(s.id) +
            '"></span>' +
            '</label>' +
            '<div class="ch-mcp-tools">' +
            (s.tools || []).map(function (tl) {
              return (
                '<label class="ch-dd-switch-row ch-mcp-tool' +
                (s.enabled ? '' : ' is-disabled') +
                '">' +
                '<span class="ch-dd-switch-label">' +
                '<span class="ch-dd-toolname">' +
                esc(tl.name) +
                '</span>' +
                '</span>' +
                '<span role="switch" aria-checked="' +
                (s.enabled && tl.enabled ? 'true' : 'false') +
                '" class="ch-switch' +
                (s.enabled && tl.enabled ? ' is-on' : '') +
                (s.enabled ? '' : ' is-disabled') +
                '" data-ch-act="mcp-tool" data-id="' +
                escAttr(s.id) +
                '" data-tool="' +
                escAttr(tl.name) +
                '"></span>' +
                '</label>'
              );
            }).join('') +
            '</div>' +
            '</div>'
          );
        }).join('')
      : '<div class="ch-dd-empty">' + esc(t('chats.noMcpServers')) + '</div>') +
    '</div>' +
    '<div class="ch-dd-foot">' +
    '<button type="button" class="ch-dd-action" data-ch-act="open-mcp-tab">' +
    esc(t('chats.manageMcp')) +
    '</button>' +
    '</div>';
  return html;
}

/* ---------- 联网搜索开关 ---------- */
function webSearchHtml(d) {
  var providers = ['duckduckgo', 'serper', 'tavily', 'bing', 'google'];
  return (
    '<div class="ch-websearch">' +
    '<button type="button" class="ch-websearch-toggle' +
    (d.webSearch ? ' is-on' : '') +
    '" data-ch-act="toggle-websearch" aria-pressed="' +
    (d.webSearch ? 'true' : 'false') +
    '" data-tip="' +
    escAttr(t('chats.webSearch')) +
    '" aria-label="' +
    escAttr(t('chats.webSearch')) +
    '">' +
    icon('globe', 'size-4') +
    '</button>' +
    (d.webSearch
      ? '<div class="ch-websearch-prov">' +
        providers
          .map(function (p) {
            return (
              '<button type="button" class="ch-ws-item' +
              (d.webSearchProvider === p ? ' is-on' : '') +
              '" data-ch-act="set-webprovider" data-value="' +
              p +
              '" data-tip="' +
              escAttr(t('chats.web.' + p)) +
              '">' +
              esc(t('chats.web.' + p)) +
              '</button>'
            );
          })
          .join('') +
        '</div>'
      : '') +
    '</div>'
  );
}

/* ---------- 主渲染 ---------- */
export function composerHtml() {
  var d = effectiveDraft();
  var hasInput = !!(state.view.composer && state.view.composer.trim()) || (state.view.attachments || []).length;
  var sending = state.streaming && state.streaming.active;
  var modelPlaceholder = d.model || t('chats.selectModel');
  var providerName = (providerById(d.providerId) || {}).name || d.providerId || t('chats.selectProvider');
  return (
    '<div class="ch-composer" data-ch-composer>' +
    '<div class="ch-composer-card">' +
    attachmentChipsHtml() +
    '<textarea class="ch-input" data-ch-input rows="1" placeholder="' +
    escAttr(t('chats.inputPlaceholder')) +
    '" aria-label="' +
    escAttr(t('chats.inputPlaceholder')) +
    '">' +
    esc(state.view.composer || '') +
    '</textarea>' +
    '<div class="ch-composer-bar">' +
    '<div class="ch-composer-left">' +
    '<button type="button" class="ch-composer-ctl" data-ch-act="provider-dd" aria-expanded="false" aria-haspopup="listbox">' +
    icon('boxes', 'size-3.5') +
    '<span class="ch-ctl-label">' +
    esc(providerName) +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-composer-ctl" data-ch-act="model-dd" aria-expanded="false" aria-haspopup="listbox">' +
    icon('cpu', 'size-3.5') +
    '<span class="ch-ctl-label ch-ctl-model">' +
    esc(modelPlaceholder) +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-composer-ctl" data-ch-act="thinking-dd" aria-expanded="false">' +
    icon('brain', 'size-3.5') +
    '<span class="ch-ctl-label">' +
    esc(thinkLabel(d.thinking)) +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-composer-ctl" data-ch-act="mcp-dd" aria-expanded="false">' +
    icon('server', 'size-3.5') +
    '<span class="ch-ctl-label">' +
    esc(t('chats.mcp')) +
    (d.mcpEnabled ? '<span class="ch-dot is-on"></span>' : '') +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '</div>' +
    '<div class="ch-composer-right">' +
    webSearchHtml(d) +
    '<input type="file" class="ch-hidden-input" data-ch-file="image" accept="image/*" multiple hidden />' +
    '<input type="file" class="ch-hidden-input" data-ch-file="file" multiple hidden />' +
    '<button type="button" class="ch-icon-btn" data-ch-act="insert-image" data-tip="' +
    escAttr(t('chats.insertImage')) +
    '" aria-label="' +
    escAttr(t('chats.insertImage')) +
    '">' +
    icon('image-plus', 'size-4') +
    '</button>' +
    '<button type="button" class="ch-icon-btn" data-ch-act="insert-file" data-tip="' +
    escAttr(t('chats.insertFile')) +
    '" aria-label="' +
    escAttr(t('chats.insertFile')) +
    '">' +
    icon('paperclip', 'size-4') +
    '</button>' +
    '<button type="button" class="ch-send' +
    (hasInput ? '' : ' is-disabled') +
    '" data-ch-act="send" aria-label="' +
    escAttr(t('chats.send')) +
    '"' +
    (hasInput && !sending ? '' : ' disabled') +
    '>' +
    (sending
      ? '<span class="ch-send-spin"></span>'
      : icon('send', 'size-4')) +
    '</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

/** 文件 chip 显示大小 */
export function attSize(bytes) {
  return fmtSize(bytes);
}
export function attIsImage(name) {
  return isImageFile(name);
}
export function attIsText(name) {
  return isTextFile(name);
}
