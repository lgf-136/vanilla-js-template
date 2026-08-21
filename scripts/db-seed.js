/**
 * scripts/db-seed.js — 写入演示数据（`just db:seed`）
 * 仅支持本地 SQLite；先迁移再插入，全部参数化。
 * 演示数据与设置模块实际读取的 key 一致（settings:profile / account / notifications），
 * 敏感字段（邮箱）按 AGENTS 规范经 server/core/security 加密后落库。
 */

import '../server/core/env.js'; // 加载项目根目录 .env（使 SQLITE_PATH / AUTH_PASSWORD 等生效）
import { resolveDb } from '../server/db/resolver.js';
import { ensureMigrated } from '../server/db/migrate.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { encrypt } = require('../server/core/security/index.js');

const WORKSPACE = 'ws-default'; // 与 app/core/settings/（index.js 装配） 的默认工作空间一致
const NOW = new Date().toISOString();

/** 演示资料（settings:profile 属敏感键，整值经 AES-GCM 加密后落库） */
function demoProfile() {
  const profile = {
    username: 'template-admin',
    email: 'admin@example.com',
    bio: 'Migrated template demo account.',
    links: ['https://github.com/', ''],
    avatar: { type: 'initial', value: '' },
  };
  return encrypt(JSON.stringify(profile)); // 敏感键必须走加密封装，禁止明文入库
}

const DEMO_SETTINGS = [
  ['settings:profile', demoProfile()],
  [
    'settings:account',
    JSON.stringify({ name: 'Template Admin', dob: '', language: 'en' }),
  ],
  [
    'settings:notifications',
    JSON.stringify({
      type: 'all',
      communication: true,
      marketing: false,
      social: false,
      security: true,
      mobile: false,
    }),
  ],
];

async function main() {
  const { driver, db } = resolveDb(process.env);
  if (driver !== 'sqlite') {
    throw new Error('db:seed 仅支持本地 SQLite');
  }
  await ensureMigrated(db);

  for (const [key, value] of DEMO_SETTINGS) {
    await db.run(
      'INSERT OR REPLACE INTO app_settings (workspace_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [WORKSPACE, key, value, NOW]
    );
  }

  console.log(`[db:seed] ${driver} — 已写入 ${DEMO_SETTINGS.length} 条演示设置(工作空间 ${WORKSPACE})`);
  if (db && typeof db.close === 'function') db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[db:seed] 失败:', err.message);
  process.exit(1);
});
