/* ============================================================
 * ch-data.js — chats 模块·数据域(固定种子会话数据 + 纯函数)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件为最底层数据域,无副作用:
 * - CONVERSATIONS 固定种子数据(10 个会话,与参考项目一致)
 * - 纯函数:esc(转义收敛)、initials/avatarColor/avatarHtml 头像、
 *   fmtDate/fmtTime 时间格式、groupMessages 按日分组、
 *   usersWithoutMessages 联系人列表、findConversationById
 * 依赖:App.escape(App 全局)。方向:data ← store ← view ← events。
 * ============================================================ */
'use strict';

/** 统一转义（shared/escape.js，红线 13） */
export var esc = App.escape.escHtml;

/* ---------- 会话数据(与参考项目一致) ---------- */
export var CONVERSATIONS = [
  {
    id: 'conv1',
    fullName: 'Alex John',
    username: 'alex_dev',
    title: 'Senior Backend Dev',
    messages: [
      { sender: 'You', message: 'See you later, Alex!', timestamp: '2024-08-24T11:15:15' },
      {
        sender: 'Alex',
        message: 'Alright, talk to you later!',
        timestamp: '2024-08-24T11:11:30',
      },
      {
        sender: 'You',
        message: 'For sure. Anyway, I should get back to reviewing the project.',
        timestamp: '2024-08-23T09:26:50',
      },
      {
        sender: 'Alex',
        message: 'Yeah, let me know what you think.',
        timestamp: '2024-08-23T09:25:15',
      },
      {
        sender: 'You',
        message: "Oh, nice! I've been waiting for that. I'll check it out later.",
        timestamp: '2024-08-23T09:24:30',
      },
      {
        sender: 'Alex',
        message: "They've added a dark mode option! It looks really sleek.",
        timestamp: '2024-08-23T09:23:10',
      },
      { sender: 'You', message: "No, not yet. What's new?", timestamp: '2024-08-23T09:22:00' },
      {
        sender: 'Alex',
        message: 'By the way, have you seen the new feature update?',
        timestamp: '2024-08-23T09:21:05',
      },
      { sender: 'You', message: 'Will do! Thanks, Alex.', timestamp: '2024-08-23T09:20:10' },
      {
        sender: 'Alex',
        message: 'Great! Let me know if you need any help.',
        timestamp: '2024-08-23T09:19:20',
      },
      {
        sender: 'You',
        message: 'Almost done. Just need to review a few things.',
        timestamp: '2024-08-23T09:18:45',
      },
      {
        sender: 'Alex',
        message: "I'm good, thanks! Did you finish the project?",
        timestamp: '2024-08-23T09:17:10',
      },
      {
        sender: 'You',
        message: "Hey Alex, I'm doing well! How about you?",
        timestamp: '2024-08-23T09:16:30',
      },
      {
        sender: 'Alex',
        message: 'Hey Bob, how are you doing?',
        timestamp: '2024-08-23T09:15:00',
      },
    ],
  },
  {
    id: 'conv2',
    fullName: 'Taylor Grande',
    username: 'taylor.codes',
    title: 'Tech Lead',
    messages: [
      {
        sender: 'Taylor',
        message: "Yeah, it's really well-explained. You should give it a try.",
        timestamp: '2024-08-23T10:35:00',
      },
      { sender: 'You', message: 'Not yet, is it good?', timestamp: '2024-08-23T10:32:00' },
      {
        sender: 'Taylor',
        message: 'Hey, did you check out that new tutorial?',
        timestamp: '2024-08-23T10:30:00',
      },
    ],
  },
  {
    id: 'conv3',
    fullName: 'John Doe',
    username: 'john_stack',
    title: 'QA',
    messages: [
      { sender: 'You', message: 'Yep, see ya. 👋🏼', timestamp: '2024-08-22T18:59:00' },
      { sender: 'John', message: 'Great, see you then!', timestamp: '2024-08-22T18:55:00' },
      {
        sender: 'You',
        message: "Yes, same time as usual. I'll send the invite shortly.",
        timestamp: '2024-08-22T18:50:00',
      },
      {
        sender: 'John',
        message: 'Are we still on for the meeting tomorrow?',
        timestamp: '2024-08-22T18:45:00',
      },
    ],
  },
  {
    id: 'conv4',
    fullName: 'Megan Flux',
    username: 'megan_frontend',
    title: 'Jr Developer',
    messages: [
      { sender: 'You', message: 'Sure ✌🏼', timestamp: '2024-08-23T11:30:00' },
      { sender: 'Megan', message: 'Thanks, appreciate it!', timestamp: '2024-08-23T11:30:00' },
      {
        sender: 'You',
        message: "Sure thing! I'll take a look in the next hour.",
        timestamp: '2024-08-23T11:25:00',
      },
      {
        sender: 'Megan',
        message: 'Hey! Do you have time to review my PR today?',
        timestamp: '2024-08-23T11:20:00',
      },
    ],
  },
  {
    id: 'conv5',
    fullName: 'David Brown',
    username: 'dev_david',
    title: 'Senior UI/UX Designer',
    messages: [
      {
        sender: 'You',
        message: "Great, I'll review them now!",
        timestamp: '2024-08-23T12:00:00',
      },
      {
        sender: 'David',
        message: 'Just sent you the files. Let me know if you need any changes.',
        timestamp: '2024-08-23T11:58:00',
      },
      {
        sender: 'David',
        message: 'I finished the design for the dashboard. Thoughts?',
        timestamp: '2024-08-23T11:55:00',
      },
    ],
  },
  {
    id: 'conv6',
    fullName: 'Julia Carter',
    username: 'julia.design',
    title: 'Product Designer',
    messages: [
      {
        sender: 'Julia',
        message: "Same here! It's coming together nicely.",
        timestamp: '2024-08-22T14:10:00',
      },
      {
        sender: 'You',
        message: "I'm really excited to see the final product!",
        timestamp: '2024-08-22T14:15:00',
      },
      {
        sender: 'You',
        message: "How's the project looking on your end?",
        timestamp: '2024-08-22T14:05:00',
      },
    ],
  },
  {
    id: 'conv7',
    fullName: 'Brad Wilson',
    username: 'brad_dev',
    title: 'CEO',
    messages: [
      {
        sender: 'Brad',
        message: 'Got it! Thanks for the update.',
        timestamp: '2024-08-23T15:45:00',
      },
      {
        sender: 'You',
        message: 'The release has been delayed to next week.',
        timestamp: '2024-08-23T15:40:00',
      },
      {
        sender: 'Brad',
        message: 'Hey, any news on the release?',
        timestamp: '2024-08-23T15:35:00',
      },
    ],
  },
  {
    id: 'conv8',
    fullName: 'Katie Lee',
    username: 'katie_ui',
    title: 'QA',
    messages: [
      {
        sender: 'Katie',
        message: "I'll join the call in a few minutes.",
        timestamp: '2024-08-23T09:50:00',
      },
      {
        sender: 'You',
        message: "Perfect! We'll start as soon as you're in.",
        timestamp: '2024-08-23T09:48:00',
      },
      { sender: 'Katie', message: 'Is the meeting still on?', timestamp: '2024-08-23T09:45:00' },
    ],
  },
  {
    id: 'conv9',
    fullName: 'Matt Green',
    username: 'matt_fullstack',
    title: 'Full-stack Dev',
    messages: [
      {
        sender: 'Matt',
        message: "Sure thing, I'll send over the updates shortly.",
        timestamp: '2024-08-23T10:25:00',
      },
      {
        sender: 'You',
        message: 'Could you update the backend as well?',
        timestamp: '2024-08-23T10:23:00',
      },
      {
        sender: 'Matt',
        message: 'The frontend updates are done. How does it look?',
        timestamp: '2024-08-23T10:20:00',
      },
    ],
  },
  {
    id: 'conv10',
    fullName: 'Sophie Alex',
    username: 'sophie_dev',
    title: 'Jr. Frontend Dev',
    messages: [
      {
        sender: 'You',
        message: "Thanks! I'll review your code and get back to you.",
        timestamp: '2024-08-23T16:10:00',
      },
      {
        sender: 'Sophie',
        message: 'Let me know if you need anything else.',
        timestamp: '2024-08-23T16:05:00',
      },
      {
        sender: 'Sophie',
        message: 'The feature is implemented. Can you review it?',
        timestamp: '2024-08-23T16:00:00',
      },
    ],
  },
];

/* ---------- 纯函数 ---------- */

export function initials(name) {
  return name
    .split(' ')
    .map(function (w) {
      return w.charAt(0);
    })
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/* 确定性头像底色(按名称 hash 取色) */
var AVATAR_COLORS = [
  'var(--nova-palette-red)',
  'var(--nova-palette-orange)',
  'var(--nova-palette-yellow)',
  'var(--nova-palette-green)',
  'var(--nova-palette-cyan)',
  'var(--nova-palette-blue)',
  'var(--nova-palette-violet)',
  'var(--nova-palette-pink)',
];
function avatarColor(name) {
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function avatarHtml(name, size, cls) {
  var style =
    'background:' +
    avatarColor(name) +
    ';width:' +
    size +
    'px;height:' +
    size +
    'px;font-size:' +
    Math.round(size * 0.38) +
    'px';
  return (
    '<span class="ch-avatar' +
    (cls ? ' ' + cls : '') +
    '" style="' +
    style +
    '">' +
    esc(initials(name)) +
    '</span>'
  );
}

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d) {
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + d.getFullYear();
}

export function fmtTime(d) {
  var h = d.getHours();
  var min = d.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + (min < 10 ? '0' + min : min) + ' ' + ampm;
}

export function groupMessages(msgs) {
  var groups = [];
  var map = {};
  msgs.forEach(function (m) {
    var key = fmtDate(new Date(m.timestamp));
    if (!map[key]) {
      map[key] = [];
      groups.push({ key: key, items: map[key] });
    }
    map[key].push(m);
  });
  return groups;
}

/** 新建消息弹窗的联系人列表(与会话同源,去消息体) */
export function usersWithoutMessages() {
  return CONVERSATIONS.map(function (c) {
    return { id: c.id, fullName: c.fullName, username: c.username, title: c.title };
  });
}

export function findConversationById(id) {
  for (var i = 0; i < CONVERSATIONS.length; i++) {
    if (CONVERSATIONS[i].id === id) return CONVERSATIONS[i];
  }
  return null;
}
