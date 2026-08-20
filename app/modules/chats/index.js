/* ============================================================
 * chats 模块 — 多供应商 AI 助手(完整实现)
 * ------------------------------------------------------------
 * 三栏工作台式布局(参考 apihub):
 *   - 左栏:分组|标签 两页签(复用公共 groupTree / tagPicker)+
 *          会话列表(搜索/收藏/置顶/存档筛选/右键菜单/完整 CRUD)
 *   - 中栏:聊天主界面(流式 Markdown、思考链折叠、工具调用、
 *          气泡复制/编辑/重试/点赞/点踩)+ claude.ai 风格输入框
 *   - 右栏:大模型参数面板(供应商/模型/温度/TopP/TopK/maxTokens/
 *          提示词 CRUD/联网搜索)+ MCP 管理(父子开关)+ Agent 占位
 * 移动端左右栏折叠为汉堡菜单(overlay)。
 * 数据与服务端 /api/chats/* + SSE 流式 /api/chats/chat 通讯。
 * 全部样式消费 token(module.css),组件复用 App.ui.* / groupTree /
 * tagPicker / searchInput,不造重复基础组件。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escAttr(s) {
    return esc(s);
  }
  function ic(name, cls) {
    try {
      return App.icon.iconSvg(name, { class: cls || 'size-3.5' });
    } catch (e) {
      return '';
    }
  }
  function uid(prefix) {
    return (
      prefix +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8)
    );
  }
  /** 模糊匹配:query 各字符按序出现即可(忽略大小写) */
  function fuzzy(text, query) {
    text = String(text || '');
    query = String(query || '').trim();
    if (!query) return true;
    var tl = text.toLowerCase();
    var ql = query.toLowerCase();
    var qi = 0;
    for (var i = 0; i < tl.length && qi < ql.length; i++) {
      if (tl.charAt(i) === ql.charAt(qi)) qi++;
    }
    return qi === ql.length;
  }
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }
  /** maxTokens 前端换算:支持 k/M 与小数(与后端 AI.toTokens 一致) */
  function parseTokens(v) {
    if (typeof v === 'number' && isFinite(v)) return Math.round(v);
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s) return 0;
    var m = /^(\d*\.?\d+)\s*([km]?)$/.exec(s);
    if (!m) {
      var n = Number(s);
      return isFinite(n) ? Math.round(n) : 0;
    }
    var base = parseFloat(m[1]);
    if (m[2] === 'k') return Math.round(base * 1024);
    if (m[2] === 'm') return Math.round(base * 1024 * 1024);
    return Math.round(base);
  }
  function fmtClock(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }
  function fmtStamp(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) {
      return n < 10 ? '0' + n : '' + n;
    };
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  }
  function fmtDayGroup(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var pad = function (n) {
      return n < 10 ? '0' + n : '' + n;
    };
    if (day === startToday) return 'today';
    if (day === startToday - 86400000) return 'yesterday';
    if (d.getFullYear() === now.getFullYear()) {
      return d.getMonth() + 1 + '月' + d.getDate() + '日';
    }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function copyPlain(text) {
    App.sse.copyText(text).then(function () {
      App.ui.toast('copied');
    });
  }

  /* ---------------- 状态 ---------------- */
  var state = {
    boot: false,
    bootLoading: false,
    data: null, // { providers, prompts, mcp, groups, tags, conversations, prefs }
    selectedId: null,
    messages: [],
    messagesLoading: false,

    leftOpen: true,
    leftTab: 'groups', // groups | tags
    groupFilter: '', // 分组过滤(id,'__none__' 未分组)
    tagFilter: '', // 标签过滤(id 或 '')
    viewFilter: 'all', // all | fav | archive
    convSearch: '',

    rightOpen: false,
    rightTab: 'params', // params | mcp | agent

    // 输入框
    inputText: '',
    attachments: [], // { type: image|file, name, dataUri, url, content, isRemote }
    providerKey: null,
    model: '',
    thinking: 0, // 0..4
    mcpEnabled: false,
    webSearch: { enabled: false, provider: 'tavily', maxResults: 3 },
    params: { temperature: 0.7, topP: 0.8, topK: 1, maxTokens: '4k' },
    promptId: '',

    // 流式
    streaming: false,
    abortCtrl: null,
    streamMsg: null, // { content, thinking, tools:[], usage, error }

    // 右栏输入态
    modelQuery: '',
    mcpDraft: null, // 编辑中的 MCP { id?, name, protocol, url, tools }
    t: null,
  };

  var PREFS_KEY = 'chatsprefs';

  /* ---------------- 数据访问 ---------------- */
  function providers() {
    return (state.data && state.data.providers) || [];
  }
  function providerByKey(key) {
    var p = providers();
    for (var i = 0; i < p.length; i++) if (p[i].key === key) return p[i];
    return null;
  }
  function prompts() {
    return (state.data && state.data.prompts) || [];
  }
  function mcps() {
    return (state.data && state.data.mcp) || [];
  }
  function groups() {
    return (state.data && state.data.groups) || [];
  }
  function tags() {
    return (state.data && state.data.tags) || [];
  }
  function conversations() {
    return (state.data && state.data.conversations) || [];
  }
  function selectedConv() {
    var list = conversations();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.selectedId) return list[i];
    }
    return null;
  }
  function promptById(id) {
    var p = prompts();
    for (var i = 0; i < p.length; i++) if (p[i].id === id) return p[i];
    return null;
  }
  function groupName(id) {
    if (!id) return '';
    var g = groups();
    for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i].name;
    return '';
  }
  function tagMap() {
    var out = {};
    tags().forEach(function (t) {
      out[t.id] = t;
    });
    return out;
  }
  function modelOptions(providerKey) {
    var p = providerByKey(providerKey);
    if (!p) return [];
    return Array.isArray(p.models) ? p.models : [];
  }

  /* ---------------- 启动与加载 ---------------- */
  function t(key) {
    if (state.t && typeof state.t === 'function') {
      var v = state.t(key);
      if (v && v !== '') return v;
    }
    return key;
  }
  function tF(msg, vars) {
    var out = t(msg);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        out = out.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return out;
  }

  function regionEl() {
    return document.querySelector('[data-ch-region]');
  }
  function rerender() {
    var region = regionEl();
    if (!region) return;
    // 丢失焦点保护:记录输入内容与滚动
    var textarea = region.querySelector('[data-ch-input-text]');
    if (textarea && state.inputText !== textarea.value) state.inputText = textarea.value;
    var list = region.querySelector('[data-ch-messages]');
    var stickBottom = list ? list.scrollHeight - list.scrollTop - list.clientHeight < 60 : false;
    region.outerHTML = renderPage();
    if (stickBottom) scrollMessagesBottom();
    restoreFocus();
  }
  function restoreFocus() {
    var ta = regionEl() && regionEl().querySelector('[data-ch-input-text]');
    if (ta && (state.lastFocus === 'composer' || state.keepFocus)) {
      ta.focus();
      try {
        ta.setSelectionRange(ta.value.length, ta.value.length);
      } catch (e) {
        /* noop */
      }
      state.keepFocus = false;
    }
  }
  function scrollMessagesBottom() {
    var list = regionEl() && regionEl().querySelector('[data-ch-messages]');
    if (list) list.scrollTop = list.scrollHeight;
  }

  function bootLoad() {
    if (state.boot || state.bootLoading) return;
    state.bootLoading = true;
    App.api
      .get('/api/chats/state')
      .then(function (res) {
        state.data = res || {};
        applyPrefs();
        resolveDefaults();
        state.bootLoading = false;
        state.boot = true;
        rerender();
        if (state.selectedId) loadMessages(state.selectedId, true);
      })
      .catch(function (e) {
        state.bootLoading = false;
        state.boot = true; // 允许重渲染为错误态
        state.bootError = (e && e.message) || String(e);
        rerender();
      });
  }

  function reloadState() {
    return App.api.get('/api/chats/state').then(function (res) {
      var selected = state.selectedId;
      state.data = res || {};
      applyPrefs();
      resolveDefaults();
      if (selected) {
        var still = false;
        (state.data.conversations || []).forEach(function (c) {
          if (c.id === selected) still = true;
        });
        if (!still) selected = null;
        state.selectedId = selected;
      }
      rerender();
      return state.data;
    });
  }

  function loadMessages(convId, silent) {
    state.messagesLoading = true;
    if (!silent) rerender();
    return App.api
      .get('/api/chats/conversations/' + encodeURIComponent(convId) + '/messages')
      .then(function (res) {
        state.messages = (res && res.messages) || [];
        state.messagesLoading = false;
        rerender();
        scrollMessagesBottom();
        return state.messages;
      })
      .catch(function () {
        state.messagesLoading = false;
        rerender();
        return [];
      });
  }

  /** 服务器偏好 → 本地状态(校验供应商/模型存在) */
  function applyPrefs() {
    var prefs = (state.data && state.data.prefs) || {};
    if (prefs.providerKey) {
      var p = providerByKey(prefs.providerKey);
      if (p) {
        state.providerKey = p.key;
        if (prefs.model) {
          if (modelOptions(p.key).indexOf(prefs.model) !== -1 || !modelOptions(p.key).length) {
            state.model = prefs.model;
          }
        }
      }
    }
    if (typeof prefs.thinking === 'number') state.thinking = clamp(prefs.thinking, 0, 4);
    if (prefs.params && typeof prefs.params === 'object') {
      state.params = Object.assign(
        { temperature: 0.7, topP: 0.8, topK: 1, maxTokens: '4k' },
        prefs.params
      );
    }
    if (prefs.promptId) state.promptId = prefs.promptId;
    if (prefs.webSearch && typeof prefs.webSearch === 'object') {
      state.webSearch = Object.assign({ enabled: false, provider: 'tavily', maxResults: 3 }, prefs.webSearch);
    }
    if (typeof prefs.mcpEnabled === 'boolean') state.mcpEnabled = prefs.mcpEnabled;
    if (typeof prefs.rightOpen === 'boolean') state.rightOpen = prefs.rightOpen;
    if (typeof prefs.leftOpen === 'boolean') state.leftOpen = prefs.leftOpen;
    if (prefs.rightTab) state.rightTab = prefs.rightTab;
  }

  function resolveDefaults() {
    if (!state.providerKey) {
      var list = providers();
      for (var i = 0; i < list.length; i++) {
        if (list[i].hasApiKey || list[i].local) {
          state.providerKey = list[i].key;
          break;
        }
      }
      if (!state.providerKey && list.length) state.providerKey = list[0].key;
    }
    if (state.providerKey && !state.model) {
      var models = modelOptions(state.providerKey);
      if (models && models.length) state.model = models[0];
    }
  }

  var prefsTimer = null;
  function persistPrefs() {
    if (!state.data) return;
    if (prefsTimer) clearTimeout(prefsTimer);
    prefsTimer = setTimeout(function () {
      App.api.put('/api/chats/prefs', {
        prefs: {
          providerKey: state.providerKey || '',
          model: state.model || '',
          thinking: state.thinking,
          params: state.params,
          promptId: state.promptId || '',
          webSearch: state.webSearch,
          mcpEnabled: state.mcpEnabled,
          rightOpen: state.rightOpen,
          rightTab: state.rightTab,
          leftOpen: state.leftOpen,
        },
      }).catch(function () {
        /* 静默 */
      });
    }, 400);
  }

  /* ============================================================
   * 视图渲染
   * ============================================================ */
  function renderPage() {
    var out =
      '<div class="ch-page" data-ch-region>' +
      '<button type="button" class="ch-mobile-backdrop" data-ch-mobile-backdrop aria-hidden="true"></button>' +
      renderLeft() +
      renderMain() +
      renderRight() +
      '</div>';
    return out;
  }

  /* ---------- 左栏 ---------- */
  function renderLeft() {
    var cls = 'ch-left' + (state.leftOpen ? ' is-open' : '');
    return (
      '<aside class="' +
      cls +
      '" data-slot="ch-left">' +
      '<div class="ch-left-head">' +
      '<span class="ch-left-title">' +
      ic('messages-square', 'size-4') +
      '<strong>' +
      t('chats.title') +
      '</strong>' +
      '</span>' +
      '<div class="ch-left-actions">' +
      '<button type="button" class="ch-icon-btn ch-sm-btn" data-ch-newconv data-tip="' +
      escAttr(t('chats.newChat')) +
      '" aria-label="' +
      escAttr(t('chats.newChat')) +
      '">' +
      ic('plus', 'size-4') +
      '</button>' +
      '<button type="button" class="ch-icon-btn ch-sm-btn" data-ch-toggle-left data-tip="' +
      escAttr(t('chats.collapse')) +
      '" aria-label="' +
      escAttr(t('chats.collapse')) +
      '">' +
      ic('chevron-left', 'size-4') +
      '</button>' +
      '</div></div>' +
      '<div class="ch-left-tabs">' +
      tabBtn('groups', t('chats.groupsTab')) +
      tabBtn('tags', t('chats.tagsTab')) +
      '</div>' +
      '<div class="ch-left-tree" data-ch-lefttree>' +
      (state.leftTab === 'groups' ? renderGroupTree() : renderTagManager()) +
      '</div>' +
      '<div class="ch-left-sep"></div>' +
      '<div class="ch-left-list">' +
      '<div class="ch-list-search">' +
      App.ui.searchInput.html({
        placeholder: t('chats.searchConv'),
        value: state.convSearch,
        attrs: 'data-ch-cv-search',
        clearLabel: t('chats.clear'),
      }) +
      '</div>' +
      '<div class="ch-list-toolbar">' +
      viewBtn('all', t('chats.filterAll')) +
      viewBtn('fav', t('chats.filterFav')) +
      viewBtn('archive', t('chats.filterArchive')) +
      '</div>' +
      '<div class="ch-list" data-ch-conv-list>' +
      renderConvList() +
      '</div>' +
      '</div>' +
      '</aside>'
    );
  }
  function tabBtn(id, label) {
    return (
      '<button type="button" class="ch-tab' +
      (state.leftTab === id ? ' is-on' : '') +
      '" data-ch-tab="' +
      id +
      '">' +
      label +
      '</button>'
    );
  }
  function viewBtn(id, label) {
    return (
      '<button type="button" class="ch-view-btn' +
      (state.viewFilter === id ? ' is-on' : '') +
      '" data-ch-view="' +
      id +
      '">' +
      label +
      '</button>'
    );
  }

  function groupInst() {
    if (!state.groupInst) {
      state.groupInst = App.ui.groupTree.create({
        nodes: function () {
          return groups();
        },
        rootLabel: t('chats.allConversations'),
        activeId: state.groupFilter || 'root',
        showFilter: true,
        count: function (node) {
          var c = conversations();
          var n = 0;
          for (var i = 0; i < c.length; i++) {
            if (!c[i].archived && c[i].groupId === node.id) n++;
          }
          return n;
        },
        labels: {
          search: t('chats.searchGroups'),
          clear: t('chats.clear'),
          empty: t('chats.noGroups'),
          noMatch: t('chats.noGroupsMatch'),
          renameHint: t('chats.dblRename'),
          menu: t('chats.groupMenu'),
          newGroup: t('chats.newGroup'),
          newChild: t('chats.newChildGroup'),
          newSibling: t('chats.newSiblingGroup'),
          rename: t('chats.renameGroup'),
          moveTo: t('chats.moveGroupTo'),
          icon: t('chats.groupIcon'),
          color: t('chats.groupColor'),
          delete: t('chats.deleteGroup'),
          deleteConfirm: t('chats.deleteGroupTitle'),
          deleteMsg: t('chats.deleteGroupMsg'),
          rootGroup: t('chats.rootGroup'),
          name: t('chats.name'),
          namePlaceholder: t('chats.groupNamePlaceholder'),
          nameRequired: t('chats.nameRequired'),
          parentGroup: t('chats.parentGroup'),
          save: t('chats.save'),
          cancel: t('chats.cancel'),
          emoji: t('chats.emoji'),
          iconSearch: t('chats.iconSearch'),
          apply: t('chats.apply'),
          clearIcon: t('chats.clearIcon'),
          clearColor: t('chats.clearColor'),
          copied: t('chats.copied'),
        },
        onSelect: function (id) {
          state.groupFilter = id || '';
          if (state.leftTab === 'tags') state.leftTab = 'groups';
          state.keepFocus = false;
          rerender();
        },
        onToggle: function () {},
        onRender: function () {
          rerender();
        },
        onCreate: function (parentId, name) {
          var g = { id: uid('gr'), parentId: parentId || '', name: name, sort: 0 };
          groups().push(g);
          persistGroups();
        },
        onRename: function (id, name) {
          var g = findGroup(id);
          if (g) {
            g.name = name;
            persistGroups();
          }
        },
        onMove: function (id, targetId, zone) {
          var next = App.ui.groupTree.moveNode(groups(), id, targetId, zone);
          if (next) {
            state.data.groups = next;
            persistGroups();
          }
        },
        onDelete: function (id) {
          state.data.groups = groups().filter(function (g) {
            return g.id !== id && g.parentId !== id;
          });
          if (state.groupFilter === id) state.groupFilter = '';
          persistGroups();
          rerender();
        },
        onIconChange: function (id, icon) {
          var g = findGroup(id);
          if (g) {
            g.icon = icon || '';
            persistGroups();
          }
        },
        onColorChange: function (id, color) {
          var g = findGroup(id);
          if (g) {
            g.color = color || '';
            persistGroups();
          }
        },
      });
    }
    return state.groupInst;
  }
  function findGroup(id) {
    var g = groups();
    for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
    return null;
  }
  function persistGroups() {
    App.api.put('/api/chats/groups', { groups: groups() }).then(function () {
      return reloadState();
    }).catch(function (e) {
      App.ui.toast((e && e.message) || 'group_save_failed', 'error');
    });
  }
  function renderGroupTree() {
    // 记忆上次过滤输入,重渲染时同步
    var inst = groupInst();
    if (state.leftSearch != null && state.leftSearch !== inst.filter) inst.setFilter(state.leftSearch);
    var html = inst.render();
    state.leftSearch = null;
    return html;
  }

  function tagInst() {
    if (!state.tagInst) {
      state.tagInst = App.ui.tagPicker.create({
        nodes: function () {
          return tags();
        },
        count: function (tagId) {
          var c = conversations();
          var n = 0;
          for (var i = 0; i < c.length; i++) {
            if (c[i].archived) continue;
            if (tagId === null) {
              if (!c[i].tagIds || !c[i].tagIds.length) n++;
            } else if (c[i].tagIds.indexOf(tagId) !== -1) {
              n++;
            }
          }
          return n;
        },
        activeId: state.tagFilter,
        labels: {
          searchTags: t('chats.searchTags'),
          clear: t('chats.clear'),
          allTags: t('chats.allTags'),
          untagged: t('chats.untagged'),
          allColors: t('chats.allColors'),
          noMatch: t('chats.noTagsMatch'),
          empty: t('chats.noTags'),
          renameHint: t('chats.dblRename'),
          menu: t('chats.tagMenu'),
          rename: t('chats.renameTag'),
          color: t('chats.tagColor'),
          delete: t('chats.deleteTag'),
          deleteConfirm: t('chats.deleteTagTitle'),
          deleteTagMsg: t('chats.deleteTagMsg'),
          newTag: t('chats.newTag'),
          newTagDesc: t('chats.newTagDesc'),
          tagNamePlaceholder: t('chats.tagNamePlaceholder'),
          name: t('chats.name'),
          nameRequired: t('chats.nameRequired'),
          nameTooLong: t('chats.nameTooLong'),
          nameExists: t('chats.nameExists'),
          colorLabel: t('chats.tagColor'),
          customColor: t('chats.customColor'),
          cancel: t('chats.cancel'),
          save: t('chats.save'),
          selected: t('chats.selected'),
          noneSelected: t('chats.noneSelected'),
          done: t('chats.done'),
          createTag: t('chats.createTag'),
          searchCreate: t('chats.searchCreate'),
          copied: t('chats.copied'),
          apply: t('chats.apply'),
          clearColor: t('chats.clearColor'),
        },
        onSelect: function (id) {
          state.tagFilter = id || '';
          if (state.leftTab === 'groups') state.leftTab = 'tags';
          rerender();
        },
        onRender: function () {
          rerender();
        },
        onCreate: function (name, color) {
          var ex = tags();
          var dup = false;
          ex.forEach(function (x2) {
            if (x2.name.toLowerCase() === String(name).toLowerCase()) dup = true;
          });
          if (dup) {
            App.ui.toast(tF('chats.nameExists'), 'error');
            return;
          }
          ex.push({ id: uid('tg'), name: name, color: color || App.ui.tagPicker.nextColor(), sort: ex.length });
          state.data.tags = ex;
          persistTags();
        },
        onRename: function (id, name, color) {
          var tag = findTag(id);
          if (tag) {
            tag.name = name;
            if (color !== undefined) tag.color = color || '';
            persistTags();
          }
        },
        onColorChange: function (id, color) {
          var tag = findTag(id);
          if (tag) {
            tag.color = color || '';
            persistTags();
          }
        },
        onDelete: function (id) {
          state.data.tags = tags().filter(function (t2) {
            return t2.id !== id;
          });
          if (state.tagFilter === id) state.tagFilter = '';
          persistTags();
          rerender();
        },
      });
    }
    return state.tagInst;
  }
  function findTag(id) {
    var list = tags();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function persistTags() {
    App.api.put('/api/chats/tags', { tags: tags() }).then(function () {
      return reloadState();
    }).catch(function (e) {
      App.ui.toast((e && e.message) || 'tag_save_failed', 'error');
    });
  }
  function renderTagManager() {
    var inst = tagInst();
    if (state.leftSearch != null) {
      inst.setManagerFilter(state.leftSearch);
      state.leftSearch = null;
    }
    return inst.render();
  }

  /* ---------- 会话列表 ---------- */
  function filteredConvs() {
    var list = conversations();
    var q = state.convSearch.trim().toLowerCase();
    var tm = tagMap();
    var out = [];
    list.forEach(function (c) {
      if (state.viewFilter === 'archive') {
        if (!c.archived) return;
      } else if (c.archived) {
        return;
      }
      if (state.viewFilter === 'fav' && !c.favorite) return;
      if (state.groupFilter) {
        if (state.groupFilter === '__none__') {
          if (c.groupId) return;
        } else if (c.groupId !== state.groupFilter) {
          return;
        }
      }
      if (state.tagFilter) {
        if (state.tagFilter === '__none__') {
          if (c.tagIds && c.tagIds.length) return;
        } else if (!c.tagIds || c.tagIds.indexOf(state.tagFilter) === -1) {
          return;
        }
      }
      if (q) {
        var hay = (c.title || '') + ' ' + (c.preview || '');
        var tagNames = (c.tagIds || [])
          .map(function (id2) {
            var x = tm[id2];
            return x ? x.name : '';
          })
          .join(' ');
        hay += ' ' + tagNames;
        if (!fuzzy(hay, q)) return;
      }
      out.push(c);
    });
    // 置顶优先,再按更新时间
    out.sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    return out;
  }
  function renderConvList() {
    var list = filteredConvs();
    if (!list.length) {
      return (
        '<div class="ch-empty">' +
        ic('messages-square', 'size-5') +
        '<span>' +
        t('chats.noConversations') +
        '</span>' +
        '</div>'
      );
    }
    return list.map(renderConvItem).join('');
  }
  function renderConvItem(c) {
    var tm = tagMap();
    var modelBadge =
      c.model || (c.providerKey ? c.providerKey.toUpperCase() : '');
    var tagPills = (c.tagIds || [])
      .map(function (id) {
        var tg = tm[id];
        if (!tg) return '';
        var col = tg.color || '';
        var colorVar = '';
        try {
          var resolved = App.ui.color.resolveColor(col);
          if (resolved) colorVar = ' style="--tc:' + resolved + '"';
        } catch (e) {
          /* noop */
        }
        return (
          '<span class="ch-tpill"' +
          colorVar +
          '><i class="ch-tpill-hash">#</i>' +
          esc(tg.name) +
          '</span>'
        );
      })
      .join('');
    return (
      '<div class="ch-conv' +
      (c.id === state.selectedId ? ' is-active' : '') +
      '" data-ch-open="' +
      escAttr(c.id) +
      '" data-ch-conv="' +
      escAttr(c.id) +
      '">' +
      '<div class="ch-conv-main">' +
      '<div class="ch-conv-title-row">' +
      (c.pinned ? '<span class="ch-conv-flag">' + ic('pin', 'size-3') + '</span>' : '') +
      (c.favorite ? '<span class="ch-conv-flag is-fav">' + ic('star', 'size-3') + '</span>' : '') +
      '<span class="ch-conv-title">' +
      esc(c.title || t('chats.untitled')) +
      '</span>' +
      '<span class="ch-conv-time">' +
      esc(fmtStamp(c.updatedAt).split(' ')[0]) +
      '</span>' +
      '</div>' +
      '<div class="ch-conv-preview">' +
      '<span class="ch-conv-pre">' +
      esc(c.preview || '') +
      '</span>' +
      '</div>' +
      '<div class="ch-conv-meta">' +
      (modelBadge ? '<span class="ch-model-badge"><i class="ch-model-dot"></i>' + esc(modelBadge) + '</span>' : '') +
      (c.archived ? '<span class="ch-archive-badge">' + ic('archive', 'size-3') + t('chats.archived') + '</span>' : '') +
      (tagPills ? '<span class="ch-tpills">' + tagPills + '</span>' : '') +
      '</div>' +
      '</div>' +
      '<button type="button" class="ch-conv-more" data-ch-conv-more="' +
      escAttr(c.id) +
      '" aria-label="' +
      escAttr(t('chats.groupMenu')) +
      '">' +
      ic('ellipsis') +
      '</button>' +
      '</div>'
    );
  }

  /* ---------- 中栏 ---------- */
  function renderMain() {
    if (state.bootError) {
      return (
        '<main class="ch-main"><div class="ch-main-inner">' +
        App.ui.emptyState({
          icon: 'circle-alert',
          title: t('chats.loadFailed'),
          desc: esc(state.bootError),
          fill: true,
          actionHtml:
            '<button type="button" data-slot="button" class="' +
            App.ui.buttonClass('outline') +
            '" data-ch-reload>' +
            ic('refresh-cw', 'size-4') +
            t('chats.reload') +
            '</button>',
        }) +
        '</div></main>'
      );
    }
    if (!state.boot) {
      return (
        '<main class="ch-main"><div class="ch-main-inner ch-loading">' +
        ic('loader-2', 'size-5 ch-spin') +
        '<span>' +
        t('chats.loading') +
        '</span></div></main>'
      );
    }
    var conv = selectedConv();
    if (!conv) {
      return (
        '<main class="ch-main"><div class="ch-main-inner">' +
        App.ui.emptyState({
          icon: 'sparkles',
          title: t('chats.welcomeTitle'),
          desc: t('chats.welcomeDesc'),
          fill: true,
          actionHtml:
            '<button type="button" data-slot="button" class="' +
            App.ui.buttonClass('default') +
            '" data-ch-newconv>' +
            ic('plus', 'size-4') +
            t('chats.newChat') +
            '</button>',
        }) +
        '</div></main>'
      );
    }
    return (
      '<main class="ch-main">' +
      '<div class="ch-chat">' +
      '<div class="ch-chat-head">' +
      '<button type="button" class="ch-icon-btn ch-mobile-only" data-ch-toggle-left aria-label="' +
      escAttr(t('chats.collapse')) +
      '">' +
      ic('menu', 'size-4') +
      '</button>' +
      '<div class="ch-chat-title-wrap">' +
      '<h2 class="ch-chat-title">' +
      esc(conv.title || t('chats.untitled')) +
      '</h2>' +
      '<div class="ch-chat-sub">' +
      (state.model
        ? '<span class="ch-model-badge">' +
          ic('zap', 'size-3') +
          esc(state.providerKey ? (providerByKey(state.providerKey) || {}).name || state.providerKey : '') +
          ' · ' +
          esc(state.model) +
          '</span>'
        : '') +
      (promptById(state.promptId) ? '<span class="ch-sub-chip">' + ic('wand-2', 'size-3') + esc(promptById(state.promptId).name) + '</span>' : '') +
      (state.webSearch.enabled ? '<span class="ch-sub-chip">' + ic('globe', 'size-3') + t('chats.webSearchOn') + '</span>' : '') +
      '</div>' +
      '</div>' +
      '<div class="ch-chat-actions">' +
      '<button type="button" class="ch-icon-btn" data-ch-toggle-right data-tip="' +
      escAttr(t('chats.togglePanel')) +
      '" aria-label="' +
      escAttr(t('chats.togglePanel')) +
      '">' +
      ic('panel-right', 'size-4') +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="ch-chat-body">' +
      '<div class="ch-messages" data-ch-messages>' +
      (state.messagesLoading && !state.messages.length
        ? '<div class="ch-messages-loading">' + ic('loader-2', 'size-4 ch-spin') + '</div>'
        : renderMessageGroups()) +
      '</div>' +
      renderComposer() +
      '</div>' +
      '</div>' +
      '</main>'
    );
  }
  function renderMessageGroups() {
    if (!state.messages.length && !state.streaming) {
      return (
        '<div class="ch-msgs-empty">' +
        '<div class="ch-msgs-empty-ic">' +
        ic('sparkles', 'size-6') +
        '</div>' +
        '<div class="ch-msgs-empty-title">' +
        t('chats.startChat') +
        '</div>' +
        '<div class="ch-msgs-empty-desc">' +
        t('chats.startChatHint') +
        '</div>' +
        '</div>'
      );
    }
    var groups = [];
    var seen = {};
    var out = '';
    state.messages.forEach(function (m) {
      var key = fmtDayGroup(m.createdAt || m.updatedAt);
      if (!seen[key]) {
        seen[key] = true;
        groups.push(key);
        out +=
          '<div class="ch-date-divider">' +
          esc(dayLabel(key)) +
          '</div>';
      }
      out += renderMsg(m);
    });
    if (state.streaming && state.streamMsg) {
      out += renderStreamMsg();
    }
    return out;
  }
  function dayLabel(key) {
    if (key === 'today') return t('chats.today');
    if (key === 'yesterday') return t('chats.yesterday');
    return key;
  }
  function renderMsg(m) {
    if (m.role === 'user') {
      return renderUserMsg(m);
    }
    return renderAssistantMsg(m);
  }
  function renderParts(parts) {
    var out = '';
    (parts || []).forEach(function (p) {
      if (!p) return;
      if (p.type === 'image') {
        var src = p.dataUri || p.url || '';
        out += '<div class="cm-att cm-att-img"><img src="' + escAttr(src) + '" alt="' + escAttr(p.name || '') + '" loading="lazy" /></div>';
      } else if (p.type === 'file') {
        out +=
          '<div class="cm-att cm-att-file">' +
          ic('file-text', 'size-4') +
          '<span class="cm-att-name">' +
          esc(p.name || t('chats.attachment')) +
          '</span>' +
          (p.url ? '<a class="cm-att-link" href="' + escAttr(p.url) + '" target="_blank" rel="noopener noreferrer">' + ic('link-2', 'size-3') + '</a>' : '') +
          '</div>';
      }
    });
    return out;
  }
  function renderUserMsg(m) {
    return (
      '<div class="cm-row cm-user" data-msg-id="' +
      m.id +
      '">' +
      '<div class="cm-bubble cm-bubble-user">' +
      '<div class="cm-user-content">' +
      renderParts(m.parts) +
      '<div class="cm-user-text">' +
      esc(m.content || '').replace(/\n/g, '<br />') +
      '</div>' +
      '</div>' +
      '<div class="cm-user-actions">' +
      '<button type="button" data-ch-copy="' +
      m.id +
      '" data-tip="' +
      escAttr(t('chats.copy')) +
      '" aria-label="' +
      escAttr(t('chats.copy')) +
      '">' +
      ic('copy', 'size-3.5') +
      '</button>' +
      '<button type="button" data-ch-edit="' +
      m.id +
      '" data-tip="' +
      escAttr(t('chats.edit')) +
      '" aria-label="' +
      escAttr(t('chats.edit')) +
      '">' +
      ic('pencil', 'size-3.5') +
      '</button>' +
      '<span class="cm-user-time">' +
      esc(fmtStamp(m.createdAt)) +
      '</span>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }
  function renderAssistantMsg(m) {
    var tm = (m.thinking && m.thinking.content) || '';
    var hasThink = !!tm;
    var tools = m.toolCalls || [];
    var usage = m.usage || {};
    var error = m.error || '';
    var fee = '';
    if (usage && (usage.input_tokens || usage.output_tokens)) {
      fee = (usage.input_tokens || 0) + ' / ' + (usage.output_tokens || 0) + ' tok';
    }
    return (
      '<div class="cm-row cm-assistant" data-msg-id="' +
      m.id +
      '">' +
      '<span class="cm-avatar">' +
      ic('bot', 'size-4') +
      '</span>' +
      '<div class="cm-body">' +
      (hasThink
        ? renderThinkingBlock(m.id + '-t', tm, state.openThink[m.id + '-t'] !== false)
        : '') +
      renderToolList(tools, m.id + '-x', true) +
      (error ? '<div class="cm-error">' + ic('circle-x', 'size-3.5') + esc(error) + '</div>' : '') +
      '<div class="cm-md" data-cm-md>' +
      (m.content ? App.md.render(m.content) : '<em class="cm-empty">' + esc(t('chats.noContent')) + '</em>') +
      '</div>' +
      '<div class="cm-assistant-meta">' +
      (fee ? '<span class="cm-usage">' + esc(fee) + '</span>' : '') +
      '</div>' +
      '<div class="cm-assistant-actions">' +
      '<button type="button" data-ch-copy="' +
      m.id +
      '" data-tip="' +
      escAttr(t('chats.copy')) +
      '" aria-label="' +
      escAttr(t('chats.copy')) +
      '">' +
      ic('copy', 'size-3.5') +
      '</button>' +
      '<button type="button" data-ch-retry="' +
      m.id +
      '" data-tip="' +
      escAttr(t('chats.retry')) +
      '" aria-label="' +
      escAttr(t('chats.retry')) +
      '">' +
      ic('rotate-ccw', 'size-3.5') +
      '</button>' +
      '<span class="cm-fb">' +
      '<button type="button" data-ch-fb="' +
      m.id +
      '" data-val="up" class="' +
      (m.feedback === 'up' ? 'is-selected' : '') +
      '" data-tip="' +
      escAttr(t('chats.like')) +
      '" aria-label="' +
      escAttr(t('chats.like')) +
      '">' +
      ic('thumbs-up', 'size-3.5') +
      '</button>' +
      '<button type="button" data-ch-fb="' +
      m.id +
      '" data-val="down" class="' +
      (m.feedback === 'down' ? 'is-selected' : '') +
      '" data-tip="' +
      escAttr(t('chats.dislike')) +
      '" aria-label="' +
      escAttr(t('chats.dislike')) +
      '">' +
      ic('thumbs-down', 'size-3.5') +
      '</button>' +
      '</span>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }
  function renderThinkingBlock(key, text, open) {
    var opened = state.openThink && state.openThink[key] !== undefined ? !!state.openThink[key] : open;
    return (
      '<div class="cm-thinking' +
      (opened ? ' is-open' : '') +
      '" data-think="' +
      escAttr(key) +
      '">' +
      '<button type="button" class="cm-thinking-head" data-ch-think-toggle="' +
      escAttr(key) +
      '">' +
      '<span class="cm-thinking-ic">' +
      ic(opened ? 'chevron-down' : 'chevron-right', 'size-3.5') +
      '</span>' +
      ic('cpu', 'size-3.5') +
      '<span>' +
      t('chats.thinkingTitle') +
      '</span>' +
      '</button>' +
      '<div class="cm-thinking-body" data-think-body>' +
      (opened ? '<p>' + esc(text) + '</p>' : '') +
      '</div>' +
      '</div>'
    );
  }
  function renderToolList(tools, key, expandable) {
    if (!tools || !tools.length) return '';
    var opened = state.openTools && state.openTools[key];
    var rows = tools
      .map(function (tl, i) {
        return renderToolRow(tl, i, key + '-' + (tl.id || i), opened === true);
      })
      .join('');
    return (
      '<div class="cm-tools">' +
      '<button type="button" class="cm-tools-head" data-ch-tools-toggle="' +
      escAttr(key) +
      '">' +
      '<span class="cm-tools-arrow">' +
      ic(opened ? 'chevron-down' : 'chevron-right', 'size-3.5') +
      '</span>' +
      '<span>' +
      t('chats.toolCalls') +
      ' (' +
      tools.length +
      ')</span>' +
      '</button>' +
      (opened ? '<div class="cm-tools-body">' + rows + '</div>' : '') +
      '</div>'
    );
  }
  function renderToolRow(t, i, key, opened) {
    var stateIcon;
    var stateLabel;
    if (t.state === 'error') {
      stateIcon = ic('circle-x', 'size-3.5');
      stateLabel = 'cm-tool-error';
    } else if (t.state === 'success') {
      stateIcon = ic('circle-check', 'size-3.5');
      stateLabel = 'cm-tool-ok';
    } else if (t.state === 'running') {
      stateIcon = ic('loader-2', 'size-3.5 ch-spin');
      stateLabel = 'cm-tool-run';
    } else {
      stateIcon = ic('wrench', 'size-3.5');
      stateLabel = '';
    }
    var argsStr = '';
    try {
      argsStr =
        typeof t.arguments === 'string'
          ? t.arguments
          : JSON.stringify(t.arguments || {}, null, 2);
    } catch (e) {
      argsStr = '';
    }
    var resultStr = '';
    if (t.result !== undefined && t.result !== null) {
      if (t.result && t.result.error) resultStr = '[err] ' + t.result.error;
      else if (typeof t.result === 'string') resultStr = t.result;
      else {
        try {
          resultStr = JSON.stringify(t.result, null, 2);
        } catch (e) {
          resultStr = String(t.result);
        }
      }
    }
    return (
      '<div class="cm-tool" data-tool-key="' +
      escAttr(key) +
      '">' +
      '<div class="cm-tool-row">' +
      '<button type="button" class="cm-tool-toggle" data-ch-tool-toggle="' +
      escAttr(key) +
      '">' +
      '<span class="cm-tool-caret">' +
      ic(opened ? 'chevron-down' : 'chevron-right', 'size-3.5') +
      '</span>' +
      '<span class="cm-tool-ic ' +
      stateLabel +
      '">' +
      stateIcon +
      '</span>' +
      '<span class="cm-tool-name" data-tool-name>' +
      esc(t.name || 'tool') +
      '</span>' +
      (t.server ? '<span class="cm-tool-server">' + esc(t.server) + '</span>' : '') +
      '<span class="cm-tool-state ' +
      stateLabel +
      '">' +
      esc(t.state === 'error' ? t('chats.toolFailed') : t.state === 'success' ? t('chats.toolDone') : t.state === 'running' ? t('chats.toolRun') : '') +
      '</span>' +
      '</button>' +
      '</div>' +
      (opened
        ? '<div class="cm-tool-detail">' +
          '<div class="cm-tool-sec"><span class="cm-tool-sec-label">' +
          esc(t('chats.toolArgs')) +
          '</span><pre>' +
          esc(argsStr) +
          '</pre></div>' +
          (resultStr !== ''
            ? '<div class="cm-tool-sec"><span class="cm-tool-sec-label">' +
              esc(t('chats.toolResult')) +
              '</span><pre>' +
              esc(resultStr.slice(0, 6000)) +
              '</pre></div>'
            : '') +
          '</div>'
        : '') +
      '</div>'
    );
  }

  /** 流式进行中的助手气泡(骨架,由实时事件原位更新) */
  function renderStreamMsg() {
    var sm = state.streamMsg || { content: '', thinking: '', tools: [], usage: null, error: '' };
    return (
      '<div class="cm-row cm-assistant cm-stream" data-stream-msg>' +
      '<span class="cm-avatar">' +
      ic('bot', 'size-4') +
      '</span>' +
      '<div class="cm-body">' +
      (sm.thinking
        ? renderThinkingBlock('__stream__', sm.thinking, state.openThink['__stream__'] !== false)
        : '') +
      (sm.tools.length
        ? '<div class="cm-tools cm-stream-tools" data-stream-tools>' +
          renderToolList(sm.tools, '__streamtools__', true) +
          '</div>'
        : '') +
      (sm.error ? '<div class="cm-error">' + ic('circle-x', 'size-3.5') + esc(sm.error) + '</div>' : '') +
      '<div class="cm-md" data-stream-md>' +
      (sm.content ? App.md.render(sm.content) : '<span class="cm-typing"><i></i><i></i><i></i></span>') +
      '</div>' +
      '<div class="cm-stream-status">' +
      (sm.usage && (sm.usage.input_tokens || sm.usage.output_tokens)
        ? '<span class="cm-usage">' +
          esc((sm.usage.input_tokens || 0) + ' / ' + (sm.usage.output_tokens || 0) + ' tok') +
          '</span>'
        : '') +
      '<button type="button" class="cm-stop-btn" data-ch-stop>' +
      ic('square', 'size-3') +
      t('chats.stop') +
      '</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  /* ---------- 输入框(claude.ai 风格) ---------- */
  function renderComposer() {
    var webOn = state.webSearch.enabled;
    return (
      '<div class="cm-composer">' +
      (state.attachments.length ? '<div class="cm-attach-row">' + state.attachments.map(renderAttachChip).join('') + '</div>' : '') +
      '<textarea class="cm-input" data-ch-input-text rows="1" placeholder="' +
      escAttr(t('chats.sendPlaceholder')) +
      '">' +
      esc(state.inputText) +
      '</textarea>' +
      '<div class="cm-composer-foot">' +
      '<div class="cm-composer-left">' +
      renderProviderChip() +
      renderModelChip() +
      renderThinkingChip() +
      renderMcpChip() +
      '</div>' +
      '<div class="cm-composer-right">' +
      '<button type="button" class="cm-toolbtn' +
      (webOn ? ' is-on' : '') +
      '" data-ch-ws-btn data-tip="' +
      escAttr(t('chats.webSearchOn')) +
      '" aria-label="' +
      escAttr(t('chats.webSearchOn')) +
      '">' +
      ic('globe', 'size-4') +
      '</button>' +
      '<button type="button" class="cm-toolbtn" data-ch-attach-image data-tip="' +
      escAttr(t('chats.insertImage')) +
      '" aria-label="' +
      escAttr(t('chats.insertImage')) +
      '">' +
      ic('image-plus', 'size-4') +
      '</button>' +
      '<button type="button" class="cm-toolbtn" data-ch-attach-file data-tip="' +
      escAttr(t('chats.insertFile')) +
      '" aria-label="' +
      escAttr(t('chats.insertFile')) +
      '">' +
      ic('paperclip', 'size-4') +
      '</button>' +
      (state.streaming
        ? '<button type="button" class="cm-send is-stop" data-ch-stop data-tip="' +
          escAttr(t('chats.stop')) +
          '" aria-label="' +
          escAttr(t('chats.stop')) +
          '">' +
          ic('square', 'size-4') +
          '</button>'
        : '<button type="button" class="cm-send" data-ch-send data-tip="' +
          escAttr(t('chats.send')) +
          '" aria-label="' +
          escAttr(t('chats.send')) +
          '">' +
          ic('arrow-up', 'size-4') +
          '</button>') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function renderAttachChip(a, i) {
    var thumb = a.type === 'image' && a.dataUri ? '<img src="' + escAttr(a.dataUri) + '" alt="" />' : ic('file-text', 'size-4');
    return (
      '<span class="cm-attach-chip" data-ch-att="' +
      i +
      '">' +
      '<span class="cm-attach-thumb">' +
      thumb +
      '</span>' +
      (a.name ? '<span class="cm-attach-name">' + esc(a.name) + '</span>' : '') +
      '<button type="button" class="cm-attach-x" data-ch-att-remove="' +
      i +
      '" aria-label="' +
      escAttr(t('chats.removeAttach')) +
      '">' +
      ic('x', 'size-3') +
      '</button>' +
      '</span>'
    );
  }

  function renderProviderChip() {
    var p = providerByKey(state.providerKey);
    var label = p ? p.name : t('chats.selectProvider');
    return '<span class="cm-chip-wrap" data-dropdown>' +
      '<button type="button" class="cm-chip" data-dropdown-trigger aria-label="' +
      escAttr(t('chats.provider')) +
      '">' +
      ic('layers', 'size-3.5') +
      '<span class="cm-chip-text">' +
      esc(label) +
      '</span>' +
      ic('chevron-down', 'size-3') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('min-w-48') +
      '" data-side="bottom" role="menu">' +
      providers()
        .map(function (p2) {
          return (
            '<button type="button" role="menuitem" class="' +
            App.ui.dropdownItemClass('gap-2') +
            '" data-ch-provider="' +
            escAttr(p2.key) +
            '">' +
            '<span class="ch-dd-check">' +
            (p2.key === state.providerKey ? ic('check', 'size-3.5') : '') +
            '</span>' +
            '<span class="ch-dd-name">' +
            esc(p2.name) +
            '</span>' +
            (p2.hasApiKey ? '' : '<span class="ch-dd-key-warn">' + ic('key-round', 'size-3') + '</span>') +
            '</button>'
          );
        })
        .join('') +
      '</div></span>';
  }
  function renderModelChip() {
    var models = modelOptions(state.providerKey);
    var label = state.model || t('chats.selectModel');
    var items;
    if (models && models.length) {
      items = models
        .map(function (m) {
          return (
            '<button type="button" role="menuitem" class="' +
            App.ui.dropdownItemClass('gap-2') +
            '" data-ch-model="' +
            escAttr(m) +
            '">' +
            (m === state.model ? ic('check', 'size-3.5') : '') +
            '<span class="ch-dd-name">' +
            esc(m) +
            '</span>' +
            '</button>'
          );
        })
        .join('');
    } else {
      items =
        '<div class="ch-dd-empty">' + esc(t('chats.noModelsHint')) + '</div>' +
        '<button type="button" role="menuitem" class="' +
        App.ui.dropdownItemClass('gap-2') +
        '" data-ch-model-manual>' +
        ic('pencil', 'size-3.5') +
        '<span class="ch-dd-name">' +
        esc(t('chats.typeModel')) +
        '</span></button>';
    }
    return (
      '<span class="cm-chip-wrap" data-dropdown>' +
      '<button type="button" class="cm-chip" data-dropdown-trigger aria-label="' +
      escAttr(t('chats.model')) +
      '">' +
      ic('zap', 'size-3.5') +
      '<span class="cm-chip-text">' +
      esc(label) +
      '</span>' +
      ic('chevron-down', 'size-3') +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('min-w-56') +
      '" data-side="bottom" role="menu" data-ch-model-items>' +
      items +
      '</div></span>'
    );
  }
  function renderThinkingChip() {
    var labels = [t('chats.thinkingOff'), t('chats.thinkingLow'), t('chats.thinkingMed'), t('chats.thinkingHigh'), t('chats.thinkingDeep')];
    return (
      '<span class="cm-chip cm-chip-think">' +
      '<span class="cm-chip-label">' +
      ic('cpu', 'size-3.5') +
      '<span>' +
      esc(labels[state.thinking] || labels[0]) +
      '</span>' +
      '</span>' +
      '<input type="range" min="0" max="4" step="1" value="' +
      state.thinking +
      '" class="cm-range" data-ch-thinking aria-label="' +
      escAttr(t('chats.thinking')) +
      '" />' +
      '</span>'
    );
  }
  function renderMcpChip() {
    var active = state.mcpEnabled && mcps().some(function (m) {
      return m.enabled;
    });
    return (
      '<button type="button" class="cm-chip' +
      (active ? ' is-on' : '') +
      '" data-ch-mcp-toggle data-tip="' +
      escAttr(t('chats.mcp')) +
      '" aria-label="' +
      escAttr(t('chats.mcp')) +
      '">' +
      ic('plug', 'size-3.5') +
      '<span class="cm-chip-text">' +
      t('chats.mcp') +
      '</span>' +
      '</button>'
    );
  }
  function renderWebSearchChip() {
    return (
      '<button type="button" class="cm-chip' +
      (state.webSearch.enabled ? ' is-on' : '') +
      '" data-ch-ws-toggle data-tip="' +
      escAttr(t('chats.webSearchOn')) +
      '" aria-label="' +
      escAttr(t('chats.webSearchOn')) +
      '">' +
      ic('globe', 'size-3.5') +
      '<span class="cm-chip-text">' +
      t('chats.webSearchOn') +
      '</span>' +
      '</button>'
    );
  }

  /* ---------- 右栏 ---------- */
  function renderRight() {
    if (!state.rightOpen) {
      return (
        '<aside class="ch-right is-closed" data-slot="ch-right">' +
        '<button type="button" class="ch-right-rail" data-ch-toggle-right data-tip="' +
        escAttr(t('chats.openPanel')) +
        '" aria-label="' +
        escAttr(t('chats.openPanel')) +
        '">' +
        ic('sliders-horizontal', 'size-4') +
        '</button>' +
        '</aside>'
      );
    }
    return (
      '<aside class="ch-right" data-slot="ch-right">' +
      '<div class="ch-right-head">' +
      '<span class="ch-right-title">' +
      ic('sliders-horizontal', 'size-4') +
      '<strong>' +
      t('chats.parameters') +
      '</strong>' +
      '</span>' +
      '<button type="button" class="ch-icon-btn ch-sm-btn" data-ch-toggle-right aria-label="' +
      escAttr(t('chats.collapse')) +
      '">' +
      ic('chevron-right', 'size-4') +
      '</button>' +
      '</div>' +
      '<div class="ch-right-tabs">' +
      rightTab('params', t('chats.paramsTab')) +
      rightTab('mcp', t('chats.mcpTab')) +
      rightTab('agent', t('chats.agentTab')) +
      '</div>' +
      '<div class="ch-right-body">' +
      renderRightBody() +
      '</div>' +
      '</aside>'
    );
  }
  function rightTab(id, label) {
    return (
      '<button type="button" class="ch-tab ch-tab-right' +
      (state.rightTab === id ? ' is-on' : '') +
      '" data-ch-right-tab="' +
      id +
      '">' +
      label +
      '</button>'
    );
  }
  function renderRightBody() {
    if (state.rightTab === 'mcp') return renderMcpTab();
    if (state.rightTab === 'agent') return renderAgentTab();
    return renderParamsTab();
  }

  function renderParamsTab() {
    var p = providerByKey(state.providerKey);
    var models = modelOptions(state.providerKey);
    var prompt = promptById(state.promptId);
    var q = (state.modelQuery || '').trim().toLowerCase();
    var filtered = models
      ? models.filter(function (m) {
          return m.toLowerCase().indexOf(q) !== -1;
        })
      : [];

    var schema = [
      { label: t('chats.temperature'), key: 'temperature', min: 0, max: 2, step: 0.01 },
      { label: t('chats.topP'), key: 'topP', min: 0, max: 1, step: 0.01 },
    ];
    var paramInputs = schema
      .map(function (s2) {
        var val = state.params[s2.key];
        return renderParamField(s2, val);
      })
      .join('');
    var maxTokens = state.params.maxTokens;

    return (
      '<div class="ch-panel-scroll">' +
      fieldSection(t('chats.provider'),
        '<div class="ch-field">' +
        '<button type="button" class="ch-select-like" data-dropdown-trigger data-ch-p-provider-trigger>' +
        '<span class="ch-select-ic">' +
        ic('layers', 'size-3.5') +
        '</span>' +
        '<span class="ch-select-name">' +
        esc(p ? p.name : t('chats.selectProvider')) +
        '</span>' +
        (p && !p.hasApiKey && !p.local ? ic('key-round', 'size-3 ch-warn') : '') +
        ic('chevron-down', 'size-3.5') +
        '</button>' +
        '<div data-dropdown-menu class="ch-select-menu ' +
        App.ui.dropdownContentClass('min-w-52') +
        '" data-side="bottom">' +
        providers()
          .map(function (p2) {
            return (
              '<button type="button" role="menuitem" class="' +
              App.ui.dropdownItemClass('gap-2') +
              '" data-ch-p-provider="' +
              escAttr(p2.key) +
              '">' +
              '<span class="ch-dd-check">' +
              (p2.key === state.providerKey ? ic('check', 'size-3.5') : '') +
              '</span>' +
              '<span class="ch-dd-name">' +
              esc(p2.name) +
              '</span>' +
              '</button>'
            );
          })
          .join('') +
        App.ui.dropdownSeparator() +
        '<button type="button" role="menuitem" class="' +
        App.ui.dropdownItemClass('gap-2 ch-dd-primary') +
        '" data-ch-provider-add>' +
        ic('circle-plus', 'size-3.5') +
        t('chats.addProvider') +
        '</button>' +
        '</div></div>') +
      fieldSection(
        t('chats.model'),
        '<div class="ch-model-combo">' +
        '<div class="ch-model-top">' +
        '<input type="text" class="ch-model-input" data-ch-model-input placeholder="' +
        escAttr(t('chats.modelPlaceholder')) +
        '" value="' +
        escAttr(state.model || '') +
        '" autocomplete="off" />' +
        '<button type="button" class="ch-icon-btn ch-sm-btn" data-ch-p-model-fetch data-tip="' +
        escAttr(t('chats.fetchModels')) +
        '" aria-label="' +
        escAttr(t('chats.fetchModels')) +
        '">' +
        ic('refresh-cw', 'size-3.5') +
        '</button>' +
        '</div>' +
        '<div class="ch-model-list" data-ch-model-list>' +
        (filtered && filtered.length
          ? filtered
              .map(function (m) {
                return (
                  '<button type="button" class="ch-model-opt' +
                  (m === state.model ? ' is-on' : '') +
                  '" data-ch-p-model="' +
                  escAttr(m) +
                  '">' +
                  (m === state.model ? ic('check', 'size-3.5') : '') +
                  '<span>' +
                  esc(m) +
                  '</span>' +
                  '</button>'
                );
              })
              .join('')
          : '<div class="ch-model-empty">' + esc(t('chats.noModelsHint')) + '</div>') +
        '</div>' +
        '</div>'
      ) +
      paramInputs +
      fieldSection(
        t('chats.topK'),
        '<input type="number" class="ch-num-input" data-ch-param="topK" min="0" max="100" value="' +
        escAttr(state.params.topK != null ? state.params.topK : '') +
        '" />'
      ) +
      fieldSection(
        t('chats.maxTokens'),
        '<div class="ch-tokens-row">' +
        '<input type="text" class="ch-num-input ch-tokens-input" data-ch-param="maxTokens" value="' +
        escAttr(maxTokens) +
        '" placeholder="' +
        escAttr(t('chats.tokensPlaceholder')) +
        '" autocomplete="off" />' +
        '<span class="ch-tokens-hint">' +
        esc(formatTokens(maxTokens)) +
        '</span>' +
        '<span class="cm-chip-wrap" data-dropdown>' +
        '<button type="button" class="ch-preset-btn" data-dropdown-trigger aria-label="' +
        escAttr(t('chats.presets')) +
        '">' +
        ic('chevron-down', 'size-3.5') +
        '</button>' +
        '<div data-dropdown-menu class="' +
        App.ui.dropdownContentClass('min-w-24') +
        '" data-side="bottom">' +
        TOKEN_PRESETS.map(function (v) {
          return (
            '<button type="button" role="menuitem" class="' +
            App.ui.dropdownItemClass('gap-1') +
            '" data-ch-preset="' +
            escAttr(v) +
            '">' +
            (String(maxTokens) === v ? ic('check', 'size-3.5') : '') +
            '<span class="ch-dd-name">' +
            esc(v) +
            '</span>' +
            '</button>'
          );
        }).join('') +
        '</div></span>' +
        '</div>'
      ) +
      fieldSection(
        t('chats.prompt'),
        '<div class="ch-field">' +
        '<button type="button" class="ch-select-like" data-dropdown-trigger data-ch-prompt-trigger>' +
        '<span class="ch-select-ic">' +
        ic('wand-2', 'size-3.5') +
        '</span>' +
        '<span class="ch-select-name">' +
        esc(prompt ? prompt.name : t('chats.noPrompt')) +
        '</span>' +
        ic('chevron-down', 'size-3.5') +
        '</button>' +
        '<div data-dropdown-menu class="ch-select-menu ' +
        App.ui.dropdownContentClass('min-w-56') +
        '" data-side="bottom">' +
        '<button type="button" role="menuitem" class="' +
        App.ui.dropdownItemClass('gap-2') +
        '" data-ch-prompt-none>' +
        '<span class="ch-dd-check">' +
        (!state.promptId ? ic('check', 'size-3.5') : '') +
        '</span>' +
        '<span class="ch-dd-name">' +
        esc(t('chats.noPrompt')) +
        '</span>' +
        '</button>' +
        App.ui.dropdownSeparator() +
        prompts()
          .map(function (pr) {
            return (
              '<button type="button" role="menuitem" class="' +
              App.ui.dropdownItemClass('gap-2') +
              '" data-ch-prompt="' +
              escAttr(pr.id) +
              '">' +
              '<span class="ch-dd-check">' +
              (pr.id === state.promptId ? ic('check', 'size-3.5') : '') +
              '</span>' +
              '<span class="ch-dd-name">' +
              esc(pr.name) +
              '</span>' +
              (pr.category ? '<span class="ch-dd-cat">' + esc(pr.category) + '</span>' : '') +
              '</button>'
            );
          })
          .join('') +
        App.ui.dropdownSeparator() +
        '<button type="button" role="menuitem" class="' +
        App.ui.dropdownItemClass('gap-2 ch-dd-primary') +
        '" data-ch-prompt-new>' +
        ic('plus', 'size-3.5') +
        t('chats.promptNew') +
        '</button>' +
        '</div></div>' +
        (prompt
          ? '<div class="ch-prompt-actions">' +
            '<button type="button" class="ch-link-btn" data-ch-prompt-edit="' +
            escAttr(prompt.id) +
            '">' +
            ic('pencil', 'size-3') +
            t('chats.promptEdit') +
            '</button>' +
            '<button type="button" class="ch-link-btn is-danger" data-ch-prompt-del="' +
            escAttr(prompt.id) +
            '">' +
            ic('trash-2', 'size-3') +
            t('chats.promptDelete') +
            '</button>' +
            '</div>'
          : '') +
        (prompt ? '<div class="ch-prompt-preview">' + esc(prompt.content.slice(0, 180)) + (prompt.content.length > 180 ? '…' : '') + '</div>' : '')
      ) +
      fieldSection(
        t('chats.webSearchTitle'),
        '<label class="ch-switch-row">' +
        '<span class="ch-switch-label">' +
        t('chats.webSearchToggle') +
        '</span>' +
        '<span role="switch" aria-checked="' +
        (state.webSearch.enabled ? 'true' : 'false') +
        '" class="ui-switch' +
        (state.webSearch.enabled ? ' is-on' : '') +
        '" data-ch-ws-switch></span>' +
        '</label>' +
        (state.webSearch.enabled
          ? '<div class="ch-ws-providers">' +
            ['tavily', 'brave', 'serper']
              .map(function (prov) {
                return (
                  '<button type="button" class="ch-ws-provider' +
                  (state.webSearch.provider === prov ? ' is-on' : '') +
                  '" data-ch-ws-provider="' +
                  prov +
                  '">' +
                  capt(prov) +
                  '</button>'
                );
              })
              .join('') +
            '</div>'
          : '')
      ) +
      '</div>'
    );
  }

  var TOKEN_PRESETS = [
    '2k',
    '4k',
    '8k',
    '16k',
    '32k',
    '64k',
    '128k',
    '256k',
    '384k',
  ];
  function formatTokens(v) {
    var n = parseTokens(v);
    if (!n) return '';
    if (n % (1024 * 1024) === 0) return n / 1024 / 1024 + 'M';
    if (n % 1024 === 0) return n / 1024 + 'K';
    return String(n);
  }
  function capt(name) {
    return { tavily: 'Tavily', brave: 'Brave', serper: 'Serper' }[name] || name;
  }

  function renderParamField(s, val) {
    if (val === undefined || val === '' || val === null) val = s.min;
    var pct = ((Number(val) - s.min) / (s.max - s.min)) * 100;
    return (
      '<div class="ch-field ch-param">' +
      '<div class="ch-param-head">' +
      '<label>' +
      esc(s.label) +
      '</label>' +
      '<span class="ch-param-val" data-param-val="' +
      s.key +
      '">' +
      esc(val) +
      '</span>' +
      '</div>' +
      '<div class="ch-param-range">' +
      '<input type="range" class="cm-range" min="' +
      s.min +
      '" max="' +
      s.max +
      '" step="' +
      s.step +
      '" value="' +
      val +
      '" data-ch-param="' +
      s.key +
      '" data-param-range="' +
      s.key +
      '" style="--pct:' +
      pct +
      '%" />' +
      '</div>' +
      '</div>'
    );
  }

  function renderMcpTab() {
    var list = mcps();
    var body =
      '<div class="ch-panel-scroll">' +
      (list.length
        ? list.map(renderMcpCard).join('')
        : '<div class="ch-panel-empty">' +
          ic('plug', 'size-5') +
          '<span>' +
          esc(t('chats.mcpEmpty')) +
          '</span>' +
          '</div>') +
      '</div>' +
      '<div class="ch-panel-foot">' +
      '<button type="button" data-slot="button" class="' +
      App.ui.buttonClass('default', 'sm', 'w-full') +
      '" data-ch-mcp-add>' +
      ic('plus', 'size-4') +
      t('chats.mcpAdd') +
      '</button>' +
      '</div>';
    return body;
  }
  function renderMcpCard(m) {
    var tools = Array.isArray(m.tools) ? m.tools : [];
    var toolRows = tools
      .map(function (tl, i) {
        var disabled = !m.enabled;
        var on = m.enabled && tl.enabled !== false;
        return (
          '<label class="ch-mcp-tool">' +
          '<span class="ch-mcp-tool-name">' +
          ic('wrench', 'size-3') +
          '<span class="ch-mcp-tool-title">' +
          esc(tl.name || 'tool') +
          '</span>' +
          '</span>' +
          '<span role="switch" aria-checked="' +
          (on ? 'true' : 'false') +
          '" class="ui-switch' +
          (on ? ' is-on' : '') +
          (disabled ? ' is-disabled' : '') +
          '" data-ch-mcp-tool="' +
          escAttr(m.id) +
          ':' +
          i +
          '"></span>' +
          '</label>'
        );
      })
      .join('');
    var sse = m.protocol === 'sse';
    return (
      '<div class="ch-mcp-card">' +
      '<div class="ch-mcp-head">' +
      '<div class="ch-mcp-titles">' +
      '<span class="ch-mcp-name">' +
      (sse ? ic('radio', 'size-3.5') : ic('plug', 'size-3.5')) +
      esc(m.name) +
      '</span>' +
      '<span class="ch-mcp-url">' +
      esc(m.url) +
      '</span>' +
      '</div>' +
      '<span role="switch" aria-checked="' +
      (m.enabled ? 'true' : 'false') +
      '" class="ui-switch' +
      (m.enabled ? ' is-on' : '') +
      '" data-ch-mcp-toggle="' +
      escAttr(m.id) +
      '"></span>' +
      '</div>' +
      '<div class="ch-mcp-meta">' +
      '<span class="ch-mcp-badge">' +
      (sse ? t('chats.mcpProtocolSse') : t('chats.mcpProtocolHttp')) +
      '</span>' +
      '<span class="ch-mcp-count">' +
      t('chats.mcpTools') +
      ' ' +
      tools.length +
      '</span>' +
      '<div class="ch-mcp-ops">' +
      '<button type="button" class="ch-mcp-op" data-ch-mcp-edit="' +
      escAttr(m.id) +
      '">' +
      ic('pencil', 'size-3') +
      '</button>' +
      '<button type="button" class="ch-mcp-op is-danger" data-ch-mcp-del="' +
      escAttr(m.id) +
      '">' +
      ic('trash-2', 'size-3') +
      '</button>' +
      '</div>' +
      '</div>' +
      (tools.length
        ? '<div class="ch-mcp-tools">' +
          '<div class="ch-mcp-tools-label">' +
          t('chats.mcpToolsEnabled') +
          '</div>' +
          toolRows +
          '</div>'
        : '<div class="ch-mcp-notools">' + esc(t('chats.mcpFetchFirst')) + '</div>') +
      '</div>'
    );
  }
  function renderAgentTab() {
    return (
      '<div class="ch-panel-scroll">' +
      App.ui.emptyState({
        icon: 'bot',
        title: t('chats.agentTab'),
        desc: t('chats.agentDesc'),
        fill: true,
      }) +
      '</div>'
    );
  }

  function renderPageT() {
    // 占位(由 renderPage 使用 state.t)
    return '';
  }

  /* ============================================================
   * 交互(全部 document 级事件委托)
   * ============================================================ */
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute) return;
    var region = el.closest('[data-ch-region]');
    if (!region) return;
    if (el.hasAttribute('data-ch-input-text')) {
      state.inputText = el.value;
      autoGrow(el);
      state.keepFocus = true;
      return;
    }
    if (el.hasAttribute('data-ch-param')) {
      var key = el.getAttribute('data-ch-param');
      var val = el.value;
      if (key === 'maxTokens') {
        var n = parseTokens(val);
        state.params.maxTokens = val || '';
        var hint = region.querySelector('.ch-tokens-hint');
        if (hint) hint.textContent = formatTokens(val);
      } else {
        state.params[key] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : Number(el.value);
        var valEl = region.querySelector('[data-param-val="' + quote(key) + '"]');
        if (valEl) valEl.textContent = el.value;
        var rangeEl = region.querySelector('[data-param-range="' + quote(key) + '"]');
        if (rangeEl) {
          var s = Number(el.value);
          var min = Number(el.min) || 0;
          var max = Number(el.max) || 1;
          rangeEl.style.setProperty('--pct', ((s - min) / (max - min)) * 100 + '%');
        }
      }
      persistPrefs();
      return;
    }
    if (el.hasAttribute('data-ch-model-input')) {
      state.model = el.value.trim();
      state.modelQuery = el.value;
      state.keepFocus = true;
      var list = region.querySelector('[data-ch-model-list]');
      if (list && list._chModelOpen) {
        // 重绘候选(简单:仅当输入变化时切换命中态)
        applyModelFilter(el.value);
      }
      persistPrefs();
      return;
    }
    if (el.hasAttribute('data-ch-msg-edit-text')) {
      var id = el.getAttribute('data-ch-msg-edit-text');
      state.editDrafts = state.editDrafts || {};
      state.editDrafts[id] = el.value;
      return;
    }
  });

  function quote(k) {
    return String(k);
  }
  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(200, Math.max(44, el.scrollHeight)) + 'px';
  }
  function applyModelFilter(q) {
    var region = regionEl();
    if (!region) return;
    var list = region.querySelector('[data-ch-model-list]');
    if (!list) return;
    var models = modelOptions(state.providerKey) || [];
    var lq = String(q || '').toLowerCase();
    var html = models
      .filter(function (m) {
        return m.toLowerCase().indexOf(lq) !== -1 && (m === state.model || lq ? true : true);
      })
      .map(function (m) {
        return (
          '<button type="button" class="ch-model-opt' +
          (m === state.model ? ' is-on' : '') +
          '" data-ch-p-model="' +
          escAttr(m) +
          '">' +
          (m === state.model ? ic('check', 'size-3.5') : '') +
          '<span>' +
          esc(m) +
          '</span>' +
          '</button>'
        );
      })
      .join('');
    list.innerHTML = html || '<div class="ch-model-empty">' + esc(t('chats.noModelsHint')) + '</div>';
    list._chModelOpen = true;
  }

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute) return;
    if (el.hasAttribute('data-ch-param')) {
      persistPrefs();
    }
  });

  document.addEventListener('keydown', function (e) {
    var region = document.querySelector('[data-ch-region]');
    if (!region) return;
    var el = e.target;
    if (el && el.hasAttribute && el.hasAttribute('data-ch-input-text')) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        doSend();
      }
    }
  });

  document.addEventListener('paste', function (e) {
    var region = document.querySelector('[data-ch-region]');
    if (!region) return;
    var el = e.target;
    if (!el || !el.hasAttribute || !el.hasAttribute('data-ch-input-text')) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type && it.type.indexOf('image/') === 0) {
        e.preventDefault();
        var file = it.getAsFile();
        if (file) readImageFile(file, function (part) {
          state.attachments.push(part);
          rerender();
        });
        return;
      }
    }
    var text = e.clipboardData.getData('text');
    if (text && text.length > 4000) {
      e.preventDefault();
      state.inputText = tF('chats.longTextNote', { n: text.length });
      state.attachments.push({
        type: 'file',
        name: t('chats.pasteedFile') + '-' + Date.now() + '.txt',
        content: text,
      });
      rerender();
    }
  });

  document.addEventListener('drop', function (e) {
    var region = document.querySelector('[data-ch-region]');
    if (!region) return;
    var el = e.target;
    if (!el || !el.closest || !el.closest('[data-ch-input-text]')) return;
    e.preventDefault();
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    Array.prototype.forEach.call(e.dataTransfer.files, function (file) {
      var isImg = /^image\//.test(file.type);
      if (isImg) readImageFile(file, function (part) {
        state.attachments.push(part);
        rerender();
      });
      else readTextFile(file, function (part) {
        state.attachments.push(part);
        rerender();
      });
    });
  });

  function readImageFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      cb({
        type: 'image',
        name: file.name || 'image.png',
        dataUri: String(reader.result || ''),
      });
    };
    reader.readAsDataURL(file);
  }
  function readTextFile(file, cb) {
    if (!/\.(txt|md|markdown|json|csv|ts|js|tsx|jsx|py|go|java|sql|html|css|xml|yml|yaml|sh)$/i.test(file.name) && file.size > 256 * 1024) {
      cb({ type: 'file', name: file.name, dataUri: null, text: '' });
      return;
    }
    if (file.size > 512 * 1024) {
      cb({ type: 'file', name: file.name, dataUri: null, text: '' });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      cb({ type: 'file', name: file.name, dataUri: null, text: String(reader.result || ''), content: String(reader.result || '') });
    };
    reader.readAsText(file);
  }

  document.addEventListener('click', function (e) {
    var region = document.querySelector('[data-ch-region]');
    if (!region) return;
    var el = e.target;
    if (!el || !el.closest) return;

    // 防止右键菜单浮层在 body 下的命中穿透:仅处理当前模块区域或模块浮层
    var inside =
      el.closest('[data-ch-region]') ||
      el.closest('[data-cm-ctxpop]') ||
      el.closest('[data-cm-menu]') ||
      el.closest('[data-cm-tagmenu]');
    if (!inside && !el.closest('.ui-ctxpop')) return;
    // 公共组件(右键浮层)已自行处理,避免重复
    if (el.closest('[data-gt-ctx]') || el.closest('[data-tp-act]')) return;

    var more = el.closest('[data-ch-conv-more]');
    if (more) {
      var id = more.getAttribute('data-ch-conv-more');
      openConvMenu(id, more);
      return;
    }
    var open = el.closest('[data-ch-open]');
    if (open) {
      e.preventDefault();
      stopStreamSilent();
      state.selectedId = open.getAttribute('data-ch-open');
      state.messages = [];
      rerender();
      loadMessages(state.selectedId, true);
      closeMobileLeft();
      return;
    }
    if (el.closest('[data-ch-newconv]')) {
      createConversation();
      return;
    }
    if (el.closest('[data-ch-toggle-left]')) {
      state.leftOpen = !state.leftOpen;
      persistPrefs();
      rerender();
      return;
    }
    var tab = el.closest('[data-ch-tab]');
    if (tab && !el.closest('[data-ch-tab-right]')) {
      state.leftTab = tab.getAttribute('data-ch-tab');
      rerender();
      return;
    }
    var rtab = el.closest('[data-ch-right-tab]');
    if (rtab) {
      state.rightTab = rtab.getAttribute('data-ch-right-tab');
      persistPrefs();
      rerender();
      return;
    }
    var view = el.closest('[data-ch-view]');
    if (view) {
      state.viewFilter = view.getAttribute('data-ch-view');
      rerender();
      return;
    }
    var provider = el.closest('[data-ch-provider]');
    if (provider) {
      setProvider(provider.getAttribute('data-ch-provider'));
      return;
    }
    var model = el.closest('[data-ch-model]');
    if (model) {
      state.model = model.getAttribute('data-ch-model');
      persistPrefs();
      rerender();
      state.keepFocus = false;
      return;
    }
    if (el.closest('[data-ch-model-manual]')) {
      openModelManualDialog();
      return;
    }
    var pProvider = el.closest('[data-ch-p-provider]');
    if (pProvider) {
      setProvider(pProvider.getAttribute('data-ch-p-provider'));
      return;
    }
    if (el.closest('[data-ch-provider-add]')) {
      openProviderDialog();
      return;
    }
    var pModel = el.closest('[data-ch-p-model]');
    if (pModel) {
      state.model = pModel.getAttribute('data-ch-p-model');
      state.modelQuery = '';
      persistPrefs();
      rerender();
      return;
    }
    if (el.closest('[data-ch-p-model-fetch]')) {
      fetchModels();
      return;
    }
    var preset = el.closest('[data-ch-preset]');
    if (preset) {
      state.params.maxTokens = preset.getAttribute('data-ch-preset');
      persistPrefs();
      rerender();
      return;
    }
    var promptSel = el.closest('[data-ch-prompt]');
    if (promptSel) {
      state.promptId = promptSel.getAttribute('data-ch-prompt');
      persistPrefs();
      rerender();
      return;
    }
    if (el.closest('[data-ch-prompt-none]')) {
      state.promptId = '';
      persistPrefs();
      rerender();
      return;
    }
    if (el.closest('[data-ch-prompt-new]')) {
      openPromptDialog(null);
      return;
    }
    var pEdit = el.closest('[data-ch-prompt-edit]');
    if (pEdit) {
      openPromptDialog(pEdit.getAttribute('data-ch-prompt-edit'));
      return;
    }
    var pDel = el.closest('[data-ch-prompt-del]');
    if (pDel) {
      deletePrompt(pDel.getAttribute('data-ch-prompt-del'));
      return;
    }
    if (el.closest('[data-ch-ws-toggle]') || el.closest('[data-ch-ws-switch]')) {
      state.webSearch.enabled = !state.webSearch.enabled;
      persistPrefs();
      rerender();
      return;
    }
    var wsProv = el.closest('[data-ch-ws-provider]');
    if (wsProv) {
      state.webSearch.provider = wsProv.getAttribute('data-ch-ws-provider');
      persistPrefs();
      rerender();
      return;
    }
    if (el.closest('[data-ch-mcp-toggle]')) {
      state.mcpEnabled = !state.mcpEnabled;
      persistPrefs();
      rerender();
      return;
    }
    if (el.closest('[data-ch-toggle-right]')) {
      state.rightOpen = !state.rightOpen;
      persistPrefs();
      rerender();
      return;
    }
    if (el.closest('[data-ch-stop]')) {
      stopStream();
      return;
    }
    if (el.closest('[data-ch-send]')) {
      // 备用发送(桌面端默认按钮未渲染,保留)
      doSend();
      return;
    }
    var wsBtn = el.closest('[data-ch-ws-btn]');
    if (wsBtn) {
      state.webSearch.enabled = !state.webSearch.enabled;
      persistPrefs();
      rerender();
      return;
    }
    if (el.closest('[data-ch-reload]')) {
      bootLoad();
      rerender();
      return;
    }
    if (el.closest('[data-ch-mobile-backdrop]')) {
      state.leftOpen = false;
      state.rightOpen = false;
      rerender();
      return;
    }
    // 附件移除
    var attRemove = el.closest('[data-ch-att-remove]');
    if (attRemove) {
      var idx = Number(attRemove.getAttribute('data-ch-att-remove'));
      state.attachments.splice(idx, 1);
      rerender();
      return;
    }
    // 气泡动作
    var copyBtn = el.closest('[data-ch-copy]');
    if (copyBtn) {
      var msgId = Number(copyBtn.getAttribute('data-ch-copy'));
      var msgs = state.messages;
      for (var mi = 0; mi < msgs.length; mi++) {
        if (msgs[mi].id === msgId) {
          copyPlain(msgs[mi].content || '');
          break;
        }
      }
      return;
    }
    var editBtn = el.closest('[data-ch-edit]');
    if (editBtn) {
      startEditMessage(Number(editBtn.getAttribute('data-ch-edit')));
      return;
    }
    var retryBtn = el.closest('[data-ch-retry]');
    if (retryBtn) {
      regenerate(Number(retryBtn.getAttribute('data-ch-retry')));
      return;
    }
    var fbBtn = el.closest('[data-ch-fb]');
    if (fbBtn) {
      setFeedback(Number(fbBtn.getAttribute('data-ch-fb')), fbBtn.getAttribute('data-val'));
      return;
    }
    // 思考/工具折叠
    var think = el.closest('[data-ch-think-toggle]');
    if (think) {
      var tk = think.getAttribute('data-ch-think-toggle');
      state.openThink = state.openThink || {};
      state.openThink[tk] = !(state.openThink[tk] === false ? false : true);
      toggleThink(think, tk, state.openThink[tk]);
      return;
    }
    var toolsToggle = el.closest('[data-ch-tools-toggle]');
    if (toolsToggle) {
      var tk2 = toolsToggle.getAttribute('data-ch-tools-toggle');
      state.openTools = state.openTools || {};
      state.openTools[tk2] = !state.openTools[tk2];
      rerender();
      return;
    }
    var toolToggle = el.closest('[data-ch-tool-toggle]');
    if (toolToggle) {
      var tkey = toolToggle.getAttribute('data-ch-tool-toggle');
      // 流式工具原位展开/折叠
      var trow = el.closest('[data-tool-key]');
      if (trow && trow.classList.contains('cm-stream')) {
        var detail = trow.querySelector('.cm-tool-detail');
        var opened2 = !detail;
        if (opened2) toolExpand(trow, tkey);
        else trow.classList.remove('is-open'), removeDetail(trow);
        return;
      }
      state.openToolRow = state.openToolRow || {};
      state.openToolRow[tkey] = !state.openToolRow[tkey];
      rerender();
      return;
    }
    // 编辑保存/取消
    if (el.closest('[data-ch-edit-save]')) {
      saveEditMessage(el.closest('[data-ch-edit-save]').getAttribute('data-ch-edit-id'));
      return;
    }
    if (el.closest('[data-ch-edit-cancel]')) {
      state.editingId = null;
      rerender();
      return;
    }
    // MCP
    if (el.closest('[data-ch-mcp-add]')) {
      openMcpDialog(null);
      return;
    }
    var mcpToggle = el.closest('[data-ch-mcp-toggle-ctrl]');
    if (mcpToggle) {
      // 占位(开关用 .ui-switch 的 click 委托见下)
    }
    var mc = el.closest('[data-ch-mcp-toggle]');
    if (mc && !el.closest('[data-ch-mcp-tool]')) {
      toggleMcp(mc.getAttribute('data-ch-mcp-toggle'));
      return;
    }
    var mcpEdit = el.closest('[data-ch-mcp-edit]');
    if (mcpEdit) {
      openMcpDialog(mcpEdit.getAttribute('data-ch-mcp-edit'));
      return;
    }
    var mcpDel = el.closest('[data-ch-mcp-del]');
    if (mcpDel) {
      deleteMcp(mcpDel.getAttribute('data-ch-mcp-del'));
      return;
    }
  });

  // 开关类(role=switch)统一点击处理:MCP 服务器 / 工具 / 网络搜索
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var sw = el.closest('[data-ch-mcp-tool]');
    if (sw) {
      var parts = sw.getAttribute('data-ch-mcp-tool').split(':');
      toggleMcpTool(parts[0], Number(parts[1]));
      return;
    }
    var ws = el.closest('[data-ch-ws-switch]');
    if (ws) {
      state.webSearch.enabled = !state.webSearch.enabled;
      persistPrefs();
      rerender();
      return;
    }
  });

  document.addEventListener('contextmenu', function (e) {
    var conv = e.target && e.target.closest ? e.target.closest('[data-ch-conv]') : null;
    if (!conv) return;
    var region = conv.closest('[data-ch-region]');
    if (!region) return;
    e.preventDefault();
    var id = conv.getAttribute('data-ch-conv');
    openConvMenu(id, null, e.clientX, e.clientY);
  });

  /* ---------- 动作实现 ---------- */
  function setProvider(key) {
    var models = modelOptions(key);
    state.providerKey = key;
    if (models && models.length) {
      if (!models.some(function (m) {
        return m === state.model;
      })) state.model = models[0];
    } else {
      state.model = '';
    }
    persistPrefs();
    rerender();
    state.keepFocus = false;
  }

  function createConversation() {
    stopStreamSilent();
    App.api
      .post('/api/chats/conversations', {
        providerKey: state.providerKey || '',
        model: state.model || '',
        promptId: state.promptId || '',
        params: {},
      })
      .then(function (res) {
        var cv = (res && res.conversation) || {};
        state.selectedId = cv.id;
        state.messages = [];
        state.inputText = '';
        state.attachments = [];
        state.leftOpen = state.leftOpen === false ? false : state.leftOpen;
        return reloadState().then(function () {
          state.selectedId = cv.id;
          rerender();
          focusComposer();
        });
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'create_failed', 'error');
      });
  }
  function focusComposer() {
    state.keepFocus = true;
    var ta = regionEl() && regionEl().querySelector('[data-ch-input-text]');
    if (ta) {
      ta.focus();
    }
  }

  function openConvMenu(id, anchorEl, x, y) {
    var c = null;
    conversations().forEach(function (cv) {
      if (cv.id === id) c = cv;
    });
    if (!c) return;
    var html =
      App.ui.contextMenu.item('star', t(c.favorite ? 'chats.unfav' : 'chats.fav'), {
        attrs: 'data-ch-conv-act="fav" data-id="' + escAttr(id) + '"',
        isOn: !!c.favorite,
      }) +
      App.ui.contextMenu.item('pin', t(c.pinned ? 'chats.unpin' : 'chats.pin'), {
        attrs: 'data-ch-conv-act="pin" data-id="' + escAttr(id) + '"',
        isOn: !!c.pinned,
      }) +
      App.ui.contextMenu.separator() +
      App.ui.contextMenu.item('pencil', t('chats.rename'), {
        attrs: 'data-ch-conv-act="rename" data-id="' + escAttr(id) + '"',
      }) +
      App.ui.contextMenu.submenu(
        t('chats.moveTo'),
        'folder',
        '<div class="cm-menu-item" data-ch-conv-move="" data-id="' +
          escAttr(id) +
          '" data-ch-conv-act-move>noop</div>' +
          convMoveItems(id)
      ) +
      App.ui.contextMenu.item('tag', t('chats.addTags'), {
        attrs: 'data-ch-conv-act="tags" data-id="' + escAttr(id) + '"',
      }) +
      App.ui.contextMenu.item('archive', t(c.archived ? 'chats.unarchive' : 'chats.archive'), {
        attrs: 'data-ch-conv-act="archive" data-id="' + escAttr(id) + '"',
        isOn: !!c.archived,
      }) +
      App.ui.contextMenu.separator() +
      App.ui.contextMenu.item('trash-2', t('chats.deleteConv'), {
        attrs: 'data-ch-conv-act="del" data-id="' + escAttr(id) + '"',
        danger: true,
      });
    App.ui.contextMenu.open(html, {
      anchorEl: anchorEl || null,
      x: x || 0,
      y: y || 0,
      className: 'cm-ctxpop',
    });
    // 将当前会话 id 挂到浮层供子菜单点击解析
    var pop = document.querySelector('[data-ctxpop].cm-ctxpop');
    if (pop) pop._chConvId = id;
  }

  function convMoveItems(convId) {
    var items =
      '<button type="button" data-ch-conv-move="' +
      escAttr(convId) +
      '" data-parent="" class="cm-move-opt">' +
      '<span class="ui-ctx-hash">#</span>' +
      esc(t('chats.noGroup')) +
      '</button>';
    groups().forEach(function (g) {
      items +=
        '<button type="button" data-ch-conv-move="' +
        escAttr(convId) +
        '" data-parent="' +
        escAttr(g.id) +
        '" class="cm-move-opt" data-pad="' +
        padDepth(groups(), g.id) +
        '">' +
        '<span class="cm-move-ic">' +
        (g.icon ? esc(g.icon) : ic('folder', 'size-3')) +
        '</span>' +
        esc(g.name) +
        '</button>';
    });
    return items;
  }
  function padDepth(list, id) {
    var d = 0;
    var cur = id;
    var guard = 0;
    while (cur && guard < 20) {
      guard++;
      var found = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === cur && list[i].parentId) {
          d++;
          cur = list[i].parentId;
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    return d;
  }

  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    // 会话右键浮层动作
    var act = el.closest('[data-ch-conv-act]');
    if (act) {
      if (!el.closest('[data-ch-region]') && !el.closest('.ui-ctxpop')) {
        // 浮层挂在 body 下,正常处理
      }
      applyConvAction(
        act.getAttribute('data-ch-conv-act'),
        act.getAttribute('data-id')
      );
      App.ui.contextMenu.close();
      return;
    }
    // 移动到分组
    var move = el.closest('[data-ch-conv-move]');
    if (move && move.hasAttribute('data-parent')) {
      applyConvAction('move', move.getAttribute('data-ch-conv-move'), move.getAttribute('data-parent'));
      App.ui.contextMenu.close();
      return;
    }
    // 添加标签(打开标签选择浮层)
    var tagsAct = el.closest('[data-ch-conv-act="tags"]');
    if (tagsAct) {
      openTagsPicker(tagsAct.getAttribute('data-id'));
      return;
    }
  });

  function applyConvAction(act, id, moveParent) {
    var c = null;
    conversations().forEach(function (cv) {
      if (cv.id === id) c = cv;
    });
    if (!c) return;
    var patch = {};
    if (act === 'fav') patch.favorite = !c.favorite;
    else if (act === 'pin') patch.pinned = !c.pinned;
    else if (act === 'archive') patch.archived = !c.archived;
    else if (act === 'move') patch.groupId = moveParent || '';
    if (Object.keys(patch).length) {
      App.api
        .put('/api/chats/conversations/' + encodeURIComponent(id), patch)
        .then(function () {
          return reloadState();
        })
        .catch(function (e) {
          App.ui.toast((e && e.message) || 'update_failed', 'error');
        });
      return;
    }
    if (act === 'rename') openRenameConv(c);
    else if (act === 'del') confirmDeleteConv(c);
  }

  function openRenameConv(c) {
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + t('chats.rename') + '</h2>',
      body:
        '<label class="ui-dialog-label">' +
        t('chats.name') +
        '</label>' +
        '<input type="text" class="ui-input ch-dialog-input" data-ch-rename-input value="' +
        escAttr(c.title || '') +
        '" maxlength="80" />',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-rename-cancel>' +
        t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-rename-ok>' +
        t('chats.save') +
        '</button>',
    });
    var inp = document.querySelector('[data-ch-rename-input]');
    if (inp) {
      inp.focus();
      inp.select();
    }
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var ok = el.closest('[data-ch-rename-ok]');
    if (ok) {
      var inp = document.querySelector('[data-ch-rename-input]');
      var title = (inp && inp.value.trim()) || '';
      var id = null;
      var c = selectedConv();
      if (c) id = c.id;
      if (!id) id = state.selectedId;
      if (id) {
        App.api.put('/api/chats/conversations/' + encodeURIComponent(id), { title: title }).then(function () {
          return reloadState();
        });
      }
      App.ui.closeDialog();
      return;
    }
    if (el.closest('[data-ch-rename-cancel]')) App.ui.closeDialog();
  });

  function confirmDeleteConv(c) {
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + t('chats.deleteConv') + '</h2>',
      body:
        '<p class="ui-dialog-desc">' +
        tF('chats.deleteConvMsg', { name: esc(c.title || t('chats.untitled')) }) +
        '</p>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-del-cancel>' +
        t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('destructive', 'sm') +
        '" data-ch-del-ok>' +
        t('chats.delete') +
        '</button>',
    });
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    if (el.closest('[data-ch-del-ok]')) {
      var id = state.selectedId;
      App.ui.closeDialog();
      if (!id) return;
      App.api
        .del('/api/chats/conversations/' + encodeURIComponent(id))
        .then(function () {
          if (state.selectedId === id) state.selectedId = null;
          state.messages = [];
          stopStreamSilent();
          reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'delete_failed', 'error');
          reloadState();
        });
      return;
    }
    if (el.closest('[data-ch-del-cancel]')) App.ui.closeDialog();
  });

  function openTagsPicker(convId) {
    var c = null;
    conversations().forEach(function (cv) {
      if (cv.id === convId) c = cv;
    });
    if (!c) return;
    var picked = (c.tagIds || []).slice();
    var inst = tagInst();
    var html =
      '<div class="cm-tagmenu" data-cm-tagmenu>' +
      '<div class="cm-tagmenu-head">' +
      t('chats.addTags') +
      '</div>' +
      inst.pickerHtml(picked) +
      '</div>';
    App.ui.contextMenu.open(html, {
      x: 8,
      y: 8,
      className: 'cm-ctxpop cm-tagmenu-pop',
      onClose: function () {
        state._tagMenuConv = null;
      },
    });
    var pop = document.querySelector('[data-ctxpop].cm-tagmenu-pop');
    if (pop) pop._chConvId = convId;
    // 绑定当前会话标签切换
    state._tagMenuConv = convId;
    state._tagMenuPicked = picked;
  }
  // 标签多选切换 → 持久化
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var pick = el.closest('[data-tp-pick]');
    if (!pick) return;
    var pop = el.closest('[data-ctxpop].cm-tagmenu-pop');
    if (!pop) return;
    var convId = pop._chConvId;
    var id = pick.getAttribute('data-tp-pick');
    var c = null;
    conversations().forEach(function (cv) {
      if (cv.id === convId) c = cv;
    });
    if (!c) return;
    var picked = (c.tagIds || []).slice();
    var idx = picked.indexOf(id);
    if (idx === -1) picked.push(id);
    else picked.splice(idx, 1);
    saveConvTags(convId, picked);
    App.ui.contextMenu.close();
  });
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var done = el.closest('[data-tp-done]');
    if (!done) return;
    var pop = el.closest('[data-ctxpop].cm-tagmenu-pop');
    if (pop) {
      App.ui.contextMenu.close();
    }
  });

  function saveConvTags(convId, tagIds) {
    App.api
      .put('/api/chats/conversations/' + encodeURIComponent(convId), { tagIds: tagIds })
      .then(function () {
        return reloadState();
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'tags_failed', 'error');
      });
  }

  /* ---------- 消息动作 ---------- */
  function startEditMessage(msgId) {
    state.editingId = msgId;
    state.editDrafts = state.editDrafts || {};
    var m = null;
    state.messages.forEach(function (x) {
      if (x.id === msgId) m = x;
    });
    if (m) state.editDrafts[msgId] = m.content || '';
    rerender();
    var ta = regionEl() && regionEl().querySelector('[data-ch-edit-id="' + msgId + '"]');
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }
  function saveEditMessage(msgId) {
    var draft = (state.editDrafts && state.editDrafts[msgId]) || '';
    var m = null;
    state.messages.forEach(function (x) {
      if (x.id === msgId) m = x;
    });
    if (!m) return;
    state.editingId = null;
    App.api
      .put('/api/chats/messages/' + msgId, { content: draft })
      .then(function () {
        // 截断其后消息,再重新生成
        return App.api.post('/api/chats/messages/truncate', { messageId: msgId });
      })
      .then(function () {
        App.ui.toast(t('chats.regenerating'));
        return loadMessages(state.selectedId, true).then(function () {
          startStream(false, msgId);
        });
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'edit_failed', 'error');
        loadMessages(state.selectedId, true);
      });
  }
  function setFeedback(msgId, val) {
    var m = null;
    state.messages.forEach(function (x) {
      if (x.id === msgId) m = x;
    });
    if (!m) return;
    var next = m.feedback === val ? null : val;
    App.api
      .put('/api/chats/messages/' + msgId, { feedback: next })
      .then(function (res) {
        if (res && res.message) {
          m.feedback = next;
          var row = regionEl() && regionEl().querySelector('[data-msg-id="' + msgId + '"]');
          if (row) {
            row.querySelectorAll('[data-ch-fb]').forEach(function (b) {
              b.classList.toggle('is-selected', b.getAttribute('data-val') === next);
            });
          }
        }
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'feedback_failed', 'error');
      });
  }

  function regenerate(assistantMsgId) {
    stopStreamSilent();
    // 找到 <= assistant 的最近一条 user 消息作为截断锚点
    var anchor = null;
    for (var i = 0; i < state.messages.length; i++) {
      if (state.messages[i].role === 'user' && state.messages[i].id <= assistantMsgId) {
        anchor = state.messages[i];
      }
    }
    if (!anchor) {
      App.ui.toast(t('chats.noAnchor'), 'error');
      return;
    }
    App.api
      .post('/api/chats/messages/truncate', { messageId: anchor.id })
      .then(function () {
        return loadMessages(state.selectedId, true).then(function () {
          startStream(false, anchor.id);
        });
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'retry_failed', 'error');
      });
  }

  function toggleThink(btn, key, open) {
    var wrap = btn.closest('[data-think]');
    if (!wrap) return;
    wrap.classList.toggle('is-open', !!open);
    var body = wrap.querySelector('[data-think-body]');
    if (open && body) {
      // 从流状态或按钮已渲染文本重建
      if (key === '__stream__') {
        body.innerHTML = '<p>' + esc((state.streamMsg && state.streamMsg.thinking) || '') + '</p>';
      }
    }
    var icEl = wrap.querySelector('.cm-thinking-ic');
    if (icEl) {
      icEl.innerHTML = ic(open ? 'chevron-down' : 'chevron-right', 'size-3.5');
    }
    // 流式:原样切换显示(已验证状态一致);静态:走 openThink 状态
  }

  /* ---------- 发送与流式 ---------- */
  function doSend() {
    var text = (state.inputText || '').trim();
    if (!text && !state.attachments.length) return;
    if (state.streaming) {
      App.ui.toast(t('chats.busy'), 'error');
      return;
    }
    stopStreamSilent();
    if (!state.providerKey) {
      App.ui.toast(t('chats.noProvider'), 'error');
      return;
    }
    if (!state.model) {
      App.ui.toast(t('chats.noModel'), 'error');
      return;
    }
    var parts = buildParts(state.attachments);
    var conv = selectedConv();
    if (conv) {
      sendUserMessage(conv.id, text, parts, null);
    } else {
      App.api
        .post('/api/chats/conversations', {
          providerKey: state.providerKey,
          model: state.model,
          promptId: state.promptId || '',
        })
        .then(function (res) {
          var cv = (res && res.conversation) || {};
          state.selectedId = cv.id;
          return reloadState().then(function () {
            sendUserMessage(cv.id, text, parts, null);
          });
        })
        .catch(function (e) {
          App.ui.toast((e && e.message) || 'create_failed', 'error');
        });
    }
  }
  function buildParts(attachments) {
    return attachments.map(function (a) {
      if (a.type === 'image') {
        return { type: 'image', dataUri: a.dataUri, url: a.url || '', name: a.name || '' };
      }
      return { type: 'file', name: a.name || '', url: a.url || '', content: a.content || '', text: a.text || '' };
    });
  }
  function sendUserMessage(convId, text, parts, anchorId) {
    var body = { role: 'user', content: text, parts: parts };
    App.api
      .post('/api/chats/conversations/' + encodeURIComponent(convId) + '/messages', body)
      .then(function () {
        state.inputText = '';
        state.attachments = [];
        return loadMessages(convId, true).then(function () {
          startStream(true, null);
        });
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'send_failed', 'error');
      });
  }

  function buildChatPayload() {
    var enabledMcp = [];
    if (state.mcpEnabled) {
      enabledMcp = mcps()
        .filter(function (m) {
          return m.enabled;
        })
        .map(function (m) {
          return m.id;
        });
    }
    return {
      conversationId: state.selectedId,
      providerKey: state.providerKey,
      model: state.model,
      promptId: state.promptId || '',
      params: state.params || {},
      thinking: { level: state.thinking || 0 },
      webSearch:
        state.webSearch && state.webSearch.enabled
          ? { enabled: true, provider: state.webSearch.provider || 'tavily', maxResults: state.webSearch.maxResults || 3 }
          : null,
      mcpIds: enabledMcp,
    };
  }

  function startStream(addOptimisticUser, anchorUserMsgId) {
    stopStreamSilent();
    if (!state.selectedId) return;
    var preStreamText = addOptimisticUser;

    state.streaming = true;
    state.abortCtrl = new AbortController();
    state.streamMsg = { content: '', thinking: '', tools: [], usage: null, error: '' };
    state.openThink = state.openThink || {};
    state.openThink['__stream__'] = true;
    state.lastFocus = 'composer';
    rerender();
    scrollMessagesBottom();
    focusComposer();

    var payload = buildChatPayload();
    App.sse.stream({
      url: '/api/chats/chat',
      body: payload,
      signal: state.abortCtrl.signal,
      onEvent: function (type, data) {
        handleStreamEvent(type, data);
      },
      onDone: function () {
        finishStream(false);
      },
      onError: function (err) {
        if (state.streamMsg) state.streamMsg.error = (err && err.message) || String(err);
        finishStream(false);
      },
    });
  }

  function handleStreamEvent(type, data) {
    if (!state.streamMsg) return;
    var sm = state.streamMsg;
    if (type === 'reasoning') {
      sm.thinking += (data && data.delta) || '';
      updateStreamThink();
    } else if (type === 'text') {
      sm.content += (data && data.delta) || '';
      updateStreamText();
    } else if (type === 'tool') {
      applyToolEvent(data);
      updateStreamTools();
    } else if (type === 'usage') {
      sm.usage = Object.assign({}, sm.usage, data || {});
      updateStreamUsage();
    } else if (type === 'error') {
      sm.error = (((data && data.message) || '').slice(0, 4000)) || 'error';
      App.ui.toast(sm.error, 'error');
      updateStreamError();
    }
  }
  function updateStreamText() {
    var md = regionEl() && regionEl().querySelector('[data-stream-md]');
    if (md) md.innerHTML = (state.streamMsg && state.streamMsg.content) ? App.md.render(state.streamMsg.content) : '<span class="cm-typing"><i></i><i></i><i></i></span>';
    maybeStickBottom();
  }
  function updateStreamThink() {
    var wrap = regionEl() && regionEl().querySelector('[data-think="__stream__"]');
    if (wrap) {
      var openEl = state.openThink['__stream__'] !== false;
      wrap.classList.toggle('is-open', openEl);
      var body = wrap.querySelector('[data-think-body]');
      if (body) body.innerHTML = '<p>' + esc((state.streamMsg && state.streamMsg.thinking) || '') + '</p>';
      var icEl = wrap.querySelector('.cm-thinking-ic');
      if (icEl) icEl.innerHTML = ic(openEl ? 'chevron-down' : 'chevron-right', 'size-3.5');
    } else {
      // 尚无 thinking 块(如 re-render 后),重建整页
      if (state.streamMsg && state.streamMsg.thinking && regionEl()) {
        rerender();
        scrollMessagesBottom();
        state.keepFocus = false;
      }
    }
  }
  function applyToolEvent(data) {
    if (!data) return;
    var sm = state.streamMsg;
    var idx = -1;
    for (var i = 0; i < sm.tools.length; i++) {
      if (sm.tools[i].id === data.id && sm.tools[i].name === data.name) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      sm.tools.push({
        id: data.id || 't-' + Date.now(),
        name: data.name || 'tool',
        arguments: data.arguments || {},
        state: data.state || 'running',
        result: data.result,
        error: data.error,
        server: data.server || '',
      });
    } else {
      var cur = sm.tools[idx];
      if (data.arguments !== undefined) cur.arguments = data.arguments;
      if (data.state) cur.state = data.state;
      if (data.result !== undefined) cur.result = data.result;
      if (data.error) cur.error = data.error;
    }
    maybeStickBottom();
  }
  function updateStreamTools() {
    var holder = regionEl() && regionEl().querySelector('[data-stream-tools]');
    if (!holder) {
      // 首次出现工具 → 重建流气泡骨架
      if (regionEl()) {
        rerender();
        scrollMessagesBottom();
        state.keepFocus = false;
      }
      return;
    }
    holder.innerHTML = renderToolList(state.streamMsg.tools, '__streamtools__', true);
    maybeStickBottom();
  }
  function updateStreamUsage() {
    var el = regionEl() && regionEl().querySelector('.cm-stream-status .cm-usage');
    var sm = state.streamMsg;
    if (el && sm && sm.usage && (sm.usage.input_tokens || sm.usage.output_tokens)) {
      el.textContent = (sm.usage.input_tokens || 0) + ' / ' + (sm.usage.output_tokens || 0) + ' tok';
    }
  }
  function updateStreamError() {
    rerender();
    state.keepFocus = false;
  }
  function maybeStickBottom() {
    var list = regionEl() && regionEl().querySelector('[data-ch-messages]');
    if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 80) {
      list.scrollTop = list.scrollHeight;
    }
  }
  function finishStream(aborted) {
    if (state.streaming === false && !state.streamMsg) return;
    state.streaming = false;
    state.abortCtrl = null;
    App.ui.toast(aborted ? t('chats.stopped') : t('chats.done'));
    reloadState()
      .then(function () {
        if (state.selectedId) {
          return loadMessages(state.selectedId, true).then(function () {
            state.streamMsg = null;
            rerender();
            scrollMessagesBottom();
            return null;
          });
        }
        state.streamMsg = null;
        return null;
      })
      .catch(function () {
        state.streamMsg = null;
        rerender();
      });
  }
  function stopStream() {
    if (state.abortCtrl) {
      try {
        state.abortCtrl.abort();
      } catch (e) {
        /* noop */
      }
      finishStream(true);
    }
  }
  function stopStreamSilent() {
    if (state.abortCtrl) {
      try {
        state.abortCtrl.abort();
      } catch (e) {
        /* noop */
      }
    }
    state.streaming = false;
    state.abortCtrl = null;
    state.streamMsg = null;
  }

  /* ---------- 供应商/模型 ---------- */
  function openProviderDialog() {
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + t('chats.addProvider') + '</h2>',
      body:
        '<div class="ch-dlg-grid">' +
        dlgField(t('chats.providerName'), '<input type="text" class="ui-input" data-ch-pv-name placeholder="' + escAttr(t('chats.providerNamePh')) + '" />') +
        dlgField(t('chats.providerKey2'), '<input type="text" class="ui-input" data-ch-pv-key placeholder="' + escAttr(t('chats.providerKeyPh')) + '" />') +
        dlgField(t('chats.providerBase'), '<input type="text" class="ui-input" data-ch-pv-base placeholder="' + escAttr(t('chats.providerBasePh')) + '" />') +
        dlgField(t('chats.providerType'),
          '<div class="ch-dlg-radios" data-ch-pv-type>' +
          radioBtn('openai', 'OpenAI 兼容', 'openai', true) +
          radioBtn('anthropic', 'Anthropic', 'anthropic', false) +
          radioBtn('gemini', 'Gemini', 'gemini', false) +
          '</div>') +
        dlgField(t('chats.providerKeyLabel'), '<input type="password" class="ui-input" data-ch-pv-apikey placeholder="' + escAttr(t('chats.providerKeyPh2')) + '" autocomplete="off" />') +
        '</div>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-pv-cancel>' +
        t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-pv-save>' +
        t('chats.save') +
        '</button>',
    });
  }
  function dlgField(label, control) {
    return (
      '<div class="ch-dlg-field"><label class="ui-dialog-label">' +
      label +
      '</label>' +
      control +
      '</div>'
    );
  }
  function radioBtn(val, label, group, checked) {
    return (
      '<button type="button" class="ch-dlg-radio' +
      (checked ? ' is-on' : '') +
      '" data-ch-pv-type-val="' +
      val +
      '">' +
      label +
      '</button>'
    );
  }
  var providerTypeSel = 'openai';
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var pv = el.closest('[data-ch-pv-type-val]');
    if (pv) {
      providerTypeSel = pv.getAttribute('data-ch-pv-type-val');
      document.querySelectorAll('[data-ch-pv-type-val]').forEach(function (b) {
        b.classList.toggle('is-on', b === pv);
      });
      return;
    }
    if (el.closest('[data-ch-pv-save]')) {
      var name = val('[data-ch-pv-name]', '');
      var key = val('[data-ch-pv-key]', '');
      var base = val('[data-ch-pv-base]', '');
      var apikey = val('[data-ch-pv-apikey]', '');
      if (!key || !base) {
        App.ui.toast(t('chats.providerRequired'), 'error');
        return;
      }
      App.ui.closeDialog();
      App.api
        .post('/api/chats/providers', {
          key: key,
          name: name || key,
          type: providerTypeSel,
          baseUrl: base,
          apiKey: apikey,
          models: [],
        })
        .then(function () {
          state.providerKey = key;
          state.model = '';
          return reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'provider_failed', 'error');
          reloadState();
        });
      return;
    }
    if (el.closest('[data-ch-pv-cancel]')) App.ui.closeDialog();
  });
  function val(sel, fb) {
    var x = document.querySelector(sel);
    return x ? x.value.trim() : fb;
  }

  function openModelManualDialog() {
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + t('chats.typeModel') + '</h2>',
      body:
        '<label class="ui-dialog-label">' +
        t('chats.model') +
        '</label>' +
        '<input type="text" class="ui-input" data-ch-manual-model value="' +
        escAttr(state.model || '') +
        '" autocomplete="off" />',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-manual-cancel>' +
        t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-manual-ok>' +
        t('chats.save') +
        '</button>',
    });
    var inp = document.querySelector('[data-ch-manual-model]');
    if (inp) inp.focus();
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    if (el.closest('[data-ch-manual-ok]')) {
      var v = val('[data-ch-manual-model]', '');
      if (v) {
        state.model = v;
        persistPrefs();
      }
      App.ui.closeDialog();
      rerender();
      return;
    }
    if (el.closest('[data-ch-manual-cancel]')) App.ui.closeDialog();
  });

  function fetchModels() {
    if (!state.providerKey) return;
    App.ui.toast(t('chats.fetchingModels'));
    App.api
      .post('/api/chats/models', { key: state.providerKey })
      .then(function (res) {
        var list = (res && res.models) || [];
        var p = providerByKey(state.providerKey);
        if (p) p.models = list;
        if (list.length) {
          if (!list.some(function (m) {
            return m === state.model;
          })) state.model = list[0];
        }
        App.ui.toast(tF('chats.fetchedModels', { n: list.length }));
        reloadState();
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || t('chats.fetchFailed'), 'error');
      });
  }

  /* ---------- 提示词 ---------- */
  function openPromptDialog(id) {
    var pr = id ? promptById(id) : null;
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + (pr ? t('chats.promptEdit') : t('chats.promptNew')) + '</h2>',
      body:
        '<div class="ch-dlg-grid">' +
        dlgField(t('chats.promptName'), '<input type="text" class="ui-input" data-ch-pr-name value="' + escAttr((pr && pr.name) || '') + '" maxlength="40" />') +
        dlgField(t('chats.promptCat'), '<input type="text" class="ui-input" data-ch-pr-cat value="' + escAttr((pr && pr.category) || '') + '" maxlength="20" />') +
        '</div>' +
        dlgField(
          t('chats.promptContent'),
          '<textarea class="ui-input ch-dlg-textarea" data-ch-pr-content rows="6" placeholder="' +
            escAttr(t('chats.promptContentPh')) +
            '">' +
            esc((pr && pr.content) || '') +
            '</textarea>'
        ),
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-pr-cancel>' +
        t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-pr-save>' +
        t('chats.save') +
        '</button>',
    });
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    if (el.closest('[data-ch-pr-save]')) {
      var name = val('[data-ch-pr-name]', '');
      var content = val('[data-ch-pr-content]', '');
      var cat = val('[data-ch-pr-cat]', '');
      if (!name || !content) {
        App.ui.toast(t('chats.promptRequired'), 'error');
        return;
      }
      App.ui.closeDialog();
      if (state._promptEditId) {
        App.api
          .put('/api/chats/prompts/' + encodeURIComponent(state._promptEditId), { name: name, content: content, category: cat })
          .then(function () {
            return reloadState();
          })
          .catch(function (err) {
            App.ui.toast((err && err.message) || 'prompt_failed', 'error');
          });
      } else {
        App.api
          .post('/api/chats/prompts', { name: name, content: content, category: cat })
          .then(function (res) {
            state.promptId = (res && res.prompt && res.prompt.id) || state.promptId;
            return reloadState();
          })
          .catch(function (err) {
            App.ui.toast((err && err.message) || 'prompt_failed', 'error');
          });
      }
      state._promptEditId = null;
      return;
    }
    if (el.closest('[data-ch-pr-cancel]')) {
      App.ui.closeDialog();
      state._promptEditId = null;
    }
  });
  function deletePrompt(id) {
    var pr = promptById(id);
    if (!pr) return;
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + t('chats.promptDelete') + '</h2>',
      body:
        '<p class="ui-dialog-desc">' +
        tF('chats.deletePromptMsg', { name: esc(pr.name) }) +
        '</p>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-prdl-cancel>' +
        t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('destructive', 'sm') +
        '" data-ch-prdl-ok>' +
        t('chats.delete') +
        '</button>',
    });
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    if (el.closest('[data-ch-prdl-ok]')) {
      var id = state.promptId;
      App.ui.closeDialog();
      if (!id) return;
      var pid = id;
      App.api
        .del('/api/chats/prompts/' + encodeURIComponent(pid))
        .then(function () {
          if (state.promptId === pid) state.promptId = '';
          reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'prompt_del_failed', 'error');
        });
      return;
    }
    if (el.closest('[data-ch-prdl-cancel]')) App.ui.closeDialog();
  });
  // 提示词编辑需记录当前编辑 id(打开时)
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var pEdit = el.closest('[data-ch-prompt-edit]');
    if (pEdit) state._promptEditId = pEdit.getAttribute('data-ch-prompt-edit');
  });

  /* ---------- MCP ---------- */
  function openMcpDialog(id) {
    var m = id ? (function () {
      var list = mcps();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    })() : null;
    state._mcpEditId = id || null;
    state._mcpTestTools = (m && m.tools) || [];
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + (m ? t('chats.mcpEdit') : t('chats.mcpAdd')) + '</h2>',
      body:
        '<div class="ch-dlg-grid">' +
        dlgField(t('chats.mcpName'), '<input type="text" class="ui-input" data-ch-mcp-f-name value="' + escAttr((m && m.name) || '') + '" maxlength="60" />') +
        dlgField(
          t('chats.mcpProtocol'),
          '<div class="ch-dlg-radios" data-ch-mcp-f-protocol>' +
          '<button type="button" class="ch-dlg-radio' +
          (!m || m.protocol !== 'sse' ? ' is-on' : '') +
          '" data-ch-mcp-protocol="http">' +
          t('chats.mcpProtocolHttp') +
          '</button>' +
          '<button type="button" class="ch-dlg-radio' +
          (m && m.protocol === 'sse' ? ' is-on' : '') +
          '" data-ch-mcp-protocol="sse">' +
          t('chats.mcpProtocolSse') +
          '</button>' +
          '</div>'
        ) +
        dlgField(t('chats.mcpUrl'), '<input type="text" class="ui-input" data-ch-mcp-f-url value="' + escAttr((m && m.url) || '') + '" placeholder="https://…" />') +
        '</div>' +
        '<div class="ch-mcp-dlg-tools" data-ch-mcp-f-tools>' +
        '<div class="ch-mcp-dlg-head">' +
        '<span>' +
        t('chats.mcpTools') +
        '</span>' +
        '<button type="button" class="ch-link-btn" data-ch-mcp-f-test>' +
        ic('refresh-cw', 'size-3') +
        t('chats.mcpTest') +
        '</button>' +
        '</div>' +
        '<div class="ch-mcp-dlg-tool-list" data-ch-mcp-f-tool-list>' +
        (state._mcpTestTools && state._mcpTestTools.length
          ? state._mcpTestTools
              .map(function (t2) {
                return '<div class="ch-mcp-dlg-tool"><span class="ch-mcp-dlg-tool-ic">' + ic('wrench', 'size-3.5') + '</span><span class="ch-mcp-dlg-tool-name">' + esc(t2.name || '') + '</span></div>';
              })
              .join('')
          : '<div class="ch-mcp-dlg-empty">' + esc(t('chats.mcpNotest')) + '</div>') +
        '</div>' +
        '</div>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-mcp-f-cancel>' +
        t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-mcp-f-save>' +
        t('chats.save') +
        '</button>',
    });
  }
  var mcpProtocolSel = 'http';
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var proto = el.closest('[data-ch-mcp-protocol]');
    if (proto) {
      mcpProtocolSel = proto.getAttribute('data-ch-mcp-protocol');
      document.querySelectorAll('[data-ch-mcp-protocol]').forEach(function (b) {
        b.classList.toggle('is-on', b === proto);
      });
      return;
    }
    if (el.closest('[data-ch-mcp-f-test]')) {
      var name = val('[data-ch-mcp-f-name]', '') || t('chats.mcpTest');
      var url = val('[data-ch-mcp-f-url]', '');
      if (!url) {
        App.ui.toast(t('chats.mcpUrlRequired'), 'error');
        return;
      }
      App.api
        .post('/api/chats/mcp/test', { name: name, protocol: mcpProtocolSel, url: url })
        .then(function (res) {
          state._mcpTestTools = (res && res.tools) || [];
          var list = document.querySelector('[data-ch-mcp-f-tool-list]');
          if (list) {
            list.innerHTML = state._mcpTestTools.length
              ? state._mcpTestTools
                  .map(function (t2) {
                    return '<div class="ch-mcp-dlg-tool"><span class="ch-mcp-dlg-tool-ic">' + ic('wrench', 'size-3.5') + '</span><span class="ch-mcp-dlg-tool-name">' + esc(t2.name || '') + '</span></div>';
                  })
                  .join('')
              : '<div class="ch-mcp-dlg-empty">' + esc(t('chats.mcpNotools')) + '</div>';
          }
          App.ui.toast(tF('chats.mcpTestedTools', { n: state._mcpTestTools.length }));
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || t('chats.mcpTestFailed'), 'error');
        });
      return;
    }
    if (el.closest('[data-ch-mcp-f-save]')) {
      var mname = val('[data-ch-mcp-f-name]', '');
      var murl = val('[data-ch-mcp-f-url]', '');
      if (!mname || !murl) {
        App.ui.toast(t('chats.mcpRequired'), 'error');
        return;
      }
      var tools = state._mcpTestTools || [];
      if (!Array.isArray(tools)) tools = [];
      tools = tools.map(function (t2) {
        return Object.assign({}, t2, { enabled: t2.enabled !== false });
      });
      var body = { name: mname, protocol: mcpProtocolSel, url: murl, tools: tools };
      if (state._mcpEditId) body.id = state._mcpEditId;
      App.ui.closeDialog();
      App.api
        .post('/api/chats/mcp', body)
        .then(function () {
          return reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'mcp_failed', 'error');
        });
      state._mcpEditId = null;
      return;
    }
    if (el.closest('[data-ch-mcp-f-cancel]')) {
      App.ui.closeDialog();
      state._mcpEditId = null;
    }
  });
  function toggleMcp(id) {
    var m = null;
    mcps().forEach(function (x) {
      if (x.id === id) m = x;
    });
    if (!m) return;
    m.enabled = !m.enabled;
    if (!m.enabled) {
      // 父级关闭 → 关闭其下所有工具(无法单独开启)
      if (Array.isArray(m.tools)) {
        m.tools.forEach(function (t2) {
          t2.enabled = false;
        });
      }
    }
    saveMcpState(m);
  }
  function toggleMcpTool(mcpId, idx) {
    var m = null;
    mcps().forEach(function (x) {
      if (x.id === mcpId) m = x;
    });
    if (!m || !m.enabled) return; // 父级关闭时不可单独开启
    if (!Array.isArray(m.tools) || !m.tools[idx]) return;
    m.tools[idx].enabled = m.tools[idx].enabled !== false;
    saveMcpState(m);
  }
  function saveMcpState(m) {
    App.api
      .post('/api/chats/mcp', {
        id: m.id,
        name: m.name,
        protocol: m.protocol,
        url: m.url,
        enabled: m.enabled,
        tools: m.tools || [],
      })
      .then(function () {
        return reloadState();
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'mcp_failed', 'error');
        reloadState();
      });
  }
  function deleteMcp(id) {
    var m = null;
    mcps().forEach(function (x) {
      if (x.id === id) m = x;
    });
    if (!m) return;
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + t('chats.mcpDelete') + '</h2>',
      body:
        '<p class="ui-dialog-desc">' +
        tF('chats.mcpDeleteMsg', { name: esc(m.name) }) +
        '</p>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-mcpdl-cancel>' +
        t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('destructive', 'sm') +
        '" data-ch-mcpdl-ok>' +
        t('chats.delete') +
        '</button>',
    });
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    if (el.closest('[data-ch-mcpdl-ok]')) {
      var id = state._mcpDelId;
      App.ui.closeDialog();
      if (!id) return;
      App.api
        .del('/api/chats/mcp?key=' + encodeURIComponent(id))
        .then(function () {
          star: 0;
          reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'mcp_del_failed', 'error');
        });
      return;
    }
    if (el.closest('[data-ch-mcpdl-cancel]')) App.ui.closeDialog();
  });
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var mDel = el.closest('[data-ch-mcp-del]');
    if (mDel) state._mcpDelId = mDel.getAttribute('data-ch-mcp-del');
  });

  function closeMobileLeft() {
    if (window.innerWidth < 768) {
      state.leftOpen = false;
    }
  }

  /* ---------- 工具折叠(流式原位展开) ---------- */
  function toolExpand(row, key) {
    row.classList.add('is-open');
    var t = null;
    var arr = (state.streamMsg && state.streamMsg.tools) || [];
    for (var i = 0; i < arr.length; i++) {
      if (key === '__streamtools__-' + (arr[i].id || i) || key === '__streamtools__') {
        t = arr[i];
        break;
      }
    }
    if (!t && arr.length) t = arr[0];
    if (t) {
      var argsStr = '';
      try {
        argsStr = typeof t.arguments === 'string' ? t.arguments : JSON.stringify(t.arguments || {}, null, 2);
      } catch (e) {
        argsStr = '';
      }
      var resultStr = '';
      if (t.result !== undefined && t.result !== null) {
        resultStr = (t.result && t.result.error) ? '[err] ' + t.result.error : (typeof t.result === 'string' ? t.result : (function () {
          try {
            return JSON.stringify(t.result, null, 2);
          } catch (e2) {
            return String(t.result);
          }
        })());
      }
      var nameCol = row.querySelector('[data-tool-name]');
      if (nameCol) nameCol.parentNode.setAttribute('data-stream-tool', '1');
      var detail = document.createElement('div');
      detail.className = 'cm-tool-detail';
      detail.innerHTML =
        '<div class="cm-tool-sec"><span class="cm-tool-sec-label">' +
        esc(t('chats.toolArgs')) +
        '</span><pre>' +
        esc(argsStr) +
        '</pre></div>' +
        (resultStr !== ''
          ? '<div class="cm-tool-sec"><span class="cm-tool-sec-label">' +
            esc(t('chats.toolResult')) +
            '</span><pre>' +
            esc(resultStr.slice(0, 6000)) +
            '</pre></div>'
          : '');
      row.appendChild(detail);
    }
  }

  /* ---------- 模块入口 ---------- */
  function render(path, ctx) {
    state.t = ctx.t;
    state.locale = ctx.settings.locale;
    if (!state.boot) {
      bootLoad();
      return (
        '<div class="ch-page ch-boot" data-ch-region>' +
        '<div class="ch-boot-inner">' +
        ic('loader-2', 'size-5 ch-spin') +
        '<span>' +
        (ctx.t && ctx.t('chats.loading') ? ctx.t('chats.loading') : 'Loading…') +
        '</span>' +
        '</div></div>'
      );
    }
    return renderPage();
  }

  App.defineModule({ id: 'chats', render: render });
})();
