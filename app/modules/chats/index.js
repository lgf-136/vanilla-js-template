/* ============================================================
 * chats 模块 — 实现(懒加载,首次访问 #/chats 时下载)
 * 复刻参考项目 shadcn-admin 的 Chats 页:
 * - 左侧会话列表(头像/名称/最后一条消息)+ 搜索
 * - 右侧聊天面板:按日期分组气泡(自己右侧高亮,对方左侧灰底)
 * - 顶部 视频/电话/更多 按钮 + 底部输入框
 * - 新建消息弹窗(搜索联系人,多选标签,可移除)
 * 数据为固定种子(10 个会话),头像用首字母生成(不依赖外部图片)。
 * ============================================================ */
(function () {
  'use strict';

  var icon = function () {
    return App.icon;
  };

  /* ---------- 会话数据(与参考项目一致) ---------- */
  var CONVERSATIONS = [
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

  /* ---------- 状态 ---------- */
  var state = {
    search: '',
    selectedId: null,
    newSearch: '',
    selectedUsers: [],
  };

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;

  function initials(name) {
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

  function avatarHtml(name, size, cls) {
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

  function fmtDate(d) {
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + m[d.getMonth()] + ', ' + d.getFullYear();
  }

  function fmtTime(d) {
    var h = d.getHours();
    var min = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (min < 10 ? '0' + min : min) + ' ' + ampm;
  }

  function groupMessages(msgs) {
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

  function filteredChats() {
    var q = state.search.trim().toLowerCase();
    return CONVERSATIONS.filter(function (c) {
      return c.fullName.toLowerCase().indexOf(q) !== -1;
    });
  }

  function usersWithoutMessages() {
    return CONVERSATIONS.map(function (c) {
      return { id: c.id, fullName: c.fullName, username: c.username, title: c.title };
    });
  }

  /* ---------- 渲染(返回 HTML 字符串) ---------- */
  function render(route, ctx) {
    var t = ctx.t;
    var chats = filteredChats();
    var selected = null;
    for (var i = 0; i < CONVERSATIONS.length; i++) {
      if (CONVERSATIONS[i].id === state.selectedId) selected = CONVERSATIONS[i];
    }

    var html =
      '<div class="ch-page" data-ch-region>' +
      /* 左侧:会话列表 */
      '<div class="ch-side">' +
      '<div class="ch-side-head">' +
      '<div class="ch-inbox-title">' +
      '<h1>' +
      t('chats.inbox') +
      '</h1>' +
      icon().iconSvg('messages-square', { class: 'size-5' }) +
      '</div>' +
      '<button type="button" class="ch-icon-btn" data-ch-new aria-label="' +
      t('chats.newMessage') +
      '">' +
      icon().iconSvg('pencil', { class: 'size-6 ch-muted' }) +
      '</button>' +
      '</div>' +
      App.ui.searchInput.html({
        placeholder: t('chats.searchPlaceholder'),
        value: state.search,
        attrs: 'data-ch-search',
        clearLabel: t('chats.search'),
      }) +
      '<div class="ch-list">' +
      chats
        .map(function (c) {
          var last = c.messages[0];
          var lastMsg = last.sender === 'You' ? 'You: ' + last.message : last.message;
          return (
            '<button type="button" class="ch-item' +
            (c.id === state.selectedId ? ' ch-item-active' : '') +
            '" data-ch-open="' +
            c.id +
            '">' +
            avatarHtml(c.fullName, 40) +
            '<span class="ch-item-body">' +
            '<span class="ch-item-name">' +
            esc(c.fullName) +
            '</span>' +
            '<span class="ch-item-msg">' +
            esc(lastMsg) +
            '</span>' +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>' +
      /* 右侧:聊天面板 / 空状态 */
      '<div class="ch-main">';

    if (selected) {
      html +=
        '<div class="ch-panel">' +
        '<div class="ch-panel-head">' +
        '<button type="button" class="ch-icon-btn ch-back" data-ch-back aria-label="Back">' +
        icon().iconSvg('arrow-left', { class: 'size-5' }) +
        '</button>' +
        '<div class="ch-panel-user">' +
        avatarHtml(selected.fullName, 44, 'ch-avatar-lg') +
        '<div class="ch-panel-meta">' +
        '<span class="ch-panel-name">' +
        esc(selected.fullName) +
        '</span>' +
        '<span class="ch-panel-title">' +
        esc(selected.title) +
        '</span>' +
        '</div>' +
        '</div>' +
        '<div class="ch-panel-actions">' +
        '<button type="button" class="ch-icon-btn ch-sm" aria-label="Video">' +
        icon().iconSvg('video', { class: 'size-5 ch-muted' }) +
        '</button>' +
        '<button type="button" class="ch-icon-btn ch-sm" aria-label="Phone">' +
        icon().iconSvg('phone', { class: 'size-5 ch-muted' }) +
        '</button>' +
        '<button type="button" class="ch-icon-btn" aria-label="More">' +
        icon().iconSvg('ellipsis', { class: 'size-5 ch-muted' }) +
        '</button>' +
        '</div>' +
        '</div>' +
        '<div class="ch-body">' +
        '<div class="ch-scroll">' +
        groupMessages(selected.messages)
          .map(function (g) {
            return (
              g.items
                .map(function (m) {
                  var mine = m.sender === 'You';
                  return (
                    '<div class="ch-bubble-row ' +
                    (mine ? 'ch-mine' : '') +
                    '">' +
                    '<div class="ch-bubble ' +
                    (mine ? 'ch-bubble-mine' : '') +
                    '">' +
                    esc(m.message) +
                    '<span class="ch-bubble-time">' +
                    fmtTime(new Date(m.timestamp)) +
                    '</span>' +
                    '</div>' +
                    '</div>'
                  );
                })
                .join('') +
              '<div class="ch-date-divider">' +
              g.key +
              '</div>'
            );
          })
          .reverse()
          .join('') +
        '</div>' +
        '</div>' +
        '<form class="ch-input-row" data-ch-send-form>' +
        '<div class="ch-input-wrap">' +
        '<div class="ch-input-btns">' +
        '<button type="button" class="ch-icon-btn ch-input-btn"><span class="ch-plus">' +
        icon().iconSvg('plus', { class: 'size-5 ch-muted' }) +
        '</span></button>' +
        '<button type="button" class="ch-icon-btn ch-input-btn ch-hide-lg">' +
        icon().iconSvg('image-plus', { class: 'size-5 ch-muted' }) +
        '</button>' +
        '<button type="button" class="ch-icon-btn ch-input-btn ch-hide-lg">' +
        icon().iconSvg('paperclip', { class: 'size-5 ch-muted' }) +
        '</button>' +
        '</div>' +
        '<input type="text" data-ch-input placeholder="' +
        t('chats.typeHere') +
        '" autocomplete="off" />' +
        '<button type="submit" class="ch-icon-btn ch-input-send ch-hide-sm">' +
        icon().iconSvg('send', { class: 'size-5' }) +
        '</button>' +
        '</div>' +
        '<button type="submit" class="ch-send-btn ch-show-sm">' +
        icon().iconSvg('send', { class: 'size-4' }) +
        ' ' +
        t('chats.send') +
        '</button>' +
        '</form>' +
        '</div>';
    } else {
      html +=
        App.ui.emptyState({
          icon: 'messages-square',
          title: t('chats.yourMessages'),
          desc: t('chats.emptyDesc'),
          fill: true,
          actionHtml:
            '<button type="button" data-slot="button" class="' +
            App.ui.buttonClass('default') +
            '" data-ch-new>' +
            t('chats.sendMessage') +
            '</button>',
        });
    }

    html += '</div></div>';

    return html;
  }

  /* ---------- 新建消息弹窗(公共 App.ui.dialog;内容随选择/搜索动态更新) ---------- */
  function newChatDialogParts(t) {
    var all = usersWithoutMessages();
    var q2 = state.newSearch.trim().toLowerCase();
    var filtered = all.filter(function (u) {
      return u.fullName.toLowerCase().indexOf(q2) !== -1;
    });
    return {
      head: '<h2 class="ui-dialog-title">' + t('chats.newMessage') + '</h2>',
      body:
        '<div class="ch-to-row">' +
        '<span class="ch-to-label">' +
        t('chats.to') +
        '</span>' +
        '<div class="ch-tags">' +
        (state.selectedUsers.length
          ? state.selectedUsers
              .map(function (u) {
                return (
                  '<span class="ch-tag">' +
                  esc(u.fullName) +
                  '<button type="button" class="ch-tag-x" data-ch-tag-remove="' +
                  u.id +
                  '" aria-label="Remove">' +
                  icon().iconSvg('x', { class: 'size-3' }) +
                  '</button>' +
                  '</span>'
                );
              })
              .join('')
          : '') +
        '</div>' +
        '</div>' +
        '<div class="ch-people">' +
        App.ui.searchInput.html({
          placeholder: t('chats.searchPeople'),
          value: state.newSearch,
          attrs: 'data-ch-people-search',
          clearLabel: t('chats.search'),
        }) +
        '<div class="ch-people-list">' +
        (filtered.length
          ? filtered
              .map(function (u) {
                var sel = state.selectedUsers.some(function (s2) {
                  return s2.id === u.id;
                });
                return (
                  '<button type="button" class="ch-person' +
                  (sel ? ' ch-person-sel' : '') +
                  '" data-ch-person="' +
                  u.id +
                  '">' +
                  avatarHtml(u.fullName, 32) +
                  '<span class="ch-person-meta">' +
                  '<span class="ch-person-name">' +
                  esc(u.fullName) +
                  '</span>' +
                  '<span class="ch-person-user">' +
                  esc(u.username) +
                  '</span>' +
                  '</span>' +
                  (sel ? icon().iconSvg('check', { class: 'size-4 ch-check' }) : '') +
                  '</button>'
                );
              })
              .join('')
          : '<div class="ch-no-people">' + t('chats.noPeople') + '</div>') +
        '</div>' +
        '</div>',
      foot:
        '<button type="button" class="ch-primary-btn" data-ch-send-new disabled>' +
        t('chats.chat') +
        '</button>',
    };
  }

  function openNewChatDialog() {
    var locale = App.getShellContext().settings.locale;
    var t = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.chats);
    var parts = newChatDialogParts(t);
    App.ui.dialog({ head: parts.head, body: parts.body, foot: parts.foot });
  }

  /** 弹窗内容变化(选人/搜索/移除标签)后仅刷新弹窗本体,避免重渲整个页面 */
  function updateNewChatDialog() {
    var overlay = document.querySelector('[data-dialog-overlay]');
    if (!overlay) return;
    var locale = App.getShellContext().settings.locale;
    var t = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.chats);
    var parts = newChatDialogParts(t);
    var body = overlay.querySelector('.ui-dialog-body');
    if (body) body.innerHTML = parts.body;
    var foot = overlay.querySelector('.ui-dialog-foot');
    if (foot) foot.innerHTML = parts.foot;
  }

  /* ---------- 交互(document 级事件委托) ---------- */
  function rerender() {
    var region = document.querySelector('[data-ch-region]');
    if (!region) return;
    var locale = App.getShellContext().settings.locale;
    var t = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.chats);
    region.outerHTML = render('/chats', { t: t, settings: App.getShellContext().settings });
  }

  document.addEventListener('input', function (e) {
    var search = e.target.closest('[data-ch-search]');
    if (search) {
      state.search = search.value;
      rerender();
      return;
    }
    var people = e.target.closest('[data-ch-people-search]');
    if (people) {
      state.newSearch = people.value;
      updateNewChatDialog();
    }
  });

  document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-ch-open]');
    if (open) {
      state.selectedId = open.getAttribute('data-ch-open');
      rerender();
      return;
    }
    if (e.target.closest('[data-ch-new]')) {
      state.newSearch = '';
      state.selectedUsers = [];
      openNewChatDialog();
      return;
    }
    if (e.target.closest('[data-ch-back]')) {
      state.selectedId = null;
      rerender();
      return;
    }
    var person = e.target.closest('[data-ch-person]');
    if (person) {
      var id = person.getAttribute('data-ch-person');
      var u = null;
      usersWithoutMessages().forEach(function (x) {
        if (x.id === id) u = x;
      });
      if (!u) return;
      var idx = state.selectedUsers.findIndex(function (s) {
        return s.id === id;
      });
      if (idx === -1) state.selectedUsers.push(u);
      else state.selectedUsers.splice(idx, 1);
      updateNewChatDialog();
      return;
    }
    var rm = e.target.closest('[data-ch-tag-remove]');
    if (rm) {
      var rid = rm.getAttribute('data-ch-tag-remove');
      state.selectedUsers = state.selectedUsers.filter(function (s) {
        return s.id !== rid;
      });
      updateNewChatDialog();
      return;
    }
    var sendNew = e.target.closest('[data-ch-send-new]');
    if (sendNew) {
      if (state.selectedUsers.length === 0) return;
      var locale = App.getShellContext().settings.locale;
      var tt = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.chats);
      var label = tt('chats.selected').replace('{count}', String(state.selectedUsers.length));
      App.ui.closeDialog();
      App.ui.toast(
        state.selectedUsers
          .map(function (u) {
            return u.fullName;
          })
          .join(', ') +
          ' (' +
          label +
          ')',
        'default'
      );
      state.selectedUsers = [];
      rerender();
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest && e.target.closest('[data-ch-send-form]');
    if (!form) return;
    e.preventDefault();
    var input = form.querySelector('[data-ch-input]');
    var val = ((input && input.value) || '').trim();
    if (!val) return;
    var sel = null;
    for (var i = 0; i < CONVERSATIONS.length; i++) {
      if (CONVERSATIONS[i].id === state.selectedId) sel = CONVERSATIONS[i];
    }
    if (sel) {
      sel.messages.unshift({
        sender: 'You',
        message: val,
        timestamp: new Date().toISOString().slice(0, 19),
      });
    }
    if (input) input.value = '';
    rerender();
  });

  App.defineModule({ id: 'chats', render: render });
})();
