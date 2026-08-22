/* ============================================================
 * chat-dialogs-mcp.js — chats 模块·弹窗域·MCP / 供应商管理
 * ------------------------------------------------------------
 * openMcpDialog       MCP 服务器 新建/编辑(协议 https|sse / URL /
 *                     API Key / 鉴权头 / 自定义 Headers 键值行 / 排序 /
 *                     启用开关)
 * confirmSaveMcp      校验 + 收集 → saveMcpServer(Authorization 由
 *                     API Key 管理,跳过同名 header)
 * openProviderManageDialog  内置 + 自定义供应商列表(API Key / 编辑 /
 *                     删除入口)
 * openApiKeyDialog    任意供应商 API Key 输入(留空删除)
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon } from './chat-store.js';
import { fieldHtml, inputValue } from './chat-dialogs-util.js';
import { saveMcpServer } from './chat-actions.js';

/* ---------- MCP 服务器弹窗 ---------- */
export function openMcpDialog(server) {
  var isEdit = !!server;
  var headers = (server && server.headers) || {};
  var headerRows = Object.keys(headers).map(function (k) {
    return [k, headers[k]];
  });
  if (!headerRows.length) headerRows = [['', '']];
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(isEdit ? t('chats.mcpEdit') : t('chats.addMcp')) + '</h3>',
    body:
      '<div class="ch-dlg-form">' +
      fieldHtml(t('chats.mcpName'), '<input type="text" class="ch-input-sm" data-ch-act="mcp-name" value="' + escAttr((server && server.name) || '') + '" />') +
      fieldHtml(
        t('chats.mcpProtocol'),
        '<div class="ch-seg" role="tablist">' +
          ['https', 'sse']
            .map(function (p) {
              return (
                '<button type="button" role="tab" aria-selected="' +
                ((server ? server.protocol : 'https') === p ? 'true' : 'false') +
                '" class="ch-seg-item' +
                ((server ? server.protocol : 'https') === p ? ' is-on' : '') +
                '" data-ch-act="mcp-protocol" data-value="' +
                p +
                '">' +
                esc(p === 'https' ? 'Streamable HTTP' : 'SSE') +
                '</button>'
              );
            })
            .join('') +
          '</div>'
      ) +
      fieldHtml(t('chats.mcpUrl'), '<input type="text" class="ch-input-sm" data-ch-act="mcp-url" value="' + escAttr((server && server.url) || '') + '" placeholder="https://…" />') +
      fieldHtml(t('chats.mcpApiKey'), '<input type="password" class="ch-input-sm" data-ch-act="mcp-apikey" value="' + escAttr((server && server.apiKey) || '') + '" placeholder="' + escAttr(t('chats.mcpApiKeyPlaceholder')) + '" autocomplete="off" />') +
      fieldHtml(t('chats.mcpAuthHeader'), '<input type="text" class="ch-input-sm" data-ch-act="mcp-authheader" value="' + escAttr((server && server.authHeader) || '') + '" placeholder="Authorization" />') +
      fieldHtml(
        t('chats.mcpHeaders'),
        '<div class="ch-dlg-headers" data-ch-headers>' +
          headerRows
            .map(function (row, i) {
              return (
                '<div class="ch-dlg-header-row">' +
                '<input type="text" class="ch-input-sm" data-ch-header-key="' +
                i +
                '" value="' +
                escAttr(row[0]) +
                '" placeholder="' +
                escAttr(t('chats.headerName')) +
                '" />' +
                '<input type="text" class="ch-input-sm" data-ch-header-val="' +
                i +
                '" value="' +
                escAttr(row[1]) +
                '" placeholder="' +
                escAttr(t('chats.headerValue')) +
                '" />' +
                '<button type="button" class="ch-icon-btn is-danger" data-ch-act="mcp-header-remove" data-index="' +
                i +
                '" aria-label="' +
                escAttr(t('chats.remove')) +
                '">' +
                icon('x', 'size-3.5') +
                '</button>' +
                '</div>'
              );
            })
            .join('') +
          '<button type="button" class="ch-btn ch-btn-sm" data-ch-act="mcp-header-add">' +
          icon('plus', 'size-3.5') +
          esc(t('chats.addHeader')) +
          '</button>' +
          '</div>'
      ) +
      fieldHtml(t('chats.mcpSort'), '<input type="number" class="ch-input-sm" data-ch-act="mcp-sort" value="' + escAttr(String((server && server.sort) || 0)) + '" />') +
      '<label class="ch-dlg-switch">' +
      '<span>' +
      esc(t('chats.mcpEnableServer')) +
      '</span>' +
      '<span role="switch" aria-checked="' +
      (server ? (server.enabled !== false ? 'true' : 'false') : 'true') +
      '" class="ch-switch' +
      (server ? (server.enabled !== false ? ' is-on' : '') : ' is-on') +
      '" data-ch-act="mcp-enable"></span>' +
      '</label>' +
      '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="mcp-save" data-id="' +
      escAttr((server && server.id) || '') +
      '">' +
      esc(t('chats.save')) +
      '</button>',
  });
}

export function confirmSaveMcp(id) {
  var name = inputValue('[data-ch-act="mcp-name"]');
  var url = inputValue('[data-ch-act="mcp-url"]');
  if (!name || !url) {
    App.ui.toast(t('chats.mcpRequired'), 'error');
    return;
  }
  var protocolEl = document.querySelector('[data-ch-act="mcp-protocol"].is-on');
  var protocol = protocolEl ? protocolEl.getAttribute('data-value') : 'https';
  var apiKey = inputValue('[data-ch-act="mcp-apikey"]');
  var authHeader = inputValue('[data-ch-act="mcp-authheader"]');
  var sort = Number(inputValue('[data-ch-act="mcp-sort"]')) || 0;
  var enabled = !!document.querySelector('[data-ch-act="mcp-enable"].is-on');
  // 收集 headers 键值行(Authorization 由 API Key 字段管理,跳过)
  var headers = {};
  document.querySelectorAll('[data-ch-header-key]').forEach(function (el) {
    var k = String(el.value || '').trim();
    var v = inputValue('[data-ch-header-val="' + el.getAttribute('data-ch-header-key') + '"]');
    if (k && k.toLowerCase() !== 'authorization') headers[k] = v;
  });
  saveMcpServer({
    id: id || '',
    name: name,
    url: url,
    protocol: protocol,
    apiKey: apiKey,
    authHeader: authHeader,
    headers: headers,
    sort: sort,
    enabled: enabled,
  });
}

/* ---------- 供应商管理(列表 + 编辑/删除) ---------- */
export function openProviderManageDialog() {
  var builtIn = state.providerCatalog || [];
  var custom = (state.config && state.config.providers) || [];
  var rows =
    builtIn
      .map(function (p) {
        return (
          '<div class="ch-dlg-row">' +
          '<div class="ch-dlg-row-main">' +
          '<span class="ch-dlg-row-name">' +
          esc(p.name) +
          '</span>' +
          '<span class="ch-dlg-row-preview">' +
          esc(p.baseUrl) +
          '</span>' +
          '</div>' +
          '<span class="ch-dlg-row-actions">' +
          '<button type="button" class="ch-icon-btn" data-ch-act="provider-apikey" data-id="' +
          escAttr(p.id) +
          '" data-tip="' +
          escAttr(t('chats.apiKey')) +
          '" aria-label="' +
          escAttr(t('chats.apiKey')) +
          '">' +
          icon('key-round', 'size-3.5') +
          '</button>' +
          '</span>' +
          '</div>'
        );
      })
      .join('') +
    custom
      .map(function (p) {
        return (
          '<div class="ch-dlg-row">' +
          '<div class="ch-dlg-row-main">' +
          '<span class="ch-dlg-row-name">' +
          esc(p.name) +
          '</span>' +
          '<span class="ch-dlg-row-preview">' +
          esc(p.baseUrl) +
          '</span>' +
          '</div>' +
          '<span class="ch-dlg-row-actions">' +
          '<button type="button" class="ch-icon-btn" data-ch-act="provider-edit" data-id="' +
          escAttr(p.id) +
          '" data-tip="' +
          escAttr(t('chats.edit')) +
          '" aria-label="' +
          escAttr(t('chats.edit')) +
          '">' +
          icon('pencil', 'size-3.5') +
          '</button>' +
          '<button type="button" class="ch-icon-btn is-danger" data-ch-act="provider-delete" data-id="' +
          escAttr(p.id) +
          '" data-tip="' +
          escAttr(t('chats.delete')) +
          '" aria-label="' +
          escAttr(t('chats.delete')) +
          '">' +
          icon('trash-2', 'size-3.5') +
          '</button>' +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(t('chats.providerManage')) + '</h3>',
    body: '<div class="ch-dlg-list">' + (rows || '<div class="ch-dlg-empty">' + esc(t('chats.noProviders')) + '</div>') + '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.close')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="new-provider">' +
      icon('plus', 'size-3.5') +
      esc(t('chats.addProvider')) +
      '</button>',
  });
}

/** API Key 输入弹窗(任意供应商;按供应商独立存储,留空删除) */
export function openApiKeyDialog(providerId) {
  var p =
    state.providerCatalog.filter(function (x) { return x.id === providerId; })[0] ||
    (state.config.providers || []).filter(function (x) { return x.id === providerId; })[0] ||
    { name: providerId };
  var key = state.secrets.providerKeys && state.secrets.providerKeys[providerId];
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(t('chats.apiKey') + ' · ' + (p.name || providerId)) + '</h3>',
    body:
      '<div class="ch-dlg-form">' +
      fieldHtml(
        t('chats.apiKey'),
        '<input type="password" class="ch-input-sm" data-ch-act="apikey-input" value="' +
          escAttr(key || '') +
          '" placeholder="' +
          escAttr(t('chats.apiKeyPlaceholder')) +
          '" autocomplete="off" />'
      ) +
      '<p class="ch-field-desc">' +
      esc(t('chats.apiKeyHint')) +
      '</p>' +
      '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="apikey-save" data-id="' +
      escAttr(providerId) +
      '">' +
      esc(t('chats.save')) +
      '</button>',
  });
}
