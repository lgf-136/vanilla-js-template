/* ============================================================
 * chat-actions-config.js — chats 模块·动作域·配置 CRUD
 * ------------------------------------------------------------
 * 供应商 CRUD(id 由名称 slug 化,删除在用供应商自动回退默认)、
 * 提示词 CRUD(内置不可删)、技能 CRUD(内置 general 不可删)、
 * MCP CRUD(父子开关 + 拉取工具按名称合并保留 enabled)、
 * 模型拉取({baseUrl}/models,成功且未选模型时自动选第一个)。
 * ============================================================ */
'use strict';

import { state, t, uid, effectiveDraft } from './chat-store.js';
import { persistConfig } from './chat-store.js';
import { renderFull, rerenderRight } from './chat-view.js';
import { setProvider, setModel, saveConversationField, mcpById } from './chat-actions-params.js';

/* ---------- 供应商 CRUD ---------- */
/** 保存自定义供应商(payload: { id?, name, baseUrl, apiKey?, models, kind }) */
export function saveCustomProvider(payload) {
  var list = (state.config.providers = state.config.providers || []);
  if (payload.id) {
    var p = list.filter(function (x) { return x.id === payload.id; })[0];
    if (p) {
      p.name = payload.name;
      p.baseUrl = payload.baseUrl;
      p.kind = payload.kind || 'openai';
      p.models = payload.models;
      if (payload.apiKey) {
        state.secrets.providerKeys = state.secrets.providerKeys || {};
        state.secrets.providerKeys[p.id] = payload.apiKey;
      }
      persistConfig();
      renderFull();
      App.ui.closeDialog();
      App.ui.toast(t('chats.providerSaved'));
      return;
    }
  }
  // 新建:id 由名称 slug 化,重名自动加后缀
  var base = slug(payload.name);
  var id = 'cust-' + base;
  var n = 2;
  while (list.some(function (x) { return x.id === id; })) {
    id = 'cust-' + base + '-' + n++;
  }
  list.push({
    id: id,
    name: payload.name,
    baseUrl: payload.baseUrl,
    kind: payload.kind || 'openai',
    models: payload.models || [],
  });
  if (payload.apiKey) {
    state.secrets.providerKeys = state.secrets.providerKeys || {};
    state.secrets.providerKeys[id] = payload.apiKey;
  }
  persistConfig();
  renderFull();
  App.ui.closeDialog();
  App.ui.toast(t('chats.providerSaved'));
}
export function deleteCustomProvider(id) {
  state.config.providers = (state.config.providers || []).filter(function (x) {
    return x.id !== id;
  });
  delete state.secrets.providerKeys[id];
  // 删除正在使用的供应商时自动回退默认供应商
  var d = effectiveDraft();
  if (d.providerId === id) {
    setProvider(state.config.defaults.providerId || 'opencode-zen');
  }
  persistConfig();
  renderFull();
  App.ui.closeDialog();
  App.ui.toast(t('chats.providerDeleted'));
}
function slug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'provider';
}

/* ---------- 提示词 CRUD ---------- */
export function saveCustomPrompt(payload) {
  var list = (state.config.prompts = state.config.prompts || []);
  if (payload.id) {
    var p = list.filter(function (x) { return x.id === payload.id; })[0];
    if (p) {
      p.name = payload.name;
      p.content = payload.content;
      persistConfig();
      renderFull();
      App.ui.closeDialog();
      App.ui.toast(t('chats.promptSaved'));
      return;
    }
  }
  var base = slug(payload.name);
  var id = base;
  var n = 2;
  while (list.some(function (x) { return x.id === id; })) id = base + '-' + n++;
  list.push({ id: id, name: payload.name, content: payload.content });
  persistConfig();
  renderFull();
  App.ui.closeDialog();
  App.ui.toast(t('chats.promptSaved'));
}
export function deleteCustomPrompt(id) {
  // 内置提示词不可删除
  var builtIn = ['general', 'translator', 'mathematician', 'react-engineer', 'python-expert', 'code-reviewer', 'writing-assistant', 'sql-expert', 'plain-explainer'];
  if (builtIn.indexOf(id) !== -1) {
    App.ui.toast(t('chats.promptBuiltin'), 'error');
    return;
  }
  state.config.prompts = (state.config.prompts || []).filter(function (x) {
    return x.id !== id;
  });
  var d = effectiveDraft();
  if (d.promptId === id) {
    saveConversationField('promptId', 'general');
  }
  persistConfig();
  renderFull();
  App.ui.closeDialog();
  App.ui.toast(t('chats.promptDeleted'));
}

/* ---------- 技能 CRUD ---------- */
export function saveCustomSkill(payload) {
  var list = (state.config.skills = state.config.skills || []);
  if (payload.id) {
    var s = list.filter(function (x) { return x.id === payload.id; })[0];
    if (s) {
      s.name = payload.name;
      s.icon = payload.icon || 'sparkles';
      s.description = payload.description || '';
      s.systemPrompt = payload.systemPrompt || '';
      s.toolIds = payload.toolIds || [];
      s.paramsPreset = payload.paramsPreset || {};
      s.knowledgeDocs = payload.knowledgeDocs || [];
      persistConfig();
      renderFull();
      App.ui.closeDialog();
      App.ui.toast(t('chats.skillSaved'));
      return;
    }
  }
  var base = slug(payload.name);
  var id = base;
  var n = 2;
  while (list.some(function (x) { return x.id === id; })) id = base + '-' + n++;
  list.push({
    id: id,
    name: payload.name,
    icon: payload.icon || 'sparkles',
    description: payload.description || '',
    systemPrompt: payload.systemPrompt || '',
    toolIds: payload.toolIds || [],
    paramsPreset: payload.paramsPreset || {},
    knowledgeDocs: payload.knowledgeDocs || [],
  });
  persistConfig();
  renderFull();
  App.ui.closeDialog();
  App.ui.toast(t('chats.skillSaved'));
}
export function deleteCustomSkill(id) {
  if (id === 'general') {
    App.ui.toast(t('chats.skillBuiltin'), 'error');
    return;
  }
  state.config.skills = (state.config.skills || []).filter(function (x) {
    return x.id !== id;
  });
  var d = effectiveDraft();
  if (d.skillId === id) {
    saveConversationField('skillId', 'general');
  }
  persistConfig();
  renderFull();
  App.ui.closeDialog();
  App.ui.toast(t('chats.skillDeleted'));
}

/* ---------- MCP CRUD ---------- */
export function saveMcpServer(payload) {
  var list = (state.config.mcp = state.config.mcp || []);
  if (payload.id) {
    var s = list.filter(function (x) { return x.id === payload.id; })[0];
    if (s) {
      assignMcp(s, payload);
      persistConfig();
      renderFull();
      App.ui.closeDialog();
      App.ui.toast(t('chats.mcpSaved'));
      return;
    }
  }
  var server = {
    id: uid('mcp'),
    name: payload.name,
    url: payload.url,
    protocol: payload.protocol || 'https',
    apiKey: payload.apiKey || '',
    authHeader: payload.authHeader || '',
    headers: payload.headers || {},
    sort: Number(payload.sort) || 0,
    enabled: payload.enabled !== false,
    tools: [],
  };
  list.push(server);
  persistConfig();
  renderFull();
  App.ui.closeDialog();
  App.ui.toast(t('chats.mcpSaved'));
}
function assignMcp(s, payload) {
  s.name = payload.name;
  s.url = payload.url;
  s.protocol = payload.protocol || 'https';
  s.sort = Number(payload.sort) || 0;
  if (payload.apiKey !== undefined) s.apiKey = payload.apiKey;
  if (payload.authHeader !== undefined) s.authHeader = payload.authHeader;
  if (payload.headers !== undefined) s.headers = payload.headers;
  if (payload.enabled !== undefined) s.enabled = payload.enabled !== false;
}
export function deleteMcpServer(id) {
  state.config.mcp = (state.config.mcp || []).filter(function (x) {
    return x.id !== id;
  });
  persistConfig();
  renderFull();
  App.ui.closeDialog();
  App.ui.toast(t('chats.mcpDeleted'));
}
/** 拉取工具列表:按名称合并,保留既有 enabled,新工具默认启用 */
export function fetchMcpTools(id) {
  var s = mcpById(id);
  if (!s) return;
  state.view.fetchingMcp = id;
  rerenderRight();
  App.api
    .post('/api/chat/mcp/tools', {
      url: s.url,
      protocol: s.protocol || 'https',
      apiKey: s.apiKey || '',
      authHeader: s.authHeader || '',
      headers: s.headers || {},
    })
    .then(function (data) {
      var tools = (data && data.tools) || [];
      var existing = {};
      (s.tools || []).forEach(function (tl) {
        existing[tl.name] = tl;
      });
      s.tools = tools.map(function (tl) {
        var prev = existing[tl.name];
        return {
          name: tl.name,
          description: tl.description || '',
          inputSchema: tl.inputSchema || null,
          enabled: prev ? !!prev.enabled : true, // 新工具默认启用
        };
      });
      s._toolsOpen = true;
      state.view.fetchingMcp = null;
      App.ui.toast(t('chats.mcpFetched', s.tools.length));
      persistConfig();
      rerenderRight();
    })
    .catch(function (e) {
      state.view.fetchingMcp = null;
      App.ui.toast((e && e.data && e.data.message) || t('chats.mcpFetchFailed'), 'error');
      rerenderRight();
    });
}

/* ---------- 模型拉取 ---------- */
export function fetchModels() {
  var d = effectiveDraft();
  if (state.view.fetchingModels) return;
  state.view.fetchingModels = true;
  rerenderRight();
  App.api
    .post('/api/chat/models', { providerId: d.providerId })
    .then(function (data) {
      var models = (data && data.models) || [];
      state.view.fetchedModels = models;
      state.view.fetchingModels = false;
      if (!d.model && models.length) {
        setModel(models[0]); // 拉取成功且未选模型时自动选第一个
      }
      App.ui.toast(t('chats.modelsFetched', models.length));
      rerenderRight();
    })
    .catch(function (e) {
      state.view.fetchingModels = false;
      App.ui.toast((e && e.data && e.data.message) || t('chats.modelsFetchFailed'), 'error');
      rerenderRight();
    });
}
