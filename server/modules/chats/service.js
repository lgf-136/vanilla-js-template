/* ============================================================
 * service.js — Chats 模块数据层(增删改查 + 首启种子)
 * ------------------------------------------------------------
 * 所有业务 SQL 一律参数化;供应商 api_key 敏感,落库前 encrypt、
 * 读取时 decrypt,且绝不随列表/详情接口返回明文(只回 hasApiKey)。
 * 分组/标签整体数组替换(与 apihub 一致的存储方式,支持拖拽排序)。
 * ============================================================ */
'use strict';

const { GLOBAL_WORKSPACE_ID } = require('../../db/scope');
const AI = require('./ai');

const DEFAULT_WORKSPACE_ID = 'ws-default';
const PREFS_KEY = 'chats:settings';

function parseJson(text, fallback) {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validId(id) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''));
}

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function nowIso() {
  return new Date().toISOString();
}

function posInt(v, fallback, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
}

function clampF(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 清洗供应商行:api_key 密文保留,不回明文 */
function serializeProvider(row) {
  return AI.describeProvider(row);
}

function createService(deps) {
  const { db, encrypt, decrypt } = deps;

  async function resolveWorkspace() {
    const row = await db.get(
      "SELECT value FROM app_settings WHERE workspace_id = ? AND key = 'settings:activeWorkspace'",
      [GLOBAL_WORKSPACE_ID]
    );
    return (row && row.value) || DEFAULT_WORKSPACE_ID;
  }

  /** 读/写用户偏好(providerKey/model/params/thinking/promptId/webSearch/mcpIds) */
  async function loadPrefs(ws) {
    const row = await db.get('SELECT value FROM app_settings WHERE workspace_id = ? AND key = ?', [ws, PREFS_KEY]);
    const prefs = parseJson(row && row.value, {});
    return isPlainObject(prefs) ? prefs : {};
  }

  async function savePrefs(ws, patch) {
    const prefs = await loadPrefs(ws);
    const next = Object.assign({}, prefs, patch || {});
    await db.run(
      'INSERT INTO app_settings (workspace_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [ws, PREFS_KEY, JSON.stringify(next), nowIso()]
    );
    return next;
  }

  /** 首启:把内置供应商目录写入 chats_providers(幂等,按 key 补行) */
  async function ensureProvidersSeeded(ws) {
    const rows = await db.query('SELECT key FROM chats_providers WHERE workspace_id = ?', [ws]);
    const existing = {};
    (rows || []).forEach((r) => {
      existing[r.key] = true;
    });
    for (const p of AI.PROVIDER_CATALOG) {
      if (existing[p.key]) continue;
      await db.run(
        'INSERT INTO chats_providers (id, workspace_id, key, name, type, base_url, api_key, enabled, models, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          uid('pv'),
          ws,
          p.key,
          p.name,
          p.type,
          p.baseUrl,
          '',
          1,
          JSON.stringify(p.models || []),
          AI.PROVIDER_CATALOG.indexOf(p),
          nowIso(),
        ]
      );
    }
  }

  /** 内置提示词种子(幂等) */
  async function ensurePromptsSeeded(ws) {
    const row = await db.get('SELECT COUNT(*) AS n FROM chats_prompts WHERE workspace_id = ?', [ws]);
    if (row && Number(row.n) > 0) return;
    const builtins = [
      { category: '语言', name: '翻译家', content: '你是一位专业翻译。请把用户输入的内容翻译成目标语言输出,保留原文格式与代码块。若用户给出 \"翻译成中文/英文/日文\" 等指令则按其指定,否则默认译为简洁自然的中文。' },
      { category: '数学', name: '数学家', content: '你是一位严谨的数学家。解决问题时先列出已知条件,逐步推导,给出最终结论并附简洁验证。优先使用标准数学记号(LaTeX 用 $...$ / $$...$$)。' },
      { category: '工程', name: 'React 工程师', content: '你是一位资深 React + TypeScript + Tailwind CSS 工程师。产出代码遵循:函数组件 + hooks、类型完整、可复用拆分、shadcn/ui 风格、无障碍(键盘可达)与 tailwind 工具类。' },
      { category: '工程', name: '后端工程师 (Node)', content: '你是一位资深 Node.js 后端工程师,关注安全性(SQL 参数化、输入校验、敏感字段加密)、可维护性与边界处理。' },
      { category: '写作', name: '文案写手', content: '你是一位出色的中文文案写手,输出结构清晰、有感染力、无废话的文案。' },
      { category: '代码', name: '代码解释器', content: '请解释用户贴出的代码:先一句话概括功能,再按关键部分分条讲解,最后指出潜在问题与优化建议。' },
      { category: '代码', name: '单元测试专家', content: '你是一位单元测试专家,擅长编写覆盖边界与异常路径的测试用例。按用户需求产出可运行的测试代码。' },
    ];
    for (let i = 0; i < builtins.length; i++) {
      const b = builtins[i];
      await db.run(
        'INSERT INTO chats_prompts (id, workspace_id, name, category, content, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uid('pr'), ws, b.name, b.category, b.content, i, nowIso()]
      );
    }
  }

  /** 全量状态(左栏分组/标签 + 配置面板供应商/提示词/MCP + 会话列表 + 末条消息预览) */
  async function loadState(ws) {
    await ensureProvidersSeeded(ws);
    await ensurePromptsSeeded(ws);
    const [providers, prompts, mcpServers, groups, tags, conversations, prefs] = await Promise.all([
      db.query('SELECT * FROM chats_providers WHERE workspace_id = ? ORDER BY sort, name', [ws]),
      db.query('SELECT * FROM chats_prompts WHERE workspace_id = ? ORDER BY sort, created_at', [ws]),
      db.query('SELECT * FROM chats_mcp WHERE workspace_id = ? ORDER BY sort, created_at', [ws]),
      db.query('SELECT * FROM chats_groups WHERE workspace_id = ? ORDER BY sort, name', [ws]),
      db.query('SELECT * FROM chats_tags WHERE workspace_id = ? ORDER BY sort, name', [ws]),
      db.query('SELECT * FROM chats_conversations WHERE workspace_id = ? ORDER BY pinned DESC, updated_at DESC', [ws]),
      loadPrefs(ws),
    ]);
    // 会话末条消息预览(单次聚合查询,避免 N+1)
    const convIds = (conversations || []).map((r) => r.id);
    const previewMap = {};
    if (convIds.length) {
      const ph = convIds.map(() => '?').join(',');
      const prev = await db.query(
        'SELECT m.conversation_id, m.content, m.role, m.created_at FROM chats_messages m ' +
          'JOIN (SELECT conversation_id, MAX(id) AS mid FROM chats_messages WHERE conversation_id IN (' +
          ph +
          ') GROUP BY conversation_id) lm ON lm.conversation_id = m.conversation_id AND lm.mid = m.id',
        convIds
      );
      (prev || []).forEach((r) => {
        previewMap[r.conversation_id] = {
          role: r.role,
          text: String(r.content || '').replace(/\s+/g, ' ').slice(0, 90),
          at: r.created_at,
        };
      });
    }
    const bindMcp = (row) => ({
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      url: row.url,
      enabled: !!row.enabled,
      tools: parseJson(row.tools, []),
      sort: Number(row.sort) || 0,
    });
    const bindConv = (row) => {
      const p = previewMap[row.id];
      return {
        id: row.id,
        title: row.title,
        groupId: row.group_id || '',
        tagIds: parseJson(row.tag_ids, []),
        favorite: !!row.favorite,
        pinned: !!row.pinned,
        archived: !!row.archived,
        providerKey: row.provider_key || '',
        model: row.model || '',
        promptId: row.prompt_id || '',
        params: parseJson(row.params, {}),
        preview: p ? p.text : '',
        previewRole: p ? p.role : '',
        previewAt: p ? p.at : row.updated_at,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
      };
    };
    return {
      providers: (providers || []).map(serializeProvider).filter(Boolean),
      prompts: (prompts || []).map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category || '',
        content: r.content,
        sort: Number(r.sort) || 0,
      })),
      mcp: (mcpServers || []).map(bindMcp),
      groups: (groups || []).map((r) => ({
        id: r.id,
        parentId: r.parent_id || '',
        name: r.name,
        sort: Number(r.sort) || 0,
        color: r.color || '',
        icon: r.icon || '',
      })),
      tags: (tags || []).map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color || '',
        sort: Number(r.sort) || 0,
      })),
      conversations: (conversations || []).map(bindConv),
      prefs,
    };
  }

  /* ---------------- 分组 / 标签(整体数组替换并级联清理) ---------------- */

  async function saveGroups(ws, list) {
    if (!Array.isArray(list)) throw new Error('groups 需要是数组');
    const clean = [];
    const ids = {};
    const seen = {};
    for (const g of list) {
      if (!isPlainObject(g) || !validId(g.id) || !String(g.name || '').trim()) continue;
      if (seen[g.id]) continue;
      seen[g.id] = true;
      clean.push({
        id: String(g.id),
        parentId: validId(g.parentId) ? String(g.parentId) : '',
        name: String(g.name).trim().slice(0, 60),
        sort: Math.floor(Number(g.sort) || 0),
        color: typeof g.color === 'string' ? g.color.slice(0, 24) : '',
        icon: typeof g.icon === 'string' ? g.icon.slice(0, 16) : '',
      });
      ids[clean[clean.length - 1].id] = true;
    }
    // 父级必须存在于同一集合,否则视为根
    clean.forEach((g) => {
      if (g.parentId && !ids[g.parentId]) g.parentId = '';
    });
    await db.run('DELETE FROM chats_groups WHERE workspace_id = ?', [ws]);
    for (const g of clean) {
      await db.run(
        'INSERT INTO chats_groups (id, workspace_id, parent_id, name, sort, color, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [g.id, ws, g.parentId, g.name, g.sort, g.color, g.icon, nowIso()]
      );
    }
    // 删除的分组 → 会话 group_id 复位为空(归属根)
    const idList = clean.map((g) => g.id);
    if (idList.length) {
      const ph = idList.map(() => '?').join(',');
      await db.run(
        'UPDATE chats_conversations SET group_id = ? WHERE workspace_id = ? AND group_id != ? AND group_id NOT IN (' + ph + ')',
        ['', ws, '', ...idList]
      );
    } else {
      await db.run('UPDATE chats_conversations SET group_id = ? WHERE workspace_id = ?', ['', ws]);
    }
    return clean;
  }

  async function saveTags(ws, list) {
    if (!Array.isArray(list)) throw new Error('tags 需要是数组');
    const clean = [];
    const seen = {};
    for (const t of list) {
      if (!isPlainObject(t) || !validId(t.id) || !String(t.name || '').trim()) continue;
      if (seen[t.id]) continue;
      seen[t.id] = true;
      clean.push({
        id: String(t.id),
        name: String(t.name).trim().slice(0, 40),
        color: typeof t.color === 'string' ? t.color.slice(0, 24) : '',
        sort: Math.floor(Number(t.sort) || 0),
      });
    }
    await db.run('DELETE FROM chats_tags WHERE workspace_id = ?', [ws]);
    for (const t of clean) {
      await db.run(
        'INSERT INTO chats_tags (id, workspace_id, name, color, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [t.id, ws, t.name, t.color, t.sort, nowIso()]
      );
    }
    // 删除的标签 → 从会话 tag_ids 中移除
    const keepIds = clean.map((t) => t.id);
    const rows = await db.query('SELECT id, tag_ids FROM chats_conversations WHERE workspace_id = ?', [ws]);
    for (const r of rows) {
      const keep = parseJson(r.tag_ids, []).filter((tid) => keepIds.indexOf(tid) !== -1).slice(0, 20);
      await db.run('UPDATE chats_conversations SET tag_ids = ? WHERE id = ?', [JSON.stringify(keep), r.id]);
    }
    return clean;
  }

  /* ---------------- 会话 ---------------- */

  async function createConversation(ws, body) {
    const id = validId(body.id) ? body.id : uid('cv');
    const title = String(body.title || '').trim().slice(0, 80) || '新对话';
    const providerKey = String(body.providerKey || '').slice(0, 64);
    if (providerKey) {
      const p = await db.get('SELECT key FROM chats_providers WHERE key = ? AND workspace_id = ?', [providerKey, ws]);
      if (!p) throw new Error('供应商不存在: ' + providerKey);
    }
    const conv = {
      id,
      title,
      groupId: validId(body.groupId) ? body.groupId : '',
      tagIds: Array.isArray(body.tagIds) ? body.tagIds.filter(validId).slice(0, 20) : [],
      favorite: !!body.favorite,
      pinned: !!body.pinned,
      archived: !!body.archived,
      providerKey,
      model: String(body.model || '').trim().slice(0, 128),
      promptId: String(body.promptId || '').trim().slice(0, 64),
      params: isPlainObject(body.params) ? JSON.stringify(body.params) : '{}',
    };
    await db.run(
      'INSERT INTO chats_conversations (id, workspace_id, title, group_id, tag_ids, favorite, pinned, archived, provider_key, model, prompt_id, params, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [conv.id, ws, conv.title, conv.groupId, JSON.stringify(conv.tagIds), conv.favorite ? 1 : 0, conv.pinned ? 1 : 0, conv.archived ? 1 : 0, conv.providerKey, conv.model, conv.promptId, conv.params, nowIso(), nowIso()]
    );
    return getConversation(ws, conv.id);
  }

  async function getConversation(ws, id) {
    const row = await db.get('SELECT * FROM chats_conversations WHERE id = ? AND workspace_id = ?', [id, ws]);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      groupId: row.group_id || '',
      tagIds: parseJson(row.tag_ids, []),
      favorite: !!row.favorite,
      pinned: !!row.pinned,
      archived: !!row.archived,
      providerKey: row.provider_key || '',
      model: row.model || '',
      promptId: row.prompt_id || '',
      params: parseJson(row.params, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function updateConversation(ws, id, patch) {
    const cur = await db.get('SELECT * FROM chats_conversations WHERE id = ? AND workspace_id = ?', [id, ws]);
    if (!cur) return null;
    const next = {
      title: patch.title !== undefined ? String(patch.title).trim().slice(0, 80) : cur.title,
      groupId: patch.groupId !== undefined ? (validId(patch.groupId) ? patch.groupId : '') : cur.group_id,
      tagIds: patch.tagIds !== undefined ? (Array.isArray(patch.tagIds) ? patch.tagIds.filter(validId).slice(0, 20) : []) : parseJson(cur.tag_ids, []),
      favorite: patch.favorite !== undefined ? !!patch.favorite : !!cur.favorite,
      pinned: patch.pinned !== undefined ? !!patch.pinned : !!cur.pinned,
      archived: patch.archived !== undefined ? !!patch.archived : !!cur.archived,
      providerKey: patch.providerKey !== undefined ? String(patch.providerKey || '').slice(0, 64) : cur.provider_key,
      model: patch.model !== undefined ? String(patch.model || '').trim().slice(0, 128) : cur.model,
      promptId: patch.promptId !== undefined ? String(patch.promptId || '').trim().slice(0, 64) : cur.prompt_id,
      params: patch.params !== undefined ? (isPlainObject(patch.params) ? JSON.stringify(patch.params) : cur.params) : cur.params,
    };
    if (next.providerKey) {
      const p = await db.get('SELECT key FROM chats_providers WHERE key = ? AND workspace_id = ?', [next.providerKey, ws]);
      if (!p) next.providerKey = cur.provider_key;
    }
    await db.run(
      'UPDATE chats_conversations SET title = ?, group_id = ?, tag_ids = ?, favorite = ?, pinned = ?, archived = ?, provider_key = ?, model = ?, prompt_id = ?, params = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
      [next.title, next.groupId, JSON.stringify(next.tagIds), next.favorite ? 1 : 0, next.pinned ? 1 : 0, next.archived ? 1 : 0, next.providerKey, next.model, next.promptId, next.params, nowIso(), id, ws]
    );
    return getConversation(ws, id);
  }

  async function deleteConversation(ws, id) {
    await db.run('DELETE FROM chats_messages WHERE conversation_id = ?', [id]);
    await db.run('DELETE FROM chats_conversations WHERE id = ? AND workspace_id = ?', [id, ws]);
    return { ok: true };
  }

  /* ---------------- 消息 ---------------- */

  async function listMessages(ws, conversationId) {
    const conv = await db.get('SELECT id FROM chats_conversations WHERE id = ? AND workspace_id = ?', [conversationId, ws]);
    if (!conv) return null;
    const rows = await db.query('SELECT * FROM chats_messages WHERE conversation_id = ? ORDER BY id', [conversationId]);
    return (rows || []).map((r) => ({
      id: Number(r.id),
      role: r.role,
      content: r.content || '',
      parts: parseJson(r.parts, []),
      thinking: parseJson(r.thinking, null) || null,
      toolCalls: parseJson(r.tool_calls, []),
      feedback: r.feedback === 'up' || r.feedback === 'down' ? r.feedback : null,
      usage: parseJson(r.usage, {}),
      error: r.error || '',
      createdAt: r.created_at,
    }));
  }

  async function addMessage(ws, conversationId, body) {
    const conv = await db.get('SELECT id, title FROM chats_conversations WHERE id = ? AND workspace_id = ?', [conversationId, ws]);
    if (!conv) return null;
    const role = ['user', 'assistant', 'system'].indexOf(body.role) !== -1 ? body.role : 'user';
    const content = String(body.content || '');
    const parts = Array.isArray(body.parts) ? body.parts.slice(0, 20) : [];
    const feedback = body.feedback === 'up' || body.feedback === 'down' ? body.feedback : null;
    const ins = await db.run(
      'INSERT INTO chats_messages (conversation_id, role, content, parts, feedback, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [conversationId, role, content, JSON.stringify(parts), feedback, nowIso()]
    );
    await db.run('UPDATE chats_conversations SET updated_at = ? WHERE id = ?', [nowIso(), conversationId]);
    // 首条消息:自动按内容生成标题
    const auto = deriveTitle(content, parts);
    if (auto && (conv.title === '新对话' || !conv.title)) {
      await db.run('UPDATE chats_conversations SET title = ? WHERE id = ?', [auto, conversationId]);
    }
    const id = ins && ins.lastInsertRowid ? Number(ins.lastInsertRowid) : null;
    const rows = await listMessages(ws, conversationId);
    return rows && id ? rows.find((m) => m.id === id) : null;
  }

  function deriveTitle(content, parts) {
    let text = String(content || '').trim();
    if (!text && Array.isArray(parts) && parts.length) {
      const first = parts.find((p) => p && p.type === 'text' && p.text);
      text = String(first && first.text || '').trim();
    }
    text = text.replace(/\s+/g, ' ').slice(0, 30);
    return text || null;
  }

  async function updateMessage(ws, messageId, patch) {
    const row = await db.get('SELECT id, conversation_id FROM chats_messages WHERE id = ?', [messageId]);
    if (!row) return null;
    const conv = await db.get('SELECT id FROM chats_conversations WHERE id = ? AND workspace_id = ?', [row.conversation_id, ws]);
    if (!conv) return null;
    const fields = [];
    const params = [];
    if (patch.content !== undefined) {
      fields.push('content = ?');
      params.push(String(patch.content || ''));
    }
    if (patch.parts !== undefined) {
      fields.push('parts = ?');
      params.push(JSON.stringify(Array.isArray(patch.parts) ? patch.parts.slice(0, 20) : []));
    }
    if (patch.feedback !== undefined) {
      fields.push('feedback = ?');
      params.push(patch.feedback === 'up' || patch.feedback === 'down' ? patch.feedback : null);
    }
    if (patch.role && ['user', 'assistant', 'system'].indexOf(patch.role) !== -1) {
      fields.push('role = ?');
      params.push(patch.role);
    }
    if (fields.length) {
      params.push(messageId);
      await db.run('UPDATE chats_messages SET ' + fields.join(', ') + ' WHERE id = ?', params);
    }
    await db.run('UPDATE chats_conversations SET updated_at = ? WHERE id = ?', [nowIso(), row.conversation_id]);
    const rows = await listMessages(ws, row.conversation_id);
    return rows ? rows.find((m) => m.id === Number(messageId)) || null : null;
  }

  async function deleteMessage(ws, messageId) {
    const row = await db.get('SELECT id, conversation_id FROM chats_messages WHERE id = ?', [messageId]);
    if (!row) return { ok: false, reason: 'not_found' };
    await db.run('DELETE FROM chats_messages WHERE id = ?', [messageId]);
    // 级联删除之后的所有消息(保持对话一致性)
    await db.run('DELETE FROM chats_messages WHERE conversation_id = ? AND id > ?', [row.conversation_id, messageId]);
    return { ok: true, conversationId: row.conversation_id };
  }

  /** 删除某条用户消息之后的所有 assistant 消息(编辑后再生成) */
  async function truncateAfter(ws, messageId) {
    const row = await db.get('SELECT id, conversation_id FROM chats_messages WHERE id = ?', [messageId]);
    if (!row) return { ok: false };
    await db.run('DELETE FROM chats_messages WHERE conversation_id = ? AND id > ?', [row.conversation_id, messageId]);
    return { ok: true, conversationId: row.conversation_id };
  }

  /* ---------------- 供应商 ---------------- */

  async function listProviders(ws) {
    await ensureProvidersSeeded(ws);
    const rows = await db.query('SELECT * FROM chats_providers WHERE workspace_id = ? ORDER BY sort, name', [ws]);
    return (rows || []).map(serializeProvider).filter(Boolean);
  }

  async function saveProvider(ws, body) {
    const key = String(body.key || '').trim();
    if (!validKey(key)) throw new Error('供应商 key 只能包含字母/数字/下划线/连字符');
    const existing = await db.get('SELECT * FROM chats_providers WHERE key = ? AND workspace_id = ?', [key, ws]);
    const cat = AI.catalog(key);
    const name = String(body.name || '').trim().slice(0, 60) || (cat && cat.name) || key;
    const type = ['openai', 'anthropic', 'gemini'].indexOf(body.type) !== -1 ? body.type : (cat && cat.type) || 'openai';
    const baseUrl = String(body.baseUrl || '').trim().slice(0, 300);
    const models = Array.isArray(body.models) ? body.models.map((m) => String(m).trim().slice(0, 128)).filter(Boolean).slice(0, 200) : [];
    const sort = posInt(body.sort, existing ? Number(existing.sort) || 0 : 0, 100000);
    const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim().slice(0, 512) : '';
    if (existing) {
      // 保持已有 key(未提供新 key 时不覆盖)
      const encKey = apiKey ? encrypt(apiKey) : existing.api_key;
      await db.run(
        'UPDATE chats_providers SET name = ?, type = ?, base_url = ?, api_key = ?, enabled = ?, models = ?, sort = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
        [name, type, baseUrl, encKey, body.enabled === false ? 0 : 1, JSON.stringify(models), sort, nowIso(), existing.id, ws]
      );
      return serializeProvider(await db.get('SELECT * FROM chats_providers WHERE id = ?', [existing.id]));
    }
    const id = uid('pv');
    await db.run(
      'INSERT INTO chats_providers (id, workspace_id, key, name, type, base_url, api_key, enabled, models, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, ws, key, name, type, baseUrl, apiKey ? encrypt(apiKey) : '', body.enabled === false ? 0 : 1, JSON.stringify(models), sort, nowIso()]
    );
    return serializeProvider(await db.get('SELECT * FROM chats_providers WHERE id = ?', [id]));
  }

  function validKey(k) {
    return /^[A-Za-z0-9_-]{1,48}$/.test(k);
  }

  async function saveProviderModels(ws, key, models) {
    const clean = Array.isArray(models) ? models.map((m) => String(m).trim().slice(0, 128)).filter(Boolean).slice(0, 500) : [];
    await db.run('UPDATE chats_providers SET models = ?, updated_at = ? WHERE key = ? AND workspace_id = ?', [JSON.stringify(clean), nowIso(), key, ws]);
    return clean;
  }

  async function deleteProvider(ws, id) {
    await db.run('DELETE FROM chats_providers WHERE id = ? AND workspace_id = ?', [id, ws]);
    // 引用该供应商的会话保留 key,以便将来重新添加时还原
    return { ok: true };
  }

  /* ---------------- MCP ---------------- */

  async function saveMcp(ws, id, body) {
    const existing = id ? await db.get('SELECT * FROM chats_mcp WHERE id = ? AND workspace_id = ?', [id, ws]) : null;
    const name = String(body.name || '').trim().slice(0, 60) || (existing && existing.name) || 'MCP 服务器';
    const protocol = body.protocol === 'sse' ? 'sse' : 'http';
    const url = String(body.url || '').trim().slice(0, 400);
    if (!/^https?:\/\//.test(url)) throw new Error('请输入合法的 http(s) 地址');
    const enabled = body.enabled === undefined ? (existing ? !!existing.enabled : true) : !!body.enabled;
    const tools = Array.isArray(body.tools) ? body.tools : parseJson(existing && existing.tools, []);
    const sort = posInt(body.sort, existing ? Number(existing.sort) || 0 : 0, 100000);
    if (existing) {
      await db.run(
        'UPDATE chats_mcp SET name = ?, protocol = ?, url = ?, enabled = ?, tools = ?, sort = ?, updated_at = ? WHERE id = ?',
        [name, protocol, url, enabled ? 1 : 0, JSON.stringify(tools), sort, nowIso(), id]
      );
      const row = await db.get('SELECT * FROM chats_mcp WHERE id = ?', [id]);
      return mcpOut(row);
    }
    const nid = uid('mc');
    await db.run(
      'INSERT INTO chats_mcp (id, workspace_id, name, protocol, url, enabled, tools, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nid, ws, name, protocol, url, enabled ? 1 : 0, JSON.stringify(tools), sort, nowIso(), nowIso()]
    );
    const row = await db.get('SELECT * FROM chats_mcp WHERE id = ?', [nid]);
    return mcpOut(row);
  }

  function mcpOut(row) {
    return {
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      url: row.url,
      enabled: !!row.enabled,
      tools: parseJson(row.tools, []),
      sort: Number(row.sort) || 0,
    };
  }

  async function deleteMcp(ws, id) {
    await db.run('DELETE FROM chats_mcp WHERE id = ? AND workspace_id = ?', [id, ws]);
    AI.closeMcp(id);
    return { ok: true };
  }

  /** 测试 MCP 连接并抓取工具(写回 tools 快照与启用状态) */
  async function testMcp(ws, body) {
    const protocol = body.protocol === 'sse' ? 'sse' : 'http';
    const url = String(body.url || '').trim();
    if (!/^https?:\/\//.test(url)) throw new Error('请输入合法的 http(s) 地址');
    const conn = await AI.connectMcp({ id: 'tmp-' + Date.now(), name: body.name || '测试', protocol, url });
    const tools = (conn.tools || []).map((t) => ({
      name: t.name,
      description: (t.description || '').slice(0, 300),
      inputSchema: t.inputSchema || null,
      enabled: true,
    }));
    return { tools };
  }

  return {
    resolveWorkspace,
    loadPrefs,
    savePrefs,
    loadState,
    saveGroups,
    saveTags,
    createConversation,
    getConversation,
    updateConversation,
    deleteConversation,
    listMessages,
    addMessage,
    updateMessage,
    deleteMessage,
    truncateAfter,
    listProviders,
    saveProvider,
    saveProviderModels,
    deleteProvider,
    saveMcp,
    deleteMcp,
    testMcp,
  };
}

module.exports = { createService, DEFAULT_WORKSPACE_ID, PREFS_KEY };
