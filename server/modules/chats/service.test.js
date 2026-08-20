/* ============================================================
 * service.test.js — Chats 模块后端测试
 * 驱动 server/app.js 的 handleRequest(Web Request → Response),
 * 覆盖:会话/消息 CRUD、反馈、供应商 key 加密落库、提示词、
 * 分组/标签整表替换、偏好保存与路由门禁。
 * ============================================================ */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const serverApp = require('../../app');

const { handleRequest } = serverApp;

const testEnv = {
  DB_DRIVER: 'sqlite',
  SQLITE_PATH: ':memory:',
  NODE_ENV: 'test',
  AUTH_PASSWORD: 'template-test-password',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};

let token = '';

function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { accept: 'application/json' };
  if (auth && token) headers['x-auth-token'] = token;
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return handleRequest(new Request('http://nova.test/api' + path, { method, headers, body: payload }), testEnv);
}

async function json(response) {
  return { status: response.status, body: await response.json().catch(() => null) };
}

before(async () => {
  const login = await json(await call('/auth/login', { method: 'POST', auth: false, body: { password: testEnv.AUTH_PASSWORD, expiry: '24h' } }));
  assert.equal(login.status, 200, JSON.stringify(login.body));
  token = login.body.token;
  // 激活默认工作空间(与前端一致)
  await call('/settings', {
    method: 'PUT',
    body: { settings: { 'settings:activeWorkspace': 'ws-default' } },
  });
});

test('state: 首启种子(供应商/提示词)与分组/标签数组', async () => {
  const st = await json(await call('/chats/state'));
  assert.equal(st.status, 200, JSON.stringify(st.body));
  assert.ok(Array.isArray(st.body.providers));
  assert.ok(st.body.providers.length >= 10, '应包含内置供应商目录');
  assert.ok(Array.isArray(st.body.prompts));
  assert.ok(st.body.prompts.length > 0, '应包含内置提示词');
  assert.ok(Array.isArray(st.body.groups));
  assert.ok(Array.isArray(st.body.tags));
  assert.ok(st.body.providers.some((p) => p.key === 'opencode' && p.builtin && !p.baseUrl.endsWith('/')), 'opencode builtin 供应商存在');
});

test('conversation + message CRUD 与反馈', async () => {
  const created = await json(
    await call('/chats/conversations', {
      method: 'POST',
      body: { providerKey: 'opencode', model: 'mimo-v2.5' },
    })
  );
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const cv = created.body.conversation;
  assert.ok(cv && cv.id);
  assert.equal(cv.title, '新对话');

  const msg = await json(
    await call('/chats/conversations/' + cv.id + '/messages', {
      method: 'POST',
      body: { role: 'user', content: '你好', parts: [] },
    })
  );
  assert.equal(msg.status, 200, JSON.stringify(msg.body));
  assert.ok(msg.body.message && msg.body.message.id > 0);

  // 默认标题的会话首条消息自动更新标题
  const det = await json(await call('/chats/conversations/' + cv.id));
  assert.equal(det.body.conversation.title, '你好');

  const list = await json(await call('/chats/conversations/' + cv.id + '/messages'));
  assert.equal(list.body.messages.length, 1);

  // 评分反馈
  const fb = await json(
    await call('/chats/messages/' + msg.body.message.id, {
      method: 'PUT',
      body: { feedback: 'up' },
    })
  );
  assert.equal(fb.status, 200);
  assert.equal(fb.body.message.feedback, 'up');

  // 收藏 + 置顶
  const fav = await json(
    await call('/chats/conversations/' + cv.id, { method: 'PUT', body: { favorite: true, pinned: true } })
  );
  assert.equal(fav.body.conversation.favorite, true);
  assert.equal(fav.body.conversation.pinned, true);

  // 编辑用户消息
  const edited = await json(
    await call('/chats/messages/' + msg.body.message.id, {
      method: 'PUT',
      body: { content: '你好,请介绍你自己' },
    })
  );
  assert.equal(edited.body.message.content, '你好,请介绍你自己');

  // 删除会话级联清理
  const del = await json(await call('/chats/conversations/' + cv.id, { method: 'DELETE' }));
  assert.equal(del.status, 200);
  const gone = await json(await call('/chats/conversations/' + cv.id + '/messages'));
  assert.equal(gone.status, 404);
});

test('provider: api_key 加密落库且不回明文', async () => {
  const app = await serverApp.getOrCreateApp(testEnv);
  const saved = await json(
    await call('/chats/providers', {
      method: 'POST',
      body: { key: 'my-custom', name: '自定义', type: 'openai', baseUrl: 'https://example.com/v1', apiKey: 'sk-secret-123', models: ['m1'] },
    })
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.provider.hasApiKey, true);
  assert.equal(saved.body.provider.apiKey, undefined, 'api_key 不得随响应返回');

  const raw = await app.db.get("SELECT api_key FROM chats_providers WHERE key = 'my-custom' AND workspace_id = 'ws-default'");
  assert.ok(raw && raw.api_key.startsWith('enc:v1:'), 'api_key 必须 AES-GCM 加密落库');
  assert.ok(!raw.api_key.includes('sk-secret-123'), '不得明文落库');

  // 不传新 key 时保留旧 key
  const saved2 = await json(
    await call('/chats/providers', {
      method: 'POST',
      body: { key: 'my-custom', name: '自定义2', type: 'openai' },
    })
  );
  assert.equal(saved2.body.provider.hasApiKey, true, '未提供新 key 应保留旧 key');
});

test('prompts CRUD 与分组/标签整表替换', async () => {
  const p = await json(await call('/chats/prompts', { method: 'POST', body: { name: '测试提示', category: '测试', content: '你是测试助手' } }));
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const pid = p.body.prompt.id;

  const up = await json(await call('/chats/prompts/' + pid, { method: 'PUT', body: { content: '你是测试助手2' } }));
  assert.equal(up.body.prompt.content, '你是测试助手2');

  // 分组(含子分组)
  const g1 = { id: 'g-1', name: '工作', sort: 0 };
  const g2 = { id: 'g-2', name: '项目A', parentId: 'g-1', sort: 0 };
  const gs = await json(await call('/chats/groups', { method: 'PUT', body: { groups: [g1, g2] } }));
  assert.equal(gs.body.groups.length, 2);
  assert.equal(gs.body.groups[1].parentId, 'g-1');

  const tag1 = { id: 't-1', name: '重要', color: 'red', sort: 0 };
  const ts = await json(await call('/chats/tags', { method: 'PUT', body: { tags: [tag1] } }));
  assert.equal(ts.body.tags.length, 1);

  // 删除分组后会话 group_id 复位
  const created = await json(await call('/chats/conversations', { method: 'POST', body: { groupId: 'g-1' } }));
  const cv = created.body.conversation;
  await json(await call('/chats/groups', { method: 'PUT', body: { groups: [g2] } }));
  const det = await json(await call('/chats/conversations/' + cv.id));
  assert.equal(det.body.conversation.groupId, '', '被删分组的会话应复位');

  const dp = await json(await call('/chats/prompts/' + pid, { method: 'DELETE' }));
  assert.equal(dp.status, 200);
});

test('prefs 保存', async () => {
  const saved = await json(
    await call('/chats/prefs', {
      method: 'PUT',
      body: { prefs: { providerKey: 'opencode', model: 'mimo-v2.5', params: { temperature: 0.7 } } },
    })
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.body.prefs.providerKey, 'opencode');
  assert.equal(saved.body.prefs.params.temperature, 0.7);
});

test('未登录访问 /api/chats/state 返回 401', async () => {
  const denied = await json(await call('/chats/state', { auth: false }));
  assert.equal(denied.status, 401);
});

after(async () => {
  const app = await serverApp.getOrCreateApp(testEnv);
  // cleanup
});
