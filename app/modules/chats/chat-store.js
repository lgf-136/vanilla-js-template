/* ============================================================
 * chat-store.js — chats 模块·状态域(可变状态 + 数据加载/持久化)
 * ------------------------------------------------------------
 * 收敛全部可变状态:
 *   state.config     配置(分组/标签/自定义供应商/默认值/提示词/技能/MCP)
 *   state.secrets    密钥(providerKeys/searchKeys,服务端加密存储)
 *   state.conversations  会话列表元数据
 *   state.selectedId 当前会话(空 = 新会话)
 *   state.draft      当前会话生效选择(provider/model/promptId/skillId/
 *                    params/thinking/webSearch/mcpEnabled)
 *   state.view       界面状态(搜索/过滤/左右栏/输入框/附件)
 *   state.streaming  流式状态(active/controller)
 * 持久化:
 *   - 配置保存防抖 400ms(PUT /api/chat/config)
 *   - 会话保存防抖 300ms(POST /api/chat/conversations upsert)
 *   - 批量元数据变更立即落库
 *   - localStorage 会话选择记忆(按工作空间)+ 左右栏开关记忆
 * 依赖:chat-logic(纯逻辑)、chat-util、chat-view(重绘)。
 * ============================================================ */
'use strict';

import { mergeParams, clampParams, DEFAULT_PARAMS } from './chat-logic.js';
import { esc, escAttr, icon, uid, debounce } from './chat-util.js';
import { renderFull } from './chat-view.js';

export var state = {
  loaded: false,
  error: null,
  config: null,
  secrets: { providerKeys: {}, searchKeys: {} },
  providerCatalog: [],
  conversations: [],
  selectedId: null,
  draft: null,
  view: {
    search: '',
    filter: 'all', // all | favorite | pinned | archived
    groupFilter: null,
    tagFilter: null,
    leftOpen: true,
    rightOpen: false,
    rightTab: 'params',
    composer: '',
    attachments: [],
    overlay: false, // 移动端抽屉蒙版
  },
  streaming: null, // { conversationId, active, controller, streamId }
};

/* ---------- 词典 ---------- */
function moduleT() {
  var locale = (App.getShellContext && App.getShellContext().settings.locale) || 'zh-CN';
  var dict = window.__moduleI18n && window.__moduleI18n.chats;
  return App.i18n.makeT(locale, dict);
}
export var t = function (key, arg) {
  return moduleT()(key, arg);
};

/* ---------- 工具 ---------- */
export function groupById(id) {
  var g = state.config && state.config.groups || [];
  for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
  return null;
}
export function tagById(id) {
  var tg = state.config && state.config.tags || [];
  for (var i = 0; i < tg.length; i++) if (tg[i].id === id) return tg[i];
  return null;
}
export function conversationById(id) {
  var list = state.conversations || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
/** 分组(含子孙)id 列表 */
export function groupDescendants(groupId) {
  var out = [groupId];
  var nodes = (state.config && state.config.groups) || [];
  var changed = true;
  while (changed) {
    changed = false;
    nodes.forEach(function (n) {
      if (out.indexOf(n.id) === -1 && out.indexOf(n.parentId || '') !== -1) {
        out.push(n.id);
        changed = true;
      }
    });
  }
  return out;
}
export function providerById(id) {
  var cat = state.providerCatalog || [];
  for (var i = 0; i < cat.length; i++) if (cat[i].id === id) return cat[i];
  var custom = (state.config && state.config.providers) || [];
  for (var j = 0; j < custom.length; j++) if (custom[j].id === id) return custom[j];
  return null;
}
export function skillById(id) {
  var skills = (state.config && state.config.skills) || [];
  for (var i = 0; i < skills.length; i++) if (skills[i].id === (id || 'general')) return skills[i];
  return null;
}
export function promptById(id) {
  var prompts = (state.config && state.config.prompts) || [];
  for (var i = 0; i < prompts.length; i++) if (prompts[i].id === (id || 'general')) return prompts[i];
  return null;
}

/* ---------- 派生 ---------- */
export function activeConversation() {
  return state.selectedId ? conversationById(state.selectedId) : null;
}
export function draftMessages() {
  var c = activeConversation();
  return (c && c.messages) || [];
}
/** 当前会话生效参数(会话 > 供应商覆盖 > 全局默认) */
export function effectiveParams() {
  var c = activeConversation();
  var convParams = c && c.params ? c.params : (state.draft && state.draft.params) || {};
  var providerId = (c && c.provider) || (state.draft && state.draft.providerId) || (state.config && state.config.defaults.providerId) || 'opencode-zen';
  return mergeParams(state.config && state.config.defaults.params, providerId, convParams);
}
export function effectiveDraft() {
  var c = activeConversation();
  var d = state.config && state.config.defaults || {};
  return {
    providerId: (c && c.provider) || (state.draft && state.draft.providerId) || d.providerId || 'opencode-zen',
    model: (c && c.model) || (state.draft && state.draft.model) || d.model || '',
    promptId: (c && c.promptId) || (state.draft && state.draft.promptId) || d.promptId || 'general',
    skillId: (c && c.skillId) || (state.draft && state.draft.skillId) || d.skillId || 'general',
    params: effectiveParams(),
    thinking: (state.draft && state.draft.thinking) || d.thinking || 'none',
    webSearch: state.draft && state.draft.webSearch != null ? state.draft.webSearch : !!d.webSearch,
    webSearchProvider: (state.draft && state.draft.webSearchProvider) || d.webSearchProvider || 'duckduckgo',
    searchResults: (state.draft && state.draft.searchResults) || d.searchResults || 5,
    mcpEnabled: state.draft && state.draft.mcpEnabled != null ? state.draft.mcpEnabled : !!d.mcpEnabled,
  };
}

/* ---------- localStorage 记忆 ---------- */
function wsKey(suffix) {
  var ws = (state.config && state.config._ws) || 'ws-default';
  return 'chats:' + ws + ':' + suffix;
}
function lsGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
function lsSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    /* noop */
  }
}
export function rememberSelected(id) {
  lsSet(wsKey('lastConversation'), id || '');
}
export function restoreSelected() {
  var v = lsGet(wsKey('lastConversation'));
  return v || '';
}
function restoreView() {
  state.view.leftOpen = lsGet(wsKey('leftOpen')) !== '0';
  state.view.rightOpen = lsGet(wsKey('rightOpen')) === '1';
}
export function persistView() {
  lsSet(wsKey('leftOpen'), state.view.leftOpen ? '1' : '0');
  lsSet(wsKey('rightOpen'), state.view.rightOpen ? '1' : '0');
}

/* ---------- 数据加载 ---------- */
export function load() {
  Promise.all([App.api.get('/api/chat/state'), App.api.get('/api/chat/providers')])
    .then(function (results) {
      var data = results[0];
      var providers = results[1] || {};
      state.config = data.config || null;
      state.secrets = data.secrets || { providerKeys: {}, searchKeys: {} };
      state.config._ws = data.workspace || 'ws-default';
      state.conversations = data.conversations || [];
      state.providerCatalog = (providers.providers || []).slice();
      if (!state.config) {
        state.config = {
          groups: [], tags: [], providers: [], defaults: {}, prompts: [], skills: [], mcp: [],
        };
      }
      if (!state.secrets.providerKeys) state.secrets.providerKeys = {};
      if (!state.secrets.searchKeys) state.secrets.searchKeys = {};
      state.error = null;
      // 恢复界面状态(左栏展开/右栏折叠)
      restoreView();
      applyHashSelection();
      ensureSelected();
      state.loaded = true;
      renderFull();
    })
    .catch(function (e) {
      state.error = (e && e.message) || t('chats.loadFailed');
      renderFull();
    });
}

/** 会话选择:hash ?c=<id> 直达优先,否则 localStorage 记忆 */
function applyHashSelection() {
  var m = /[?&]c=([^&]+)/.exec(window.location.hash || '');
  if (m) {
    var id = decodeURIComponent(m[1]);
    if (conversationById(id)) {
      selectConversation(id, true);
      return true;
    }
  }
  return false;
}
function ensureSelected() {
  if (state.selectedId && conversationById(state.selectedId)) return;
  var remembered = restoreSelected();
  if (remembered && conversationById(remembered)) {
    selectConversation(remembered, true);
    return;
  }
  // 默认选择最新会话
  if (state.conversations.length) {
    selectConversation(state.conversations[0].id, true);
    return;
  }
  state.selectedId = null;
  state.draft = null;
}

/** 选中会话(静默模式不重绘,供初始化) */
export function selectConversation(id, silent) {
  state.selectedId = id || null;
  var c = id ? conversationById(id) : null;
  if (c) {
    state.draft = {
      providerId: c.provider || '',
      model: c.model || '',
      promptId: c.promptId || '',
      skillId: c.skillId || '',
      params: c.params || {},
      thinking: null,
      webSearch: null,
      webSearchProvider: null,
      searchResults: null,
      mcpEnabled: null,
    };
  } else {
    state.draft = null;
  }
  rememberSelected(id || '');
  if (!silent) {
    // 会话选择变化:清空输入框附件,关闭抽屉
    state.view.composer = '';
    state.view.attachments = [];
    if (window.innerWidth <= 960) state.view.leftOpen = false;
    renderFull();
  }
}

/** 新会话(清空草稿,保留界面) */
export function newChat() {
  state.selectedId = null;
  state.draft = null;
  state.view.composer = '';
  state.view.attachments = [];
  rememberSelected('');
  if (window.innerWidth <= 960) state.view.leftOpen = false;
  renderFull();
}

/* ---------- 持久化 ---------- */
var configTimer = null;
/** 配置保存防抖 400ms */
export function persistConfig() {
  if (!state.loaded || !state.config) return;
  if (configTimer) clearTimeout(configTimer);
  configTimer = setTimeout(function () {
    configTimer = null;
    // _ws 为运行时注入的派生字段,不随配置落库
    var cfg = Object.assign({}, state.config);
    delete cfg._ws;
    App.api
      .put('/api/chat/config', { config: cfg, secrets: state.secrets })
      .then(function () {})
      .catch(function (e) {
        App.ui.toast((e && e.data && e.data.message) || t('chats.saveFailed'), 'error');
      });
  }, 400);
}

var convTimer = null;
var pendingConv = null;
/** 会话保存防抖 300ms;saveNow=true 立即落库 */
export function persistConversation(saveNow) {
  var c = activeConversation();
  if (!c) return;
  pendingConv = c;
  if (saveNow) {
    if (convTimer) clearTimeout(convTimer);
    convTimer = null;
    saveConversationNow(c);
    return;
  }
  if (convTimer) clearTimeout(convTimer);
  convTimer = setTimeout(function () {
    convTimer = null;
    saveConversationNow(pendingConv || activeConversation());
  }, 300);
}
function saveConversationNow(c) {
  if (!c) return;
  var payload = {
    id: c.id,
    title: c.title || '',
    groupId: c.groupId || '',
    tagIds: c.tagIds || [],
    favorite: !!c.favorite,
    pinned: !!c.pinned,
    archived: !!c.archived,
    provider: c.provider || '',
    model: c.model || '',
    promptId: c.promptId || '',
    skillId: c.skillId || '',
    params: c.params || {},
    messages: c.messages || [],
  };
  App.api
    .put('/api/chat/conversations', payload)
    .then(function (data) {
      if (data && data.conversation) {
        // 用服务端返回更新元数据(含 updatedAt)
        var sv = data.conversation;
        Object.keys(sv).forEach(function (k) {
          if (k !== 'messages') c[k] = sv[k];
        });
      }
      refreshList();
    })
    .catch(function (e) {
      if (e && e.status !== 401) App.logger.warn('chats', '会话保存失败', e);
    });
}

/** 刷新会话列表(列表接口不返回 messages,仅元数据) */
export function refreshList() {
  // 流式进行中禁止整体重绘(避免干扰流式渲染与输入焦点)
  if (state.streaming && state.streaming.active) return;
  App.api
    .get('/api/chat/conversations')
    .then(function (data) {
      state.conversations = (data && data.conversations) || [];
      // 元数据变更同步到内存会话对象(避免覆盖流式中的 messages)
      var cur = activeConversation();
      state.conversations.forEach(function (meta) {
        var local = conversationById(meta.id);
        if (local && local !== meta) {
          var keep = {
            messages: local.messages,
            streaming: local.streaming,
          };
          Object.assign(local, meta);
          local.messages = keep.messages || [];
          local.streaming = keep.streaming;
        }
      });
      if (cur && !conversationById(cur.id)) {
        // 当前会话被删除
        state.selectedId = null;
        state.draft = null;
        ensureSelected();
      }
      renderFull();
    })
    .catch(function (e) {
      if (e && e.status !== 401) App.logger.warn('chats', '刷新会话列表失败', e);
    });
}

/** 会话对象工厂(新会话) */
export function createConversation(title) {
  var d = effectiveDraft();
  var c = {
    id: uid('conv'),
    title: title || '',
    groupId: '',
    tagIds: [],
    favorite: false,
    pinned: false,
    archived: false,
    provider: d.providerId,
    model: d.model,
    promptId: d.promptId,
    skillId: d.skillId,
    params: clampParams(d.params),
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.conversations.unshift(c);
  state.selectedId = c.id;
  state.draft = {
    providerId: c.provider,
    model: c.model,
    promptId: c.promptId,
    skillId: c.skillId,
    params: c.params,
    thinking: null,
    webSearch: null,
    webSearchProvider: null,
    searchResults: null,
    mcpEnabled: null,
  };
  rememberSelected(c.id);
  return c;
}

export { esc, escAttr, icon, uid, debounce };
