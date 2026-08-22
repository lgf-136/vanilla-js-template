/* ============================================================
 * chat-service.js — Chats 模块服务层(依赖注入 IO 编排)
 * ------------------------------------------------------------
 * createChatService(deps) 收拢全部 IO:
 *   - loadAll / saveAll:chat_config 配置与密钥(config 明文 /
 *     secrets 加密落库,按工作空间隔离;短 TTL 内存缓存)
 *   - 会话 CRUD:chat_conversations upsert 语义,列表返回元数据
 *     (preview 最后一条非空消息 ≤120 字 / previewRole / messageCount)
 *   - 模型列表拉取:{baseUrl}/models(Authorization Bearer <key>)
 *   - MCP 工具拉取:POST 服务器 tools/list
 * 错误约定:抛带 status/code 的 Error,routes 统一映射。
 * ============================================================ */
'use strict';

const { GLOBAL_WORKSPACE_ID } = require('../../db/scope');
const {
  PROVIDERS,
  PROVIDER_INDEX,
  defaultConfig,
  isPlainObject,
  parseJson,
  slugify,
  uid,
} = require('./chat-shared');
const { mcpListTools } = require('./chat-mcp');

const STATE_TTL_MS = 2000;

/** 预览文本:最长 120 字,取最后一条非空消息 */
function previewOf(messages) {
  if (!Array.isArray(messages)) return { preview: '', previewRole: '' };
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      return { preview: m.content.slice(0, 120), previewRole: 'assistant' };
    }
    if (m.role === 'user') {
      if (typeof m.content === 'string' && m.content.trim()) {
        return { preview: m.content.slice(0, 120), previewRole: 'user' };
      }
      if (Array.isArray(m.content)) {
        const parts = m.content.filter(function (p) { return p && p.type === 'text' && p.text; });
        if (parts.length) {
          return { preview: parts[parts.length - 1].text.slice(0, 120), previewRole: 'user' };
        }
        if (m.content.some(function (p) { return p && p.type === 'image_url'; })) {
          return { preview: '[图片]', previewRole: 'user' };
        }
      }
    }
  }
  return { preview: '', previewRole: '' };
}

function normalizeProvider(p, config) {
  // 内置目录优先;自定义供应商来自 config.providers
  if (p && PROVIDER_INDEX[p.id]) return PROVIDER_INDEX[p.id];
  if (p) return p;
  const id = config.defaults.providerId || 'opencode-zen';
  return PROVIDER_INDEX[id] || PROVIDERS[0];
}

function createChatService(deps) {
  const { db, encrypt, decrypt } = deps;
  let stateCache = null;

  async function resolveWorkspace() {
    const row = await db.get(
      "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
      [GLOBAL_WORKSPACE_ID]
    );
    return (row && row.value) || 'ws-default';
  }

  /** 读全量状态:config + secrets(secrets 解密失败回退 {});短 TTL 缓存 */
  async function loadAll(force) {
    const now = Date.now();
    if (!force && stateCache && now - stateCache.at < STATE_TTL_MS) return stateCache.value;
    const ws = await resolveWorkspace();
    const row = await db.get('SELECT config, secrets FROM chat_config WHERE workspace_id = ?', [ws]);
    let config = parseJson(row && row.config, null);
    if (!config || !isPlainObject(config)) config = defaultConfig();
    let secrets;
    try {
      secrets = row && row.secrets ? parseJson(decrypt(row.secrets), {}) : {};
    } catch (e) {
      secrets = {};
    }
    if (!isPlainObject(secrets)) secrets = {};
    if (!isPlainObject(secrets.providerKeys)) secrets.providerKeys = {};
    if (!isPlainObject(secrets.searchKeys)) secrets.searchKeys = {};
    stateCache = { at: now, value: { config: config, secrets: secrets, ws: ws } };
    return stateCache.value;
  }

  /** 保存配置与密钥(密钥加密落库;保存后立即失效缓存) */
  async function saveAll(payload) {
    if (!isPlainObject(payload)) throw Object.assign(new Error('需要 { config, secrets }'), { status: 400, code: 'bad_body' });
    let config = isPlainObject(payload.config) ? payload.config : defaultConfig();
    // 配置规范化:补齐缺省结构
    config = normalizeConfig(config);
    const secrets = isPlainObject(payload.secrets) ? payload.secrets : {};
    const cleanSecrets = {
      providerKeys: cleanMap(secrets.providerKeys),
      searchKeys: cleanMap(secrets.searchKeys),
    };
    const ws = await resolveWorkspace();
    await db.run(
      'INSERT INTO chat_config (workspace_id, config, secrets, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET config = excluded.config, secrets = excluded.secrets, updated_at = excluded.updated_at',
      [ws, JSON.stringify(config), encrypt(JSON.stringify(cleanSecrets)), new Date().toISOString()]
    );
    stateCache = null;
    return { config: config, secrets: cleanSecrets };
  }

  function cleanMap(map) {
    const out = {};
    if (isPlainObject(map)) {
      Object.keys(map).forEach(function (k) {
        if (typeof map[k] === 'string' && map[k]) out[k] = map[k].slice(0, 512);
      });
    }
    return out;
  }

  function normalizeConfig(config) {
    const d = defaultConfig();
    if (!Array.isArray(config.groups)) config.groups = d.groups;
    if (!Array.isArray(config.tags)) config.tags = d.tags;
    if (!Array.isArray(config.providers)) config.providers = d.providers;
    if (!isPlainObject(config.defaults)) config.defaults = d.defaults;
    if (!isPlainObject(config.defaults.params)) config.defaults.params = d.defaults.params;
    if (!Array.isArray(config.prompts)) config.prompts = d.prompts;
    if (!Array.isArray(config.skills)) config.skills = d.skills;
    if (!Array.isArray(config.mcp)) config.mcp = d.mcp;
    if (!config.version) config.version = d.version;
    // MCP 工具合并:保留既有 enabled(拉取合并逻辑在路由层)
    return config;
  }

  /* ---------- 会话 ---------- */
  async function listConversations() {
    const ws = await resolveWorkspace();
    const rows = await db.query(
      'SELECT id, title, group_id, tag_ids, favorite, pinned, archived, provider, model, prompt_id, skill_id, params, messages, created_at, updated_at FROM chat_conversations WHERE workspace_id = ? ORDER BY pinned DESC, updated_at DESC',
      [ws]
    );
    return (rows || []).map(function (r) {
      const messages = parseJson(r.messages, []);
      const p = previewOf(messages);
      return {
        id: r.id,
        title: r.title || '',
        groupId: r.group_id || '',
        tagIds: parseJson(r.tag_ids, []),
        favorite: !!r.favorite,
        pinned: !!r.pinned,
        archived: !!r.archived,
        provider: r.provider || '',
        model: r.model || '',
        promptId: r.prompt_id || '',
        skillId: r.skill_id || '',
        params: parseJson(r.params, {}),
        messageCount: Array.isArray(messages) ? messages.length : 0,
        preview: p.preview,
        previewRole: p.previewRole,
        createdAt: r.created_at || '',
        updatedAt: r.updated_at || '',
      };
    });
  }

  async function getConversation(id) {
    if (!id) throw Object.assign(new Error('缺少会话 id'), { status: 400, code: 'bad_id' });
    const ws = await resolveWorkspace();
    const row = await db.get('SELECT * FROM chat_conversations WHERE id = ? AND workspace_id = ?', [id, ws]);
    if (!row) throw Object.assign(new Error('会话不存在'), { status: 404, code: 'not_found' });
    return {
      id: row.id,
      title: row.title || '',
      groupId: row.group_id || '',
      tagIds: parseJson(row.tag_ids, []),
      favorite: !!row.favorite,
      pinned: !!row.pinned,
      archived: !!row.archived,
      provider: row.provider || '',
      model: row.model || '',
      promptId: row.prompt_id || '',
      skillId: row.skill_id || '',
      params: parseJson(row.params, {}),
      messages: parseJson(row.messages, []),
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
    };
  }

  /** upsert:有 id 且存在则更新,否则插入 */
  async function upsertConversation(conv) {
    if (!isPlainObject(conv)) throw Object.assign(new Error('需要会话对象'), { status: 400, code: 'bad_body' });
    const ws = await resolveWorkspace();
    const now = new Date().toISOString();
    const id = String(conv.id || uid('conv'));
    const existing = conv.id
      ? await db.get('SELECT id FROM chat_conversations WHERE id = ? AND workspace_id = ?', [conv.id, ws])
      : null;
    const messages = JSON.stringify(Array.isArray(conv.messages) ? conv.messages : []);
    const params = JSON.stringify(isPlainObject(conv.params) ? conv.params : {});
    const tagIds = JSON.stringify(Array.isArray(conv.tagIds) ? conv.tagIds : []);
    const fields = {
      title: String(conv.title || ''),
      group_id: String(conv.groupId || ''),
      tag_ids: tagIds,
      favorite: conv.favorite ? 1 : 0,
      pinned: conv.pinned ? 1 : 0,
      archived: conv.archived ? 1 : 0,
      provider: String(conv.provider || ''),
      model: String(conv.model || ''),
      prompt_id: String(conv.promptId || ''),
      skill_id: String(conv.skillId || ''),
      params: params,
      messages: messages,
      updated_at: now,
    };
    if (existing) {
      await db.run(
        'UPDATE chat_conversations SET title = ?, group_id = ?, tag_ids = ?, favorite = ?, pinned = ?, archived = ?, provider = ?, model = ?, prompt_id = ?, skill_id = ?, params = ?, messages = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
        [fields.title, fields.group_id, fields.tag_ids, fields.favorite, fields.pinned, fields.archived, fields.provider, fields.model, fields.prompt_id, fields.skill_id, fields.params, fields.messages, fields.updated_at, id, ws]
      );
    } else {
      await db.run(
        'INSERT INTO chat_conversations (id, workspace_id, title, group_id, tag_ids, favorite, pinned, archived, provider, model, prompt_id, skill_id, params, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, ws, fields.title, fields.group_id, fields.tag_ids, fields.favorite, fields.pinned, fields.archived, fields.provider, fields.model, fields.prompt_id, fields.skill_id, fields.params, fields.messages, now, now]
      );
    }
    return getConversation(id);
  }

  /** 批量删除(带 id 边界,仅删除当前工作空间) */
  async function deleteConversations(ids) {
    if (!Array.isArray(ids) || !ids.length) throw Object.assign(new Error('需要 ids 数组'), { status: 400, code: 'bad_ids' });
    const ws = await resolveWorkspace();
    const clean = ids.filter(function (x) { return typeof x === 'string' && x; }).slice(0, 200);
    const statements = clean.map(function (id) {
      return { sql: 'DELETE FROM chat_conversations WHERE id = ? AND workspace_id = ?', params: [id, ws] };
    });
    if (statements.length) await db.batch(statements);
    return { removed: clean.length };
  }

  /* ---------- 模型列表 ---------- */
  /** GET {baseUrl}/models(Authorization: Bearer <key>)→ data[].id */
  async function fetchModels(providerId) {
    const { config, secrets } = await loadAll();
    const p = normalizeProvider(PROVIDER_INDEX[providerId] || (config.providers || []).filter(function (x) { return x.id === providerId; })[0], config);
    if (!p) throw Object.assign(new Error('未知供应商'), { status: 400, code: 'invalid_provider' });
    let key = secrets.providerKeys && secrets.providerKeys[providerId];
    if (!key && process.env.CHAT_TEST_API_KEY && providerId === 'opencode-zen') {
      key = process.env.CHAT_TEST_API_KEY;
    }
    const localProvider = providerId === 'ollama' || providerId === 'lmstudio';
    if (!key && !localProvider) {
      throw Object.assign(new Error('供应商未配置 API Key'), { status: 400, code: 'no_api_key' });
    }
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      const res = await fetch(p.baseUrl.replace(/\/+$/, '') + '/models', {
        headers: key ? { Authorization: 'Bearer ' + key } : {},
        signal: controller.signal,
      });
      if (!res.ok) throw Object.assign(new Error('拉取模型失败 HTTP ' + res.status), { status: 502, code: 'fetch_models_failed' });
      const j = await res.json();
      const models = Array.isArray(j.data)
        ? j.data.map(function (m) { return m && m.id ? m.id : ''; }).filter(Boolean)
        : [];
      return { models: models };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- MCP 工具拉取 ---------- */
  /** POST 服务器 tools/list → [{name, description, inputSchema}] */
  async function fetchMcpTools(payload) {
    if (!isPlainObject(payload) || !payload.url) {
      throw Object.assign(new Error('需要 { url, protocol, ... }'), { status: 400, code: 'bad_body' });
    }
    const tools = await mcpListTools({
      url: String(payload.url).slice(0, 2000),
      protocol: payload.protocol === 'sse' ? 'sse' : 'https',
      apiKey: typeof payload.apiKey === 'string' ? payload.apiKey : '',
      authHeader: typeof payload.authHeader === 'string' ? payload.authHeader : '',
      headers: isPlainObject(payload.headers) ? payload.headers : {},
    });
    return { tools: tools };
  }

  /** 内置供应商目录(供前端渲染,不含密钥) */
  function providerCatalog() {
    return PROVIDERS.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        baseUrl: p.baseUrl,
        multimodal: !!p.multimodal,
        keyUrl: p.keyUrl || '',
        models: p.models || [],
      };
    });
  }

  return {
    loadAll,
    saveAll,
    listConversations,
    getConversation,
    upsertConversation,
    deleteConversations,
    fetchModels,
    fetchMcpTools,
    providerCatalog,
    resolveWorkspace,
    previewOf,
  };
}

module.exports = { createChatService, previewOf };
