/* ============================================================
 * chat-logic.test.js — 纯逻辑域测试(无 DOM / 无 App 依赖)
 * 覆盖:三层参数合并(会话 > 供应商 > 全局)、白名单钳制、
 *       会话过滤/排序、MCP 父子开关、技能工具过滤、消息组装。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeParams,
  clampParams,
  filterConversations,
  sortConversations,
  groupConversationCount,
  effectiveMcpTools,
  skillToolIds,
  buildMessagesForSend,
  previewText,
  titleFromFirstUser,
  PARAM_RANGES,
} from './chat-logic.js';

/* ---------- 三层参数覆盖 ---------- */
test('mergeParams: 会话 > 供应商覆盖 > 全局默认 的覆盖顺序', () => {
  const merged = mergeParams(
    { temperature: 0.7, topP: 0.95, maxTokens: 8192 },
    { temperature: 1.1, maxTokens: 16384 },
    { temperature: 1.5 }
  );
  assert.equal(merged.temperature, 1.5); // 会话最优先
  assert.equal(merged.maxTokens, 16384); // 会话未设 → 供应商覆盖
  assert.equal(merged.topP, 0.95); // 会话/供应商未设 → 全局
});

test('mergeParams: 缺省层自动回退 DEFAULT_PARAMS', () => {
  const merged = mergeParams(null, null, null);
  assert.equal(merged.temperature, 0.7);
  assert.equal(merged.maxTokens, 8192);
  assert.equal(merged.topP, 0.95);
});

/* ---------- 白名单与钳制 ---------- */
test('clampParams: 越界值被钳制到白名单范围,未知参数剔除', () => {
  const out = clampParams({ temperature: 99, topP: -3, topK: 2000, maxTokens: 99999999, evil: 1 });
  assert.equal(out.temperature, PARAM_RANGES.temperature[1]);
  assert.equal(out.topP, PARAM_RANGES.topP[0]);
  assert.equal(out.topK, PARAM_RANGES.topK[1]);
  assert.equal(out.maxTokens, PARAM_RANGES.maxTokens[1]);
  assert.equal(out.evil, undefined);
});

test('clampParams: 非法值回退默认,空对象不产生键', () => {
  assert.equal(clampParams({ temperature: 'abc' }).temperature, 0.7);
  assert.deepEqual(clampParams({}), {});
});

/* ---------- 会话过滤/排序 ---------- */
const CONVS = [
  { id: 'a', title: 'Hello world', preview: 'first message', favorite: false, pinned: false, archived: false, groupId: 'g1', tagIds: ['t1'], updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'b', title: 'React bug', preview: 'fix the hook', favorite: true, pinned: false, archived: false, groupId: 'g2', tagIds: [], updatedAt: '2026-01-02T00:00:00Z' },
  { id: 'c', title: 'Old chat', preview: 'zzz', favorite: false, pinned: true, archived: false, groupId: '', tagIds: ['t1', 't2'], updatedAt: '2026-01-03T00:00:00Z' },
  { id: 'd', title: 'Gone', preview: 'archived item', favorite: false, pinned: false, archived: true, groupId: '', tagIds: [], updatedAt: '2026-01-04T00:00:00Z' },
];

test('filterConversations: 默认过滤排除 archived', () => {
  const out = filterConversations(CONVS, {});
  assert.deepEqual(out.map((c) => c.id), ['a', 'b', 'c']);
});

test('filterConversations: 全部/收藏/置顶/已存档胶囊', () => {
  assert.equal(filterConversations(CONVS, { filter: 'favorite' }).length, 1);
  assert.equal(filterConversations(CONVS, { filter: 'favorite' })[0].id, 'b');
  assert.equal(filterConversations(CONVS, { filter: 'pinned' })[0].id, 'c');
  assert.equal(filterConversations(CONVS, { filter: 'archived' })[0].id, 'd');
  // 「已存档」外均排除 archived(含「全部」)
  assert.equal(filterConversations(CONVS, { filter: 'all' }).length, 3);
});

test('filterConversations: 搜索按标题/预览(不区分大小写)', () => {
  assert.equal(filterConversations(CONVS, { search: 'REACT' })[0].id, 'b');
  assert.equal(filterConversations(CONVS, { search: 'zzz' })[0].id, 'c');
  assert.equal(filterConversations(CONVS, { search: 'nope' }).length, 0);
});

test('filterConversations: 分组过滤含子孙,标签过滤,未标记', () => {
  assert.equal(filterConversations(CONVS, { groupFilter: 'g1', groupDescendants: ['g1', 'g1x'] })[0].id, 'a');
  // 命中分组自身的会话保留;子孙列表为空时仅剩 g1 自身
  assert.deepEqual(filterConversations(CONVS, { groupFilter: 'g1', groupDescendants: [] }).map((c) => c.id), ['a']);
  assert.equal(filterConversations(CONVS, { groupFilter: 'g9', groupDescendants: ['g9'] }).length, 0);
  assert.equal(filterConversations(CONVS, { tagFilter: 't1' }).length, 2);
  assert.equal(filterConversations(CONVS, { tagFilter: '__untagged__' })[0].id, 'b');
});

test('sortConversations: pinned 优先,再按 updatedAt 降序', () => {
  const out = sortConversations(CONVS);
  assert.deepEqual(out.map((c) => c.id), ['c', 'd', 'b', 'a']);
});

test('groupConversationCount: 只计未存档会话,支持子孙分组', () => {
  assert.equal(groupConversationCount(CONVS, ['g1', 'g2']), 2);
  assert.equal(groupConversationCount(CONVS, ['g2']), 1);
  assert.equal(groupConversationCount(CONVS, ['g9']), 0);
});

/* ---------- MCP 父子开关 ---------- */
const SERVERS = [
  { id: 's1', enabled: true, tools: [{ name: 'web_search', enabled: true }, { name: 'read_file', enabled: false }] },
  { id: 's2', enabled: false, tools: [{ name: 'db_query', enabled: true }] },
  { id: 's3', enabled: true, tools: [{ name: 'calc', enabled: true }] },
];

test('effectiveMcpTools: 会话总开关关闭 → 全部不注入', () => {
  assert.deepEqual(effectiveMcpTools(SERVERS, false), []);
});

test('effectiveMcpTools: 服务器关闭 → 其下工具(即使 enabled)不注入', () => {
  const out = effectiveMcpTools(SERVERS, true);
  assert.deepEqual(out.map((e) => e.tool.name), ['web_search', 'calc']);
});

test('skillToolIds: 技能勾选 ∩ 已启用 MCP 工具', () => {
  const eff = effectiveMcpTools(SERVERS, true);
  assert.deepEqual(skillToolIds({ toolIds: ['web_search', 'db_query', 'calc', 'ghost'] }, eff), ['web_search', 'calc']);
  assert.deepEqual(skillToolIds({}, eff), []);
  assert.deepEqual(skillToolIds({ toolIds: [] }, eff), []);
});

/* ---------- 消息组装 ---------- */
test('buildMessagesForSend: 跳过流式空占位,用户消息 parts 化,助手携带工具', () => {
  const msgs = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: '' }, // 空占位 → 跳过
    { role: 'assistant', content: '**hello**', toolCalls: [{ id: 't1', name: 'calc' }] },
    { role: 'tool', toolCallId: 't1', toolResult: '42' },
    { role: 'user', content: [{ type: 'image_url', url: 'data:...' }, { type: 'text', text: '看这张图' }] },
  ];
  const out = buildMessagesForSend(msgs);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], { role: 'user', content: [{ type: 'text', text: 'hi' }] });
  assert.deepEqual(out[1].toolCalls, [{ id: 't1', name: 'calc' }]);
  assert.deepEqual(out[2], { role: 'tool', toolCallId: 't1', toolResult: '42' });
  assert.equal(out[3].content[0].type, 'image_url');
});

test('previewText: 文本截断 / 图片标注 / 附件标注', () => {
  assert.equal(previewText({ content: 'x'.repeat(300) }, 120).length, 120);
  assert.equal(previewText({ content: [{ type: 'image_url', url: 'x' }] }), '[图片]');
  assert.equal(previewText({ content: [{ type: 'file', name: 'a.txt' }] }), '[附件]');
});

test('titleFromFirstUser: 首条用户文本去换行', () => {
  assert.equal(titleFromFirstUser([{ role: 'assistant', content: 'x' }, { role: 'user', content: '你好\n世界' }]), '你好 世界');
  assert.equal(titleFromFirstUser([]), '');
});
