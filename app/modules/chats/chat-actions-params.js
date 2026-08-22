/* ============================================================
 * chat-actions-params.js — chats 模块·动作域·参数保存
 * ------------------------------------------------------------
 * 三层覆盖:会话 > 供应商覆盖 > 全局默认(ARCHITECTURE §8)。
 * 保存路由:
 *   provider/model/promptId/skillId → 有会话写会话,无会话写 defaults
 *   thinking/webSearch/mcpEnabled  → defaults(全局)
 *   滑块与 max_tokens              → 有会话写会话 params,无会话写 defaults.params
 *   API Key                        → secrets(服务端加密落库)
 * ============================================================ */
'use strict';

import { state, t, activeConversation, persistConfig, persistConversation, effectiveDraft } from './chat-store.js';
import { clampParams } from './chat-logic.js';
import { parseMaxTokens } from './chat-util.js';
import { rerenderCenter, rerenderRight, rerenderHeader } from './chat-view.js';

export function saveConversationField(field, value) {
  var c = activeConversation();
  if (c) {
    c[field] = value;
    persistConversation();
    return;
  }
  var d = state.config.defaults;
  d[field] = value;
  persistConfig();
}
function saveParamsField(key, value) {
  var c = activeConversation();
  if (c) {
    c.params = Object.assign({}, c.params);
    c.params[key] = value;
    persistConversation();
    return;
  }
  var d = state.config.defaults;
  d.params = Object.assign({}, d.params, clampParams(Object.assign({}, d.params)));
  d.params[key] = value;
  persistConfig();
}
/** thinking / webSearch / mcpEnabled → 全局 defaults(第 8 节) */
function saveGlobalField(field, value) {
  state.config.defaults[field] = value;
  persistConfig();
}

export function setProvider(id) {
  if (!providerExists(id)) return;
  saveConversationField('provider', id);
  state.draft = state.draft || {};
  state.draft.providerId = id;
  rerenderCenter();
  rerenderRight();
  rerenderHeader();
}
export function setModel(model) {
  saveConversationField('model', String(model || ''));
  state.draft = state.draft || {};
  state.draft.model = String(model || '');
  rerenderCenter();
  rerenderRight();
  rerenderHeader();
}
export function setPrompt(id) {
  saveConversationField('promptId', id || 'general');
  state.draft = state.draft || {};
  state.draft.promptId = id || 'general';
  rerenderRight();
}
export function setSkill(id) {
  saveConversationField('skillId', id || 'general');
  state.draft = state.draft || {};
  state.draft.skillId = id || 'general';
  rerenderRight();
  rerenderHeader();
}
export function setThinking(level) {
  saveGlobalField('thinking', level);
  state.draft = state.draft || {};
  state.draft.thinking = level;
  rerenderCenter();
}
export function setParam(key, value) {
  saveParamsField(key, value);
  state.draft = state.draft || {};
  state.draft.params = Object.assign({}, state.draft.params, { [key]: value });
  rerenderRight();
}
export function setMaxTokens(value) {
  var n = parseMaxTokens(value);
  if (!n || n < 1) {
    App.ui.toast(t('chats.maxTokensInvalid'), 'error');
    return;
  }
  setParam('maxTokens', Math.min(n, 2000000));
}
export function setWebSearch(on) {
  saveGlobalField('webSearch', !!on);
  state.draft = state.draft || {};
  state.draft.webSearch = !!on;
  rerenderCenter();
}
export function setWebProvider(p) {
  saveGlobalField('webSearchProvider', p);
  state.draft = state.draft || {};
  state.draft.webSearchProvider = p;
  rerenderCenter();
}
export function setMcpMaster(on) {
  saveGlobalField('mcpEnabled', !!on);
  state.draft = state.draft || {};
  state.draft.mcpEnabled = !!on;
  rerenderCenter();
  rerenderRight();
}
export function setMcpServer(id, on) {
  var s = mcpById(id);
  if (!s) return;
  s.enabled = !!on;
  // 服务器关闭 → 其下子工具全部停用(开关禁用置灰)
  if (!on) {
    (s.tools || []).forEach(function (tl) {
      tl.enabled = false;
    });
  }
  persistConfig();
  rerenderRight();
}
export function setMcpTool(serverId, toolName, on) {
  var s = mcpById(serverId);
  if (!s || !s.enabled) return; // 子工具依赖服务器总开关
  var tl = (s.tools || []).filter(function (x) { return x.name === toolName; })[0];
  if (!tl) return;
  tl.enabled = !!on;
  persistConfig();
  rerenderRight();
}
export function setMcpToolsOpen(id, open) {
  var s = mcpById(id);
  if (s) {
    s._toolsOpen = !!open;
    rerenderRight();
  }
}
export function setMcpToolOpen(id, toolName, open) {
  var s = mcpById(id);
  if (s) {
    var tl = (s.tools || []).filter(function (x) { return x.name === toolName; })[0];
    if (tl) tl._open = !!open;
    rerenderRight();
  }
}
export function mcpById(id) {
  var list = state.config.mcp || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
function providerExists(id) {
  return !!(
    (state.providerCatalog || []).some(function (p) { return p.id === id; }) ||
    (state.config.providers || []).some(function (p) { return p.id === id; })
  );
}

/* ---------- API Key(按供应商独立存储,留空删除) ---------- */
export function saveApiKey(providerId, value) {
  state.secrets.providerKeys = state.secrets.providerKeys || {};
  var v = String(value == null ? '' : value).trim();
  if (v) {
    state.secrets.providerKeys[providerId] = v;
    App.ui.toast(t('chats.keySaved'));
  } else {
    delete state.secrets.providerKeys[providerId];
    App.ui.toast(t('chats.keyRemoved'));
  }
  persistConfig();
  rerenderRight();
}
