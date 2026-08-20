/* ============================================================
 * schema.js — 数据库建表语句(单一事实来源)
 * ------------------------------------------------------------
 * 所有运行时的建表 SQL 都以本文件为准:
 *   - Node(dev-server.js / api/index.js)经 server/db/index.js 引用
 *   - Deno(deno/main.js)经 createRequire 引用
 *   - Cloudflare Worker(worker.js)直接 import(避免重复维护 SCHEMA)
 *
 * app_settings 按 workspace_id 分片(复合主键),工作空间隔离规则见
 * ./scope.js;auth_sessions 是登录会话基础设施,与工作空间无关,保持全局。
 * ============================================================ */
'use strict';

const { GLOBAL_WORKSPACE_ID } = require('./scope');

/** app_settings 单表建表语句(SCHEMA 与迁移共用,避免两处不一致) */
const APP_SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS app_settings (
  workspace_id TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (workspace_id, key)
);`;

/* ---------- API Hub 业务数据表(模块表,均含 workspace_id 列,不混入 app_settings) ---------- */

/** API Hub 配置表:每个工作空间一行,config 明文 / secrets 加密落库 */
const APIHUB_CONFIG_TABLE = `
CREATE TABLE IF NOT EXISTS apihub_config (
  workspace_id TEXT PRIMARY KEY,
  config       TEXT NOT NULL,
  secrets      TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);`;

/** API Hub 请求运行历史(工作空间隔离,条数上限由 loadHistory 控制) */
const APIHUB_HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS apihub_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  status       INTEGER NOT NULL,
  ts           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apihub_history_ws ON apihub_history (workspace_id, ts);`;

/** API Hub 请求访问日志(工作空间隔离,受条数上限 / 保留天数驱动) */
const APIHUB_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS apihub_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  status       INTEGER NOT NULL,
  ts           INTEGER NOT NULL,
  ip           TEXT,
  ua           TEXT,
  ms           INTEGER
);
CREATE INDEX IF NOT EXISTS idx_apihub_logs_ws ON apihub_logs (workspace_id, ts);`;

/* ---------- Chats 聊天模块业务数据表(模块表,均含 workspace_id 列) ---------- */

/** 聊天分组(多级树;父级 parent_id 空串表示根) */
const CHATS_GROUPS_TABLE = `
CREATE TABLE IF NOT EXISTS chats_groups (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  parent_id    TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL,
  sort         INTEGER NOT NULL DEFAULT 0,
  color        TEXT NOT NULL DEFAULT '',
  icon         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chats_groups_ws ON chats_groups (workspace_id, sort);`;

/** 聊天彩色标签(扁平) */
const CHATS_TAGS_TABLE = `
CREATE TABLE IF NOT EXISTS chats_tags (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '',
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chats_tags_ws ON chats_tags (workspace_id, sort);`;

/** 提示词(系统 Prompt 模板,内置分类:翻译/数学/工程/写作等) */
const CHATS_PROMPTS_TABLE = `
CREATE TABLE IF NOT EXISTS chats_prompts (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_chats_prompts_ws ON chats_prompts (workspace_id, sort);`;

/** 大模型供应商(内置目录按 key 复用;base_url 为空时用内置目录默认地址;api_key 密文落库) */
const CHATS_PROVIDERS_TABLE = `
CREATE TABLE IF NOT EXISTS chats_providers (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  key          TEXT NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'openai', -- openai | anthropic | gemini
  base_url     TEXT NOT NULL DEFAULT '',
  api_key      TEXT NOT NULL DEFAULT '',      -- 密文 enc:v1:...(AES-256-GCM)
  enabled      INTEGER NOT NULL DEFAULT 1,
  models       TEXT NOT NULL DEFAULT '[]',    -- 模型列表 JSON(自动获取/手动维护)
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_providers_key ON chats_providers (workspace_id, key);`;

/** MCP 服务器(streamable http / 传统 sse;tools 为 [{name,input_schema,enabled}] 快照 + 启用状态) */
const CHATS_MCP_TABLE = `
CREATE TABLE IF NOT EXISTS chats_mcp (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  protocol     TEXT NOT NULL DEFAULT 'http', -- http | sse
  url          TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  tools        TEXT NOT NULL DEFAULT '[]',
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_chats_mcp_ws ON chats_mcp (workspace_id, sort);`;

/** 会话(收藏 favorite / 置顶 pinned / 存档 archived / 分组 group_id / 标签 tag_ids JSON) */
const CHATS_CONVERSATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS chats_conversations (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '新对话',
  group_id     TEXT NOT NULL DEFAULT '',
  tag_ids      TEXT NOT NULL DEFAULT '[]',
  favorite     INTEGER NOT NULL DEFAULT 0,
  pinned       INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  provider_key TEXT NOT NULL DEFAULT '',
  model        TEXT NOT NULL DEFAULT '',
  prompt_id    TEXT NOT NULL DEFAULT '',
  params       TEXT NOT NULL DEFAULT '{}',
  web_search   TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_chats_conv_ws ON chats_conversations (workspace_id, pinned DESC, updated_at DESC);`;

/** 消息(角色/正文/多模态 parts/思考/工具调用/反馈);conversation 删除时级联清理 */
const CHATS_MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS chats_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,   -- system | user | assistant | tool
  content         TEXT NOT NULL DEFAULT '',
  parts           TEXT NOT NULL DEFAULT '[]',    -- 多模态附件 JSON
  thinking        TEXT NOT NULL DEFAULT '',
  tool_calls      TEXT NOT NULL DEFAULT '[]',    -- 工具调用记录 JSON
  feedback        TEXT,                          -- up | down | NULL
  usage           TEXT NOT NULL DEFAULT '{}',
  error           TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chats_messages_conv ON chats_messages (conversation_id, id);`;

const SCHEMA =
  APP_SETTINGS_TABLE +
  `
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,  -- 会话令牌的 SHA-256 哈希,绝不存明文令牌
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  note       TEXT
);` +
  APIHUB_CONFIG_TABLE +
  APIHUB_HISTORY_TABLE +
  APIHUB_LOGS_TABLE +
  CHATS_GROUPS_TABLE +
  CHATS_TAGS_TABLE +
  CHATS_PROMPTS_TABLE +
  CHATS_PROVIDERS_TABLE +
  CHATS_MCP_TABLE +
  CHATS_CONVERSATIONS_TABLE +
  CHATS_MESSAGES_TABLE;

/** 旧版 app_settings(key 单主键,无 workspace_id)→ 新版(复合主键)迁移步骤 */
const APP_SETTINGS_MIGRATION_SQL = [
  'ALTER TABLE app_settings RENAME TO app_settings_legacy',
  APP_SETTINGS_TABLE,
  'INSERT INTO app_settings (workspace_id, key, value, updated_at) SELECT ?, key, value, updated_at FROM app_settings_legacy',
  'DROP TABLE app_settings_legacy',
];

/** 列信息中是否已含 workspace_id(旧表无此列) */
function hasWorkspaceColumn(cols) {
  return (cols || []).some(function (c) {
    return c.name === 'workspace_id';
  });
}

/**
 * 异步迁移(供 Turso / D1 / Worker 调用):统一接口 db.query / db.run,
 * 兼容同步驱动(await 对普通数组无副作用)。
 * 旧数据统一迁入 global 作用域(保留不丢失),后续由前端注册表接管归属。
 */
async function migrateAppSettings(db) {
  const cols = await db.query('PRAGMA table_info(app_settings)');
  if (!cols || !cols.length) return; // 表不存在:SCHEMA 已按新结构建表
  if (hasWorkspaceColumn(cols)) return; // 已是新结构
  for (const sql of APP_SETTINGS_MIGRATION_SQL) {
    // 仅 INSERT ... SELECT ? 需要参数;其余 DDL 语句不带占位符
    await db.run(sql, sql.indexOf('?') !== -1 ? [GLOBAL_WORKSPACE_ID] : []);
  }
}

module.exports = {
  SCHEMA,
  APP_SETTINGS_TABLE,
  APIHUB_CONFIG_TABLE,
  APIHUB_HISTORY_TABLE,
  APIHUB_LOGS_TABLE,
  CHATS_GROUPS_TABLE,
  CHATS_TAGS_TABLE,
  CHATS_PROMPTS_TABLE,
  CHATS_PROVIDERS_TABLE,
  CHATS_MCP_TABLE,
  CHATS_CONVERSATIONS_TABLE,
  CHATS_MESSAGES_TABLE,
  APP_SETTINGS_MIGRATION_SQL,
  hasWorkspaceColumn,
  migrateAppSettings,
};
