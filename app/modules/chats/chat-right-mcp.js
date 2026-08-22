/* ============================================================
 * chat-right-mcp.js — chats 模块·右栏·MCP Tab
 * ------------------------------------------------------------
 * mcpTabHtml()     MCP 面板(顶部协议提示 + 会话级总开关 + 服务器卡片
 *                  列表 + 「添加 MCP」按钮)
 * serverCardHtml   服务器卡片:名称 + 协议徽标 + 服务器级总开关(子工具
 *                  依赖总开关,关闭时整卡降透明度、工具开关禁用置灰)、
 *                  URL 单行省略、拉取工具列表(拉取中旋转)/编辑/删除、
 *                  「可用工具(N)」可折叠区(工具行 chevron 展开
 *                  description + 工具级开关)。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon, effectiveDraft } from './chat-store.js';

export function mcpTabHtml() {
  var d = effectiveDraft();
  var servers = (state.config && state.config.mcp) || [];
  var master = d.mcpEnabled;
  return (
    '<div class="ch-panel-scroll">' +
    '<div class="ch-mcp-hint">' +
    icon('shieldCheck', 'size-3.5') +
    '<span>' +
    esc(t('chats.mcpHintLong')) +
    '</span>' +
    '</div>' +
    '<label class="ch-mcp-master">' +
    '<span class="ch-mcp-master-label">' +
    esc(t('chats.mcpEnabled')) +
    '</span>' +
    '<span role="switch" aria-checked="' +
    (master ? 'true' : 'false') +
    '" class="ch-switch' +
    (master ? ' is-on' : '') +
    '" data-ch-act="mcp-master"></span>' +
    '</label>' +
    '<div class="ch-mcp-list">' +
    (servers.length
      ? servers.map(serverCardHtml).join('')
      : '<div class="ch-mcp-empty">' + esc(t('chats.noMcpServers')) + '</div>') +
    '</div>' +
    '<button type="button" class="ch-add-mcp" data-ch-act="add-mcp">' +
    icon('plus', 'size-4') +
    esc(t('chats.addMcp')) +
    '</button>' +
    '</div>'
  );
}

function serverCardHtml(s) {
  var fetching = state.view.fetchingMcp === s.id;
  var enabledTools = (s.tools || []).filter(function (tl) { return tl.enabled; }).length;
  return (
    '<div class="ch-mcp-card' +
    (s.enabled ? '' : ' is-off') +
    '" data-ch-mcp="' +
    escAttr(s.id) +
    '">' +
    '<div class="ch-mcp-head">' +
    '<span class="ch-mcp-badge">' +
    esc(s.protocol === 'sse' ? 'sse' : 'http') +
    '</span>' +
    '<span class="ch-mcp-name">' +
    esc(s.name) +
    '</span>' +
    '<span role="switch" aria-checked="' +
    (s.enabled ? 'true' : 'false') +
    '" class="ch-switch' +
    (s.enabled ? ' is-on' : '') +
    '" data-ch-act="mcp-server" data-id="' +
    escAttr(s.id) +
    '"></span>' +
    '</div>' +
    '<div class="ch-mcp-url" title="' +
    escAttr(s.url) +
    '">' +
    esc(s.url) +
    '</div>' +
    '<div class="ch-mcp-actions">' +
    '<button type="button" class="ch-mcp-btn' +
    (fetching ? ' is-spinning' : '') +
    '" data-ch-act="mcp-fetch" data-id="' +
    escAttr(s.id) +
    '"' +
    (s.enabled ? '' : ' disabled') +
    '>' +
    (fetching ? '<span class="ch-spin"></span>' : icon('refresh', 'size-3.5')) +
    esc(t('chats.mcpFetchTools')) +
    '</button>' +
    '<button type="button" class="ch-mcp-btn" data-ch-act="mcp-edit" data-id="' +
    escAttr(s.id) +
    '">' +
    icon('pencil', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-mcp-btn is-danger" data-ch-act="mcp-delete" data-id="' +
    escAttr(s.id) +
    '">' +
    icon('trash-2', 'size-3.5') +
    '</button>' +
    '</div>' +
    '<button type="button" class="ch-mcp-tools-head" data-ch-act="mcp-tools-toggle" data-id="' +
    escAttr(s.id) +
    '">' +
    '<span>' +
    esc(t('chats.availableTools', enabledTools)) +
    '</span>' +
    '<span class="ch-mcp-caret">' +
    icon('chevron-down', 'size-3.5') +
    '</span>' +
    '</button>' +
    '<div class="ch-mcp-tools-body' +
    (s._toolsOpen ? ' is-open' : '') +
    '">' +
    (s.enabled && !(s.tools || []).length
      ? '<div class="ch-mcp-tooltip">' + esc(t('chats.mcpFetchHint')) + '</div>'
      : '') +
    (!s.enabled && !(s.tools || []).length
      ? '<div class="ch-mcp-tooltip">' + esc(t('chats.disabled')) + '</div>'
      : '') +
    (s.tools || []).map(function (tl) {
      return (
        '<div class="ch-mcp-tool-row' +
        (s.enabled ? '' : ' is-disabled') +
        '" data-ch-mcptool="' +
        escAttr(s.id + ':' + tl.name) +
        '">' +
        '<button type="button" class="ch-mcp-tool-head" data-ch-act="mcp-tool-toggle" data-id="' +
        escAttr(s.id) +
        '" data-tool="' +
        escAttr(tl.name) +
        '">' +
        '<span class="ch-mcp-tool-caret">' +
        icon('chevron-right', 'size-3.5') +
        '</span>' +
        '<span class="ch-mcp-tool-name">' +
        esc(tl.name) +
        '</span>' +
        '</button>' +
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
        (tl._open
          ? '<div class="ch-mcp-tool-desc">' + esc(tl.description || '') + '</div>'
          : '') +
        '</div>'
      );
    }).join('') +
    '</div>' +
    '</div>'
  );
}
