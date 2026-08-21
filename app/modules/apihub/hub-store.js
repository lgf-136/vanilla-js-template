/* hub-store.js — 模块状态、数据加载/持久化与纯派生工具（C5 拆分） */

'use strict';

import { renderFull } from './hub-view.js';
  /* ---------- 状态 ---------- */
  var state = {
    routes: [],
    config: null,
    secrets: { apiKeys: {} },
    loaded: false,
    error: null,
  };
  var view = {
    search: '',
    groupFilter: null,
    tagFilter: null,
    favOnly: false,
    pubOnly: false,
    pinOnly: false,
    customOnly: false,
    moduleFilter: '',
    selected: null,
    runTab: 'params',
    resView: 'pretty',
    req: { method: 'GET', path: '', params: [{ k: '', v: '' }], headers: [{ k: '', v: '' }], body: '' },
    running: false,
    run: null,
    history: [],
    lastHashSel: null,
  };
  var saveTimer = null;
  /** 深链选择器由 index.js 装配期注入（依赖 builder 域的 selectRoute，避免 store→builder 环） */
  var hashSelector = null;
  function setHashSelector(fn) {
    hashSelector = fn;
  }
  var historyTimer = null;
  /* ---------- 工具 ---------- */
  function icon(name, cls) {
    return App.icon.iconSvg(name, { class: cls || 'size-4' });
  }
  /** 书签(添加标签)图标 — lucide 数据未内置 bookmark,内联 SVG 保持风格一致 */
  function bookmarkIcon(cls) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
      (cls || '') +
      '"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>' +
      '<line x1="12" y1="7" x2="12" y2="13"></line>' +
      '<line x1="15" y1="10" x2="9" y2="10"></line></svg>'
    );
  }
  /** 内联 SVG(补充 lucide 数据未内置的图标:shield / key 等) */
  function inlineSvg(inner, cls) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
      (cls || '') +
      '">' +
      inner +
      '</svg>'
    );
  }
  /** 鉴权令牌元数据:每种令牌独立图标 + 颜色(路由行图标化展示,悬停提示) */
  var AUTH_META = {
    none: { icon: 'globe', color: 'var(--nova-success)' },
    session: { icon: 'key-round', color: 'var(--nova-primary-blue)' },
    bearer: { icon: 'shield', color: 'var(--nova-purple)' },
    'global-password': { icon: 'lock', color: 'var(--nova-warning)' },
    'api-key': { icon: 'key', color: 'var(--nova-cyan)' },
  };
  /** 鉴权令牌图标(lucide 有则用,无则内联) */
  function authTokenIcon(mode) {
    var m = AUTH_META[mode] || AUTH_META.session;
    if (m.icon === 'shield') {
      return inlineSvg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>', '');
    }
    if (m.icon === 'key') {
      return inlineSvg('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>', '');
    }
    return icon(m.icon, '');
  }
  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;
  var escAttr = App.escape.escAttr;
  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function routeKeyOf(r) {
    return r.builtIn ? r.method + ' ' + r.path : 'cr:' + r.id;
  }
  function findRoute(key) {
    for (var i = 0; i < state.routes.length; i++) {
      if (routeKeyOf(state.routes[i]) === key) return state.routes[i];
    }
    return null;
  }
  function overrideOf(key) {
    if (!state.config.routes[key]) state.config.routes[key] = {};
    return state.config.routes[key];
  }
  function customById(id) {
    var list = state.config.customRoutes || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function memberships(key, r) {
    if (r && !r.builtIn) {
      var c = customById(r.id);
      return {
        groupIds: (c && c.groupIds) || [],
        tagIds: (c && c.tagIds) || [],
        favorite: !!(c && c.favorite),
        pinned: !!(c && c.pinned),
        auth: (c && c.auth) || '',
        name: (c && c.name) || '',
        desc: (c && c.desc) || '',
        public: !!(c && c.public),
      };
    }
    var ov = state.config.routes[key] || {};
    return {
      groupIds: ov.groupIds || [],
      tagIds: ov.tagIds || [],
      favorite: !!ov.favorite,
      pinned: !!ov.pinned,
      auth: ov.auth || '',
      name: ov.name || '',
      desc: ov.desc || '',
      public: !!ov.public,
    };
  }
  function groupById(id) {
    var g = state.config.groups || [];
    for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
    return null;
  }
  function tagById(id) {
    var t = state.config.tags || [];
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return null;
  }
  /** 分组(含祖先)是否公开:任一祖先公开则该组公开(与 server/hub 一致) */
  function groupPublic(id) {
    var seen = {};
    var cur = groupById(id);
    while (cur && !seen[cur.id]) {
      seen[cur.id] = true;
      if (cur.public) return true;
      cur = cur.parentId ? groupById(cur.parentId) : null;
    }
    return false;
  }
  /** 路由是否公开:内置强制公开(登录) / 自身开关 / 所在分组(含祖先)公开 */
  function isPublic(key, r) {
    if (r && r.builtIn && r.public) return true;
    var m = memberships(key, r);
    if (m.public) return true;
    if (m.groupIds.some(function (gid) { return groupPublic(gid); })) return true;
    return false;
  }
  /** 路由生效鉴权方式:公开 → none;否则 自身设置 或 默认 */
  function authMode(key, r) {
    if (isPublic(key, r)) return 'none';
    var m = memberships(key, r);
    if (m.auth) return m.auth;
    return (state.config.defaults && state.config.defaults.auth) || 'session';
  }
  function authLabel(mode) {
    return t('apihub.authMode.' + mode);
  }
  function hasBody(method) {
    return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  }
  function descendants(nodes, id) {
    var out = [id];
    var changed = true;
    while (changed) {
      changed = false;
      nodes.forEach(function (n) {
        if (out.indexOf(n.id) === -1 && out.indexOf(n.parentId) !== -1) {
          out.push(n.id);
          changed = true;
        }
      });
    }
    return out;
  }
  function treeChildren(nodes, parentId) {
    return nodes
      .filter(function (n) {
        return (n.parentId || '') === (parentId || '');
      })
      .sort(function (a, b) {
        return (a.sort || 0) - (b.sort || 0) || (a.name || '').localeCompare(b.name || '');
      });
  }
  function rowsToObj(rows) {
    var out = {};
    (rows || []).forEach(function (row) {
      var k = String(row.k || '').trim();
      if (k) out[k] = String(row.v == null ? '' : row.v);
    });
    return out;
  }
  function moduleT() {
    var locale = App.getShellContext ? App.getShellContext().settings.locale : 'zh-CN';
    return App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.apihub);
  }
  var t = function (k) {
    return moduleT()(k);
  };
  function tpl(k, sub) {
    var s = t(k);
    Object.keys(sub || {}).forEach(function (key) {
      s = s.split('{' + key + '}').join(sub[key]);
    });
    return s;
  }
  /* ---------- 数据加载 ---------- */
  function load() {
    App.api
      .get('/api/hub/state')
      .then(function (data) {
        state.routes = data.routes || [];
        state.config = data.config || null;
        state.secrets = data.secrets || { apiKeys: {} };
        view.history = (data.history || []).slice(0, 20);
        if (!state.config) {
          state.config = {
            version: 1,
            defaults: { auth: 'session' },
            groups: [],
            tags: [],
            routes: {},
            customRoutes: [],
          };
        }
        if (!state.config.defaults) state.config.defaults = { auth: 'session' };
        if (!state.config.routes) state.config.routes = {};
        if (!state.config.customRoutes) state.config.customRoutes = [];
        if (!state.secrets.apiKeys) state.secrets.apiKeys = {};
        state.loaded = true;
        state.error = null;
        if (hashSelector) hashSelector();
        renderFull();
      })
      .catch(function (e) {
        state.error = e && e.message ? e.message : 'failed';
        renderFull();
      });
  }
  /* ---------- 持久化(防抖) ---------- */
  function persist() {
    if (!state.loaded) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      App.api
        .put('/api/hub/config', { config: state.config, secrets: state.secrets })
        .then(function () {
          App.ui.toast(t('apihub.saved'));
        })
        .catch(function (e) {
          App.ui.toast((e && e.data && e.data.message) || t('apihub.saveFailed'), 'error');
        });
    }, 300);
  }
  /* ---------- 请求历史持久化(防抖,沿用配置保存的失败提示) ---------- */
  function persistHistory() {
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(function () {
      historyTimer = null;
      if (!App.api) return;
      App.api
        .put('/api/hub/history', { history: (view.history || []).slice(0, 20) })
        .then(function () {})
        .catch(function (e) {
          if (e && e.status !== 401) App.logger.warn('apihub', '请求历史落库失败', e);
        });
    }, 300);
  }
  /** 路由所属模块:/api/<模块>/... 取 api 后第一段,其余取路径第一段 */
  function moduleOf(r) {
    var segs = String(r.path || '/').split('/').filter(Boolean);
    if (!segs.length) return '';
    if (segs[0].toLowerCase() === 'api') return (segs[1] || '').toLowerCase();
    return segs[0].toLowerCase();
  }
  /** 分组/标签节点(含子孙)内的路由数量 */
  function treeCount(kind, id) {
    var nodes = kind === 'group' ? state.config.groups || [] : state.config.tags || [];
    var ids = descendants(nodes, id);
    var n = 0;
    (state.routes || []).forEach(function (r) {
      var key = routeKeyOf(r);
      var m = memberships(key, r);
      var list = kind === 'group' ? m.groupIds : m.tagIds;
      if ((list || []).some(function (x) { return ids.indexOf(x) !== -1; })) n++;
    });
    return n;
  }

export { setHashSelector, AUTH_META, authLabel, authMode, authTokenIcon, bookmarkIcon, customById, descendants, esc, escAttr, findRoute, groupById, groupPublic, hasBody, historyTimer, icon, inlineSvg, isPublic, load, memberships, moduleOf, moduleT, overrideOf, persist, persistHistory, routeKeyOf, rowsToObj, saveTimer, state, t, tagById, tpl, treeChildren, treeCount, uid, view };
