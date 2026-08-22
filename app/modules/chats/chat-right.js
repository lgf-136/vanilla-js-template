/* ============================================================
 * chat-right.js — chats 模块·右栏(参数设置 / MCP / Agent)
 * ------------------------------------------------------------
 * 默认折叠;三个 Tab 按职责拆分到兄弟文件:
 *   chat-right-params.js  参数 Tab(技能/提示词/供应商+API Key/模型/
 *                         自绘滑块/max_tokens 组合框)
 *   chat-right-mcp.js     MCP Tab(父子级开关服务器卡片 + 拉取工具)
 * 本文件含 Agent 占位 Tab + 主渲染 rightHtml,并 re-export 下拉
 * HTML 供 chat-events 消费(右栏内部下拉用 fixed 定位避免被裁剪)。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon } from './chat-store.js';
import { paramsTabHtml } from './chat-right-params.js';
import { mcpTabHtml } from './chat-right-mcp.js';

/* ---------- Agent Tab(占位) ---------- */
function agentTabHtml() {
  return (
    '<div class="ch-panel-scroll">' +
    '<div class="ch-agent-placeholder">' +
    '<span class="ch-agent-ic">' +
    icon('bot', 'size-8') +
    '</span>' +
    '<p>' +
    esc(t('chats.agentPlaceholder')) +
    '</p>' +
    '</div>' +
    '</div>'
  );
}

/* ---------- 主渲染 ---------- */
export function rightHtml() {
  var open = state.view.rightOpen;
  return (
    '<aside class="ch-right' +
    (open ? ' is-open' : '') +
    '" data-ch-right>' +
    '<div class="ch-right-head">' +
    '<div class="ch-tabs">' +
    [['params', 'sliders-horizontal'], ['mcp', 'server'], ['agent', 'bot']].map(function (tab) {
      var id = tab[0];
      var ic = tab[1];
      return (
        '<button type="button" class="ch-tab' +
        (state.view.rightTab === id ? ' is-on' : '') +
        '" data-ch-act="right-tab" data-value="' +
        id +
        '">' +
        icon(ic, 'size-3.5') +
        esc(t('chats.tab.' + id)) +
        '</button>'
      );
    }).join('') +
    '</div>' +
    '<button type="button" class="ch-icon-btn" data-ch-act="close-right" aria-label="' +
    escAttr(t('chats.close')) +
    '" data-tip="' +
    escAttr(t('chats.close')) +
    '">' +
    icon('x', 'size-4') +
    '</button>' +
    '</div>' +
    '<div class="ch-right-body">' +
    (state.view.rightTab === 'params'
      ? paramsTabHtml()
      : state.view.rightTab === 'mcp'
        ? mcpTabHtml()
        : agentTabHtml()) +
    '</div>' +
    '</aside>'
  );
}

/* ---------- re-export(供 chat-events 统一引用) ---------- */
export {
  paramsTabHtml,
  skillDropdownHtml,
  promptDropdownHtml,
  rightProviderDropdownHtml,
  maxTokensDropdownHtml,
} from './chat-right-params.js';
export { mcpTabHtml } from './chat-right-mcp.js';
export { openPopover, closePopover } from './chat-popover.js';
export { rerenderRight } from './chat-view.js';
