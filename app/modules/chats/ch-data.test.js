import { test } from 'node:test';
import assert from 'node:assert/strict';

/** 副作用导入：escape.js 无 export，加载后经 globalThis.App.escape 暴露 */
import '../../../shared/escape.js';

import {
  esc,
  CONVERSATIONS,
  initials,
  avatarHtml,
  fmtDate,
  fmtTime,
  groupMessages,
  usersWithoutMessages,
  findConversationById,
} from './ch-data.js';

test('CONVERSATIONS: 固定种子 10 个会话,字段完整', () => {
  assert.equal(CONVERSATIONS.length, 10);
  for (const c of CONVERSATIONS) {
    assert.match(c.id, /^conv\d+$/);
    assert.ok(c.fullName.length > 0);
    assert.ok(Array.isArray(c.messages) && c.messages.length > 0);
  }
});

test('initials: 取前两个单词首字母并大写', () => {
  assert.equal(initials('Alex John'), 'AJ');
  assert.equal(initials('alex john'), 'AJ');
  assert.equal(initials('Sophie Alex'), 'SA');
});

test('avatarHtml: 首字母转义 + 尺寸/字号成比例', () => {
  const size = 40;
  const html = avatarHtml('Alex John', size);
  assert.ok(html.startsWith('<span class="ch-avatar"'));
  assert.ok(html.includes(`width:${size}px;height:${size}px`));
  assert.ok(html.includes('AJ'));
  const html2 = avatarHtml('<b>&</b>', 32);
  // initials 只取前两个字符,首字符 '<' 必须被转义
  assert.ok(html2.includes('&lt;'), '名称必须转义');
  assert.ok(!html2.includes('<b>'), '原始尖括号不得直出');
});

test('fmtDate / fmtTime: 固定时间格式化', () => {
  assert.equal(fmtDate(new Date(2024, 7, 24)), '24 Aug, 2024');
  assert.equal(fmtTime(new Date(2024, 7, 24, 11, 15, 15)), '11:15 AM');
  assert.equal(fmtTime(new Date(2024, 7, 24, 0, 5, 0)), '12:05 AM');
  assert.equal(fmtTime(new Date(2024, 7, 24, 23, 59, 0)), '11:59 PM');
});

test('groupMessages: 按日期分组且保持组内顺序', () => {
  const msgs = [
    { sender: 'You', message: 'a', timestamp: '2024-08-24T11:15:15' },
    { sender: 'Alex', message: 'b', timestamp: '2024-08-23T09:15:00' },
    { sender: 'You', message: 'c', timestamp: '2024-08-23T09:16:00' },
  ];
  const groups = groupMessages(msgs);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, '24 Aug, 2024');
  assert.equal(groups[1].key, '23 Aug, 2024');
  assert.deepEqual(
    groups[1].items.map((m) => m.message),
    ['b', 'c']
  );
});

test('usersWithoutMessages: 联系人列表去消息体但保留字段', () => {
  const users = usersWithoutMessages();
  assert.equal(users.length, CONVERSATIONS.length);
  for (const u of users) {
    assert.equal(u.messages, undefined);
    assert.ok(u.fullName && u.username && u.title);
  }
});

test('findConversationById: 命中返回会话,未命中返回 null', () => {
  assert.equal(findConversationById('conv1').fullName, 'Alex John');
  assert.equal(findConversationById('nope'), null);
});

test('esc: 统一转义收敛点来自 shared/escape.js', () => {
  assert.equal(esc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.equal(esc(undefined), '');
});
