/* ============================================================
 * apihub 模块 — 实现(懒加载,首次访问 /apihub 时下载)
 * ------------------------------------------------------------
 * API Hub 管理台,三栏工作区:
 *   左栏  分组(多级)/ 标签(扁平彩色 # 标签)
 *   中栏  全部 API 路由(自动发现):搜索 / 收藏 / 置顶 /
 *         公开开关 / 分组 / 标签 / 自定义路由 / 复制分享链接
 *   右栏  请求构建器 + 响应查看(状态/耗时/大小/JSON 美化/
 *         语法高亮/复制/最近运行历史)
 * 默认鉴权设置位于顶栏右侧(刷新按钮之前)。
 * 服务端配合 server/modules/apihub/service.js:公开开关与鉴权方式真正生效于
 * 每次 API 请求的门禁,而不只是前端展示。
 * 只依赖核心层 App.ui / App.icon / App.i18n / App.api / ctx。
 * ============================================================ */
(function () {
  'use strict';

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
  var historyTimer = null;
  var dialogMethod = 'GET';

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
        applyHashSelection();
        renderFull();
      })
      .catch(function (e) {
        state.error = e && e.message ? e.message : 'failed';
        renderFull();
      });
  }

  /** 深链:打开 #/apihub?r=<key> 时自动选中对应路由 */
  function applyHashSelection() {
    var h = window.location.hash || '';
    var m = /[?&]r=([^&]+)/.exec(h);
    if (!m) {
      view.lastHashSel = null;
      return;
    }
    var key = decodeURIComponent(m[1]);
    if (key === view.lastHashSel) return;
    view.lastHashSel = key;
    var r = findRoute(key);
    if (r) selectRoute(key, r, true);
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

  /* ---------- 配置变更操作 ---------- */
  function patchRoute(key, patch) {
    overrideOf(key);
    Object.keys(patch).forEach(function (k) {
      state.config.routes[key][k] = patch[k];
    });
    persist();
  }
  function patchCustom(id, patch) {
    var c = customById(id);
    if (!c) return;
    Object.keys(patch).forEach(function (k) {
      c[k] = patch[k];
    });
    persist();
  }
  function toggleRoutePublic(key) {
    var r = findRoute(key);
    if (r && r.builtIn && r.public) return; // 内置强制公开路由(登录)不可关闭
    var next = !memberships(key, r).public;
    if (r && !r.builtIn) patchCustom(r.id, { public: next });
    else patchRoute(key, { public: next });
    renderFull();
  }
  function toggleFav(key) {
    var r = findRoute(key);
    if (r && !r.builtIn) patchCustom(r.id, { favorite: !customById(r.id).favorite });
    else patchRoute(key, { favorite: !memberships(key, r).favorite });
    renderFull();
  }
  function togglePin(key) {
    var r = findRoute(key);
    if (r && !r.builtIn) patchCustom(r.id, { pinned: !customById(r.id).pinned });
    else patchRoute(key, { pinned: !memberships(key, r).pinned });
    renderFull();
  }
  function toggleRouteGroup(key, gid) {
    var r = findRoute(key);
    var m = memberships(key, r);
    var next = m.groupIds.slice();
    var idx = next.indexOf(gid);
    if (idx === -1) next.push(gid);
    else next.splice(idx, 1);
    if (r && !r.builtIn) patchCustom(r.id, { groupIds: next });
    else patchRoute(key, { groupIds: next });
    closeDropdowns();
    renderFull();
  }
  function toggleRouteTag(key, tid) {
    var r = findRoute(key);
    var m = memberships(key, r);
    var next = m.tagIds.slice();
    var idx = next.indexOf(tid);
    if (idx === -1) next.push(tid);
    else next.splice(idx, 1);
    if (r && !r.builtIn) patchCustom(r.id, { tagIds: next });
    else patchRoute(key, { tagIds: next });
    closeDropdowns();
    renderFull();
  }

  function addGroup(name, parentId) {
    var g = state.config.groups;
    g.push({ id: uid('g'), name: name, parentId: parentId || '', public: false, sort: g.length });
    persist();
    renderFull();
  }
  function renameGroup(id, name) {
    var g = groupById(id);
    if (g) {
      g.name = name;
      persist();
      renderFull();
    }
  }
  function deleteGroup(id) {
    var g = state.config.groups;
    var removeIds = descendants(g, id);
    state.config.groups = g.filter(function (x) {
      return removeIds.indexOf(x.id) === -1;
    });
    [state.config.routes, state.config.customRoutes].forEach(function (coll) {
      if (!coll) return;
      if (Array.isArray(coll)) {
        coll.forEach(function (c) {
          c.groupIds = (c.groupIds || []).filter(function (gid) {
            return removeIds.indexOf(gid) === -1;
          });
        });
      } else {
        Object.keys(coll).forEach(function (key) {
          coll[key].groupIds = (coll[key].groupIds || []).filter(function (gid) {
            return removeIds.indexOf(gid) === -1;
          });
        });
      }
    });
    if (view.groupFilter && removeIds.indexOf(view.groupFilter) !== -1) view.groupFilter = null;
    persist();
    renderFull();
  }
  function toggleGroupPublic(id) {
    var g = groupById(id);
    if (!g) return;
    var on = !g.public;
    g.public = on;
    if (on) {
      // 父级公开 → 全部子孙组强制公开(与 server 端级联一致)
      descendants(state.config.groups, id).forEach(function (did) {
        var d = groupById(did);
        if (d) d.public = true;
      });
    }
    persist();
    renderFull();
  }
  /** 拖拽/移动到目标分组(zone: before/after/inside;targetId 空 → 根) */
  function moveGroup(id, targetId, zone) {
    var list = state.config.groups || [];
    var g = groupById(id);
    if (!g) return;
    var t = targetId ? groupById(targetId) : null;
    if (t && descendants(list, id).indexOf(t.id) !== -1) {
      App.ui.toast(t('apihub.noDrop'), 'error');
      return;
    }
    var next = App.ui.groupTree.moveNode(list, id, targetId, zone);
    if (!next) return; // 无效目标
    state.config.groups = next;
    persist();
    renderFull();
  }
  function setGroupIcon(id, icon) {
    var g = groupById(id);
    if (!g) return;
    g.icon = icon || '';
    persist();
    renderFull();
  }
  function setGroupColor(id, color) {
    var g = groupById(id);
    if (!g) return;
    g.color = color || '';
    persist();
    renderFull();
  }

  /** 标签:扁平彩色标签(id/name/color),新增/重命名/改色/删除 */
  /** 重绘打开的标签 Popover(创建/重命名/删除/改色后保持勾选与列表最新) */
  function refreshTagPopover() {
    var pop = document.querySelector('[data-hub-tagpop]');
    if (!pop) return;
    var key = pop.getAttribute('data-hub-tagpop');
    var r = findRoute(key);
    if (!r) return;
    ensureTagTree().setPickerSearch('');
    pop.innerHTML = ensureTagTree().pickerHtml(memberships(key, r).tagIds || []);
  }
  function addTag(name, color) {
    var tags = state.config.tags;
    tags.push({ id: uid('t'), name: name, color: color || '', sort: tags.length });
    persist();
    renderFull();
    refreshTagPopover();
  }
  function renameTag(id, name, color) {
    var tg = tagById(id);
    if (tg) {
      tg.name = name;
      if (arguments.length > 2) tg.color = color || '';
      persist();
      renderFull();
      refreshTagPopover();
    }
  }
  function deleteTag(id) {
    var tags = state.config.tags;
    state.config.tags = tags.filter(function (x) {
      return x.id !== id;
    });
    [state.config.routes, state.config.customRoutes].forEach(function (coll) {
      if (!coll) return;
      if (Array.isArray(coll)) {
        coll.forEach(function (c) {
          c.tagIds = (c.tagIds || []).filter(function (tid) {
            return tid !== id;
          });
        });
      } else {
        Object.keys(coll).forEach(function (key) {
          coll[key].tagIds = (coll[key].tagIds || []).filter(function (tid) {
            return tid !== id;
          });
        });
      }
    });
    if (view.tagFilter === id) view.tagFilter = null;
    persist();
    renderFull();
    refreshTagPopover();
  }
  function setTagColor(id, color) {
    var tg = tagById(id);
    if (tg) {
      tg.color = color || '';
      persist();
      renderFull();
      refreshTagPopover();
    }
  }

  function setRouteAuth(key, mode) {
    var r = findRoute(key);
    if (r && !r.builtIn) patchCustom(r.id, { auth: mode });
    else patchRoute(key, { auth: mode });
    persist();
  }
  function setRouteApiKey(key, value) {
    var r = findRoute(key);
    var secretKey = r && !r.builtIn ? 'cr:' + r.id : key;
    if (value) state.secrets.apiKeys[secretKey] = value;
    else delete state.secrets.apiKeys[secretKey];
    persist();
  }
  function apiKeyOf(key) {
    var r = findRoute(key);
    var secretKey = r && !r.builtIn ? 'cr:' + r.id : key;
    return state.secrets.apiKeys[secretKey] || state.secrets.defaultApiKey || '';
  }

  function setDefaultAuth(mode) {
    state.config.defaults = state.config.defaults || {};
    state.config.defaults.auth = mode;
    persist();
    renderFull();
  }
  function setDefaultApiKey(value) {
    if (value) state.secrets.defaultApiKey = value;
    else delete state.secrets.defaultApiKey;
    persist();
  }

  function addCustomRoute(data) {
    state.config.customRoutes.push({
      id: uid('cr'),
      method: data.method,
      path: data.path,
      name: data.name || '',
      desc: data.desc || '',
      responseType: data.responseType || 'echo',
      staticStatus: data.staticStatus || 200,
      staticBody: data.staticBody,
      auth: '',
      public: false,
      favorite: false,
      pinned: false,
      groupIds: [],
      tagIds: [],
    });
    persist();
    renderFull();
  }
  function updateCustomRoute(id, data) {
    var c = customById(id);
    if (!c) return;
    c.method = data.method;
    c.path = data.path;
    c.name = data.name || '';
    c.desc = data.desc || '';
    c.responseType = data.responseType || 'echo';
    c.staticStatus = data.staticStatus || 200;
    c.staticBody = data.staticBody;
    persist();
    renderFull();
  }
  function deleteCustomRoute(id) {
    state.config.customRoutes = state.config.customRoutes.filter(function (c) {
      return c.id !== id;
    });
    if (view.selected === 'cr:' + id) {
      view.selected = null;
      view.run = null;
    }
    persist();
    renderFull();
  }

  /* ---------- 路由选择 + 运行 ---------- */
  function selectRoute(key, r, silent) {
    r = r || findRoute(key);
    if (!r) return;
    view.selected = key;
    view.req = {
      method: r.method,
      path: r.path,
      params: [{ k: '', v: '' }],
      headers: [{ k: '', v: '' }],
      body: '',
    };
    // 按生效鉴权方式预填认证头(公开/全局密码需要用户自行补充)
    var mode = authMode(key, r);
    var token = App.auth && App.auth.token ? App.auth.token() : null;
    if (mode === 'session' && token) {
      view.req.headers = [{ k: 'x-auth-token', v: token }, { k: '', v: '' }];
    } else if (mode === 'bearer' && token) {
      view.req.headers = [{ k: 'Authorization', v: 'Bearer ' + token }, { k: '', v: '' }];
    } else if (mode === 'global-password') {
      view.req.headers = [{ k: 'x-auth-password', v: '' }, { k: '', v: '' }];
    } else if (mode === 'api-key') {
      view.req.headers = [{ k: 'x-api-key', v: apiKeyOf(key) }, { k: '', v: '' }];
    }
    if (!silent) renderFull();
  }

  function buildUrl() {
    var qs = rowsToObj(view.req.params);
    var keys = Object.keys(qs);
    if (!keys.length) return view.req.path;
    var parts = keys.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]);
    });
    return view.req.path + (view.req.path.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
  }

  function runRequest() {
    var req = view.req;
    if (!req.path || req.path.charAt(0) !== '/') {
      App.ui.toast(t('apihub.pathRequired'), 'error');
      return;
    }
    var headers = rowsToObj(req.headers);
    var url = buildUrl();
    var started = performance.now();
    view.running = true;
    renderFull();

    var opts = { method: req.method, headers: headers, cache: 'no-store' };
    if (hasBody(req.method) && req.body) {
      if (!headers['content-type'] && !headers['Content-Type']) {
        opts.headers['Content-Type'] = 'application/json';
      }
      opts.body = req.body;
    }

    fetch(url, opts)
      .then(function (res) {
        return res.text().then(function (text) {
          var timeMs = Math.round(performance.now() - started);
          var size = 0;
          try {
            size = new Blob([text]).size;
          } catch (e) {
            size = text.length;
          }
          var hdrs = [];
          if (res.headers && typeof res.headers.forEach === 'function') {
            res.headers.forEach(function (v, k) {
              hdrs.push([k, v]);
            });
          }
          view.run = {
            status: res.status,
            statusText: res.statusText || '',
            timeMs: timeMs,
            size: size,
            headers: hdrs,
            text: text,
          };
          view.history.unshift({ method: req.method, path: url, status: res.status, ts: Date.now() });
          view.history = view.history.slice(0, 20);
          persistHistory();
        });
      })
      .catch(function (e) {
        view.run = {
          status: 0,
          statusText: 'Error',
          timeMs: Math.round(performance.now() - started),
          size: 0,
          headers: [],
          text: String((e && e.message) || e),
        };
      })
      .then(function () {
        view.running = false;
        renderFull();
      });
  }

  function rerunHistory(item) {
    var m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/.*)$/.exec(item.path);
    view.req.method = (m && m[1]) || 'GET';
    var path = (m && m[2]) || item.path;
    var qIdx = path.indexOf('?');
    if (qIdx !== -1) {
      view.req.path = path.slice(0, qIdx);
      var qs = path.slice(qIdx + 1).split('&');
      view.req.params = qs.map(function (pair) {
        var kv = pair.split('=');
        return { k: decodeURIComponent(kv[0] || ''), v: decodeURIComponent(kv[1] || '') };
      });
    } else {
      view.req.path = path;
      view.req.params = [{ k: '', v: '' }];
    }
    runRequest();
  }

  /* ---------- 弹窗(公共 App.ui.dialog;禁用 window.prompt/confirm) ---------- */
  function openDialog(opts) {
    return App.ui.dialog({
      head:
        '<div class="ui-dialog-title">' +
        opts.title +
        '</div>' +
        (opts.desc ? '<div class="ui-dialog-desc">' + opts.desc + '</div>' : ''),
      body: opts.body,
      foot: opts.foot,
      closeLabel: t('apihub.cancel'),
    });
  }

  function closeDialog() {
    App.ui.closeDialog();
  }

  function confirmDialog(title, msg, okLabel, onOk, danger) {
    var overlay = openDialog({
      title: title,
      desc: msg,
      body: '',
      foot:
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('outline') + '" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" data-slot="button" class="' +
        App.ui.buttonClass(danger ? 'destructive' : 'default') +
        '" data-hub-dlg-ok>' +
        (okLabel || t('apihub.confirm')) +
        '</button>',
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      closeDialog();
      onOk();
    });
  }

  /** 鉴权设置弹窗(默认 / 单路由共用) */
  function authDialog(key) {
    var isDefault = key === '__default__';
    var r = isDefault ? null : findRoute(key);
    var cur = isDefault
      ? (state.config.defaults && state.config.defaults.auth) || 'session'
      : memberships(key, r).auth || (state.config.defaults && state.config.defaults.auth) || 'session';
    if (cur === 'none') cur = 'session'; // 公开是开关效果,弹窗展示底层鉴权方式
    var body =
      '<div class="hub-form">' +
      '<div class="hub-field"><label>' +
      t('apihub.auth') +
      '</label>' +
      '<div class="hub-auth-options">' +
      ['none', 'session', 'bearer', 'global-password', 'api-key']
        .map(function (m) {
          return (
            '<label class="hub-auth-opt' +
            (cur === m ? ' is-on' : '') +
            '" data-hub-authpick="' +
            m +
            '">' +
            '<span class="hub-radio-dot"></span>' +
            '<span class="hub-auth-opt-main">' +
            '<span class="hub-auth-opt-title">' +
            authLabel(m) +
            '</span>' +
            '</span>' +
            '</label>'
          );
        })
        .join('') +
      '</div></div>' +
      (isDefault
        ? ''
        : '<input type="password" class="' + App.ui.inputClass() + '" data-hub-apikey placeholder="' +
          t('apihub.apiKeyPlaceholder') +
          '" value="' +
          escAttr(apiKeyOf(key)) +
          '" style="display:none" />') +
      '</div>';
    var overlay = openDialog({
      title: isDefault ? t('apihub.authDefaults') : esc(r ? r.method + ' ' + r.path : key),
      desc: isDefault ? t('apihub.authDefaultsDesc') : '',
      body: body,
      foot:
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('outline') + '" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('default') + '" data-hub-dlg-ok>' +
        t('apihub.save') +
        '</button>',
    });
    var picked = cur;
    overlay.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('[data-hub-authpick]') : null;
      if (!opt) return;
      picked = opt.getAttribute('data-hub-authpick');
      overlay.querySelectorAll('[data-hub-authpick]').forEach(function (el) {
        el.classList.toggle('is-on', el === opt);
      });
      var keyInput = overlay.querySelector('[data-hub-apikey]');
      if (keyInput) keyInput.style.display = picked === 'api-key' ? '' : 'none';
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      var keyInput = overlay.querySelector('[data-hub-apikey]');
      if (isDefault) {
        setDefaultAuth(picked);
      } else {
        setRouteAuth(key, picked);
        if (keyInput) {
          if (keyInput.value) setRouteApiKey(key, keyInput.value);
          else if (picked === 'api-key') {
            App.ui.toast(t('apihub.apiKeyPlaceholder'), 'error');
            return;
          } else setRouteApiKey(key, '');
        }
      }
      closeDialog();
      renderFull();
    });
  }

  /** 自定义路由表单(新建/编辑) */
  function routeFormDialog(editKey) {
    var edit = editKey ? findRoute(editKey) : null;
    var c = edit ? customById(edit.id) : null;
    dialogMethod = c ? c.method : 'GET';
    var ftype = c ? c.responseType || 'echo' : 'echo';
    var body =
      '<div class="hub-form">' +
      '<div class="hub-field"><label>' +
      t('apihub.routeName') +
      '</label><input type="text" class="' + App.ui.inputClass() + '" data-hub-f-name placeholder="' +
      t('apihub.routeNamePlaceholder') +
      '" value="' +
      escAttr(c ? c.name : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.description') +
      '</label><input type="text" class="' + App.ui.inputClass() + '" data-hub-f-desc placeholder="' +
      t('apihub.routeDescPlaceholder') +
      '" value="' +
      escAttr(c ? c.desc : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.method') +
      '</label>' +
      '<div class="hub-method-select" data-dropdown>' +
      '<button type="button" data-dropdown-trigger style="width:100%;color:var(--foreground)">' +
      '<span data-hub-f-method-label>' +
      dialogMethod +
      '</span>' +
      icon('chevron-down', 'size-3') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="left:0;right:auto;min-width:6.5rem">' +
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        .map(function (m) {
          return (
            '<button type="button" class="hub-dd-item" data-hub-f-method="' +
            m +
            '">' +
            '<span class="hub-method ' +
            methodClass(m) +
            '" style="min-width:2.75rem;height:1.125rem;font-size:0.5625rem;margin:0">' +
            m +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.path') +
      '</label><input type="text" class="' + App.ui.inputClass() + '" data-hub-f-path placeholder="/api/..." value="' +
      escAttr(c ? c.path : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.responseType') +
      '</label>' +
      '<div class="hub-auth-options">' +
      '<label class="hub-auth-opt' +
      (ftype === 'echo' ? ' is-on' : '') +
      '" data-hub-ftype="echo"><span class="hub-radio-dot"></span>' +
      '<span class="hub-auth-opt-main"><span class="hub-auth-opt-title">' +
      t('apihub.echo') +
      '</span><span class="hub-auth-opt-desc">method / query / headers / body</span></span></label>' +
      '<label class="hub-auth-opt' +
      (ftype === 'static' ? ' is-on' : '') +
      '" data-hub-ftype="static"><span class="hub-radio-dot"></span>' +
      '<span class="hub-auth-opt-main"><span class="hub-auth-opt-title">' +
      t('apihub.static') +
      '</span></span></label>' +
      '</div></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.statusCode') +
      '</label><input type="number" class="' + App.ui.inputClass() + '" data-hub-f-status min="100" max="599" value="' +
      (c ? c.staticStatus || 200 : 200) +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.response') +
      '</label><textarea class="' + App.ui.inputClass('ui-input-mono') + '" data-hub-f-static placeholder="{ }">' +
      esc(c && c.staticBody ? JSON.stringify(c.staticBody, null, 2) : '') +
      '</textarea></div>' +
      '</div>';
    var overlay = openDialog({
      title: edit ? t('apihub.edit') : t('apihub.addRoute'),
      desc: '',
      body: body,
      foot:
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('outline') + '" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('default') + '" data-hub-dlg-ok>' +
        t('apihub.save') +
        '</button>',
    });
    overlay.addEventListener('click', function (e) {
      var fm = e.target.closest ? e.target.closest('[data-hub-f-method]') : null;
      if (fm) {
        dialogMethod = fm.getAttribute('data-hub-f-method');
        var lbl = overlay.querySelector('[data-hub-f-method-label]');
        if (lbl) lbl.textContent = dialogMethod;
        return;
      }
      var ft = e.target.closest ? e.target.closest('[data-hub-ftype]') : null;
      if (ft) {
        ftype = ft.getAttribute('data-hub-ftype');
        overlay.querySelectorAll('[data-hub-ftype]').forEach(function (el) {
          el.classList.toggle('is-on', el === ft);
        });
      }
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      var name = overlay.querySelector('[data-hub-f-name]').value.trim();
      var path = overlay.querySelector('[data-hub-f-path]').value.trim();
      if (!name) {
        App.ui.toast(t('apihub.nameRequired'), 'error');
        return;
      }
      if (!path || path.charAt(0) !== '/') {
        App.ui.toast(t('apihub.pathRequired'), 'error');
        return;
      }
      var status = parseInt(overlay.querySelector('[data-hub-f-status]').value, 10);
      if (isNaN(status) || status < 100 || status > 599) status = 200;
      var staticBody = null;
      if (ftype === 'static') {
        try {
          staticBody = JSON.parse(overlay.querySelector('[data-hub-f-static]').value || '{}');
        } catch (e2) {
          App.ui.toast('JSON 格式错误', 'error');
          return;
        }
      }
      var data = {
        method: dialogMethod,
        path: path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/',
        name: name,
        desc: overlay.querySelector('[data-hub-f-desc]').value.trim(),
        responseType: ftype,
        staticStatus: status,
        staticBody: staticBody,
      };
      if (edit) updateCustomRoute(edit.id, data);
      else addCustomRoute(data);
      closeDialog();
    });
  }

  /* ---------- 复制分享链接 ---------- */
  function copyLink(key) {
    copyText(location.origin + location.pathname + '#/apihub?r=' + encodeURIComponent(key));
  }
  function copyText(text, hint) {
    var done = function () {
      App.ui.toast(hint || t('apihub.shareHint'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text, done);
      });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) {
      App.ui.toast(t('apihub.saveFailed'), 'error');
    }
  }

  /* ---------- 关闭下拉 ---------- */
  function closeDropdowns() {
    document.querySelectorAll('[data-dropdown-menu]').forEach(function (m) {
      m.classList.remove('open');
    });
    document.querySelectorAll('[data-dropdown-trigger]').forEach(function (tr) {
      tr.removeAttribute('aria-expanded');
    });
  }

  /* ---------- 渲染 ---------- */
  var METHOD_ORDER = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4, HEAD: 5, OPTIONS: 6 };

  function methodClass(m) {
    return 'hub-method-' + String(m || 'GET').toLowerCase();
  }

  /** 尝试把文本美化为缩进 JSON;不是 JSON 返回 null(调用方回退原文) */
  function prettyJson(text) {
    if (typeof text !== 'string' || !text) return null;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch (e) {
      return null;
    }
  }

  /** JSON 语法高亮(仅转义 & < >,保留引号以便正则匹配字符串) */
  function highlightJson(text) {
    var src = viewPretty(text);
    var isJson = prettyJson(text) !== null;
    if (!isJson) src = String(text || '');
    src = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!isJson) return src;
    return src.replace(
      /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      function (m, str, colon, boolv, nullv, num) {
        if (str) return '<span class="hub-hl-str">' + str + '</span>' + (colon || '');
        if (boolv) return '<span class="hub-hl-bool">' + boolv + '</span>';
        if (nullv) return '<span class="hub-hl-null">' + nullv + '</span>';
        if (num) return '<span class="hub-hl-num">' + num + '</span>';
        return m;
      }
    );
  }

  /** 路由所属模块:/api/<模块>/... 取 api 后第一段,其余取路径第一段 */
  function moduleOf(r) {
    var segs = String(r.path || '/').split('/').filter(Boolean);
    if (!segs.length) return '';
    if (segs[0].toLowerCase() === 'api') return (segs[1] || '').toLowerCase();
    return segs[0].toLowerCase();
  }

  /** 基础筛选(模块/分组/标签/搜索):与开关 chips 无关,列表与计数共用 */
  function matchesBase(r) {
    var key = routeKeyOf(r);
    var m = memberships(key, r);
    if (view.moduleFilter && moduleOf(r) !== view.moduleFilter) return false;
    if (view.groupFilter) {
      var gids = descendants(state.config.groups || [], view.groupFilter);
      if (!(m.groupIds || []).some(function (gid) { return gids.indexOf(gid) !== -1; })) return false;
    }
    if (view.tagFilter && view.tagFilter !== '__none__') {
      var tids = descendants(state.config.tags || [], view.tagFilter);
      if (!(m.tagIds || []).some(function (tid) { return tids.indexOf(tid) !== -1; })) return false;
    } else if (view.tagFilter === '__none__') {
      if ((m.tagIds || []).length) return false;
    }
    var q = (view.search || '').trim().toLowerCase();
    if (q) {
      var hay = (r.method + ' ' + r.path + ' ' + (m.name || '') + ' ' + (m.desc || r.desc || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /** 各筛选开关命中数量(基础筛选之上各自独立,供角标显示) */
  function filterCounts() {
    var c = { all: 0, pub: 0, fav: 0, pin: 0, custom: 0 };
    (state.routes || []).forEach(function (r) {
      if (!matchesBase(r)) return;
      c.all++;
      var key = routeKeyOf(r);
      var m = memberships(key, r);
      if (isPublic(key, r)) c.pub++;
      if (m.favorite) c.fav++;
      if (m.pinned) c.pin++;
      if (!r.builtIn) c.custom++;
    });
    return c;
  }

  /** 当前筛选条件下的路由列表(置顶优先,再按方法/路径排序) */
  function filteredRoutes() {
    return (state.routes || [])
      .filter(function (r) {
        var key = routeKeyOf(r);
        var m = memberships(key, r);
        if (!matchesBase(r)) return false;
        if (view.favOnly && !m.favorite) return false;
        if (view.pubOnly && !isPublic(key, r)) return false;
        if (view.pinOnly && !m.pinned) return false;
        if (view.customOnly && r.builtIn) return false;
        return true;
      })
      .sort(function (a, b) {
        var ma = memberships(routeKeyOf(a), a);
        var mb = memberships(routeKeyOf(b), b);
        if (!!ma.pinned !== !!mb.pinned) return ma.pinned ? -1 : 1;
        var oa = METHOD_ORDER[a.method] == null ? 9 : METHOD_ORDER[a.method];
        var ob = METHOD_ORDER[b.method] == null ? 9 : METHOD_ORDER[b.method];
        if (oa !== ob) return oa - ob;
        return (a.path || '').localeCompare(b.path || '');
      });
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

  /** 公共分组树组件(懒创建,展开/过滤等内部状态常驻) */
  var groupTree = null;
  function ensureGroupTree() {
    if (groupTree) return groupTree;
    groupTree = App.ui.groupTree.create({
      nodes: function () {
        return state.config.groups || [];
      },
      rootLabel: t('apihub.allGroups'),
      activeId: view.groupFilter || 'root',
      labels: {
        newGroup: t('apihub.newGroup'),
        newChild: t('apihub.newSubgroup'),
        newSibling: t('apihub.newSibling'),
        rename: t('apihub.rename'),
        moveTo: t('apihub.moveTo'),
        icon: t('apihub.icon'),
        color: t('apihub.color'),
        delete: t('apihub.delete'),
        deleteConfirm: t('apihub.deleteConfirm'),
        deleteMsg: t('apihub.deleteGroupMsg'),
        rootGroup: t('apihub.rootGroup'),
        search: t('apihub.searchGroups'),
        clear: t('apihub.clearSearch'),
        empty: t('apihub.noGroups'),
        noMatch: t('apihub.noGroupsMatch'),
        name: t('apihub.name'),
        namePlaceholder: t('apihub.groupNamePlaceholder'),
        nameRequired: t('apihub.nameRequired'),
        parentGroup: t('apihub.parentGroup'),
        chooseParent: t('apihub.chooseParent'),
        iconSearch: t('apihub.iconSearch'),
        emoji: t('apihub.emoji'),
        emojiInput: t('apihub.emojiInput'),
        clearIcon: t('apihub.clearIcon'),
        clearColor: t('apihub.clearColor'),
        apply: t('apihub.save'),
        cancel: t('apihub.cancel'),
        save: t('apihub.save'),
        copied: t('apihub.copied'),
        menu: t('apihub.menu'),
        renameHint: t('apihub.renameHint'),
      },
      count: function (node) {
        return treeCount('group', node.id);
      },
      rowExtra: function (node) {
        return (
          '<button type="button" class="hub-switch' +
          (node.public ? ' is-on' : '') +
          '" data-hub-toggle="grouppub" data-id="' +
          escAttr(node.id) +
          '" data-tip="' +
          escAttr(t('apihub.publicHint')) +
          '" aria-label="' +
          escAttr(t('apihub.publicHint')) +
          '"><span class="hub-switch-thumb"></span></button>'
        );
      },
      onSelect: function (id) {
        view.groupFilter = id || null;
        rerenderList();
        rerenderSideFilters();
      },
      onCreate: function (parentId, name) {
        addGroup(name, parentId);
      },
      onRename: function (id, name) {
        renameGroup(id, name);
      },
      onDelete: function (id) {
        deleteGroup(id);
      },
      onMove: function (id, targetId, zone) {
        moveGroup(id, targetId, zone);
      },
      onIconChange: function (id, iconName) {
        setGroupIcon(id, iconName);
      },
      onColorChange: function (id, color) {
        setGroupColor(id, color);
      },
      onRender: function () {
        rerenderSideFilters();
      },
    });
    return groupTree;
  }

  /** 公共标签组件(扁平彩色 # 标签 + Gmail 式多选下拉,懒创建) */
  var tagTree = null;
  function ensureTagTree() {
    if (tagTree) return tagTree;
    tagTree = App.ui.tagPicker.create({
      nodes: function () {
        return state.config.tags || [];
      },
      activeId: view.tagFilter || '',
      labels: {
        newTag: t('apihub.newTag'),
        rename: t('apihub.rename'),
        color: t('apihub.color'),
        delete: t('apihub.delete'),
        deleteConfirm: t('apihub.deleteConfirm'),
        deleteTagMsg: t('apihub.deleteTagMsg'),
        searchTags: t('apihub.searchTags'),
        clear: t('apihub.clearSearch'),
        empty: t('apihub.noTags'),
        noMatch: t('apihub.noTagsMatch'),
        name: t('apihub.name'),
        namePlaceholder: t('apihub.tagNamePlaceholder'),
        nameRequired: t('apihub.nameRequired'),
        nameExists: t('apihub.nameExists'),
        nameTooLong: t('apihub.nameTooLong'),
        allTags: t('apihub.allTags'),
        untagged: t('apihub.untagged'),
        allColors: t('apihub.allColors'),
        customColor: t('apihub.customColor'),
        createTag: t('apihub.createTag'),
        selected: t('apihub.selected'),
        noneSelected: t('apihub.noneSelected'),
        done: t('apihub.done'),
        menu: t('apihub.menu'),
        renameHint: t('apihub.renameHint'),
        cancel: t('apihub.cancel'),
        save: t('apihub.save'),
        copied: t('apihub.copied'),
      },
      count: function (id) {
        if (id === null) {
          // 未标记:没有任何标签的路由数
          var n = 0;
          (state.routes || []).forEach(function (r) {
            var m = memberships(routeKeyOf(r), r);
            if (!(m.tagIds || []).length) n++;
          });
          return n;
        }
        return treeCount('tag', id);
      },
      onSelect: function (id) {
        view.tagFilter = id || null;
        rerenderList();
        rerenderSideFilters();
      },
      onCreate: function (name, color) {
        addTag(name, color);
      },
      onRename: function (id, name, color) {
        renameTag(id, name, color);
      },
      onDelete: function (id) {
        deleteTag(id);
      },
      onColorChange: function (id, color) {
        setTagColor(id, color);
      },
      onToggle: function (id) {
        // 从当前打开的标签 Popover 取目标路由,避免误改选中路由
        var pop = document.querySelector('[data-hub-tagpop]');
        var key = pop ? pop.getAttribute('data-hub-tagpop') : null;
        if (!key) return;
        toggleRouteTag(key, id);
        var r = findRoute(key);
        // 延迟到本次点击事件派发结束后再重绘,避免重绘摘除点击目标导致外部点击判断误关闭
        if (pop && r) {
          var k2 = key;
          var r2 = r;
          var p2 = pop;
          setTimeout(function () {
            if (p2 && p2.parentNode) p2.innerHTML = ensureTagTree().pickerHtml(memberships(k2, r2).tagIds || []);
          }, 0);
        }
      },
      onRender: function () {
        rerenderSideFilters();
      },
      onRenderMenu: function () {
        // 只重绘标签 Popover 内容,保持搜索焦点
        var pop = document.querySelector('[data-hub-tagpop]');
        if (!pop) return;
        var key = pop.getAttribute('data-hub-tagpop');
        var r = findRoute(key);
        if (!r) return;
        var m = memberships(key, r);
        pop.innerHTML = ensureTagTree().pickerHtml(m.tagIds || []);
        var inp = pop.querySelector('[data-tp-pick-search]');
        if (inp) {
          inp.focus();
          try {
            inp.setSelectionRange(inp.value.length, inp.value.length);
          } catch (e) {
            /* noop */
          }
        }
      },
    });
    return tagTree;
  }

  function sideSectionsHtml() {
    return (
      '<div class="hub-section">' +
      '<div class="hub-section-head">' +
      '<span class="hub-section-title">' +
      icon('folder', '') +
      esc(t('apihub.groups')) +
      '</span>' +
      '<span class="hub-section-actions">' +
      '<button type="button" class="hub-icon-btn" data-hub-act="gt-collapseall" data-tip="' +
      escAttr(t('apihub.collapseAll')) +
      '" aria-label="' +
      escAttr(t('apihub.collapseAll')) +
      '">' +
      icon('arrow-up', '') +
      '</button>' +
      '<button type="button" class="hub-icon-btn" data-hub-act="gt-expandall" data-tip="' +
      escAttr(t('apihub.expandAll')) +
      '" aria-label="' +
      escAttr(t('apihub.expandAll')) +
      '">' +
      icon('arrow-down', '') +
      '</button>' +
      '<button type="button" class="hub-icon-btn" data-hub-act="newgroup" data-tip="' +
      escAttr(t('apihub.newGroup')) +
      '" aria-label="' +
      escAttr(t('apihub.newGroup')) +
      '">' +
      icon('plus', '') +
      '</button>' +
      '</span>' +
      '</div>' +
      ensureGroupTree().render() +
      '</div>' +
      '<div class="hub-section">' +
      '<div class="hub-section-head">' +
      '<span class="hub-section-title">' +
      icon('layers', '') +
      esc(t('apihub.tags')) +
      '</span>' +
      '<span class="hub-section-actions">' +
      '<button type="button" class="hub-icon-btn" data-hub-act="clrtag" data-tip="' +
      escAttr(t('apihub.clearTagFilter')) +
      '" aria-label="' +
      escAttr(t('apihub.clearTagFilter')) +
      '">' +
      icon('x', '') +
      '</button>' +
      '<button type="button" class="hub-icon-btn" data-hub-act="newtag" data-tip="' +
      escAttr(t('apihub.newTag')) +
      '" aria-label="' +
      escAttr(t('apihub.newTag')) +
      '">' +
      icon('plus', '') +
      '</button>' +
      '</span>' +
      '</div>' +
      ensureTagTree().render() +
      '</div>'
    );
  }

  /** 日志设置按钮(顶栏,位于默认鉴权下拉左侧):条数上限 / 保留天数 / 排除机器人 / 排除内部 */
  function loggingSettingsHtml() {
    var lg = (state.config && state.config.logging) || {};
    return (
      '<span class="hub-dd" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="hub-action-btn" data-tip="' +
      escAttr(t('apihub.logSettings')) +
      '">' +
      icon('settings', '') +
      '</button>' +
      '<div class="hub-dd-menu hub-logmenu" data-dropdown-menu style="right:0;left:auto;min-width:17rem">' +
      '<div class="hub-dd-label">' +
      esc(t('apihub.logSettings')) +
      '</div>' +
      '<div class="hub-log-row">' +
      '<span class="hub-log-label">' +
      esc(t('apihub.maxLogs')) +
      '</span>' +
      '<input type="number" class="' + App.ui.inputClass('hub-log-num') + '" data-hub-logset="maxLogs" min="10" max="10000" step="10" value="' +
      escAttr(lg.maxLogs || 500) +
      '" />' +
      '</div>' +
      '<div class="hub-log-row">' +
      '<span class="hub-log-label">' +
      esc(t('apihub.retentionDays')) +
      '</span>' +
      '<input type="number" class="' + App.ui.inputClass('hub-log-num') + '" data-hub-logset="retentionDays" min="1" max="365" step="1" value="' +
      escAttr(lg.retentionDays || 7) +
      '" />' +
      '</div>' +
      '<label class="hub-log-row">' +
      '<input type="checkbox" class="hub-log-check-input" data-hub-logset="excludeBots"' +
      (lg.excludeBots ? ' checked' : '') +
      ' />' +
      '<span class="hub-log-check">' +
      icon('check', '') +
      '</span>' +
      '<span class="hub-log-label">' +
      esc(t('apihub.excludeBots')) +
      '</span>' +
      '</label>' +
      '<label class="hub-log-row">' +
      '<input type="checkbox" class="hub-log-check-input" data-hub-logset="excludeInternal"' +
      (lg.excludeInternal !== false ? ' checked' : '') +
      ' />' +
      '<span class="hub-log-check">' +
      icon('check', '') +
      '</span>' +
      '<span class="hub-log-label">' +
      esc(t('apihub.excludeInternal')) +
      '</span>' +
      '</label>' +
      '</div></span>'
    );
  }

  /** 默认鉴权下拉(顶栏紧凑版,置于刷新按钮之前) */
  function authDefaultsCompactHtml() {
    var mode = (state.config && state.config.defaults && state.config.defaults.auth) || 'session';
    var showKey = mode === 'api-key';
    return (
      '<span class="hub-dd" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="hub-action-btn" data-tip="' +
      escAttr(t('apihub.authDefaults')) +
      '">' +
      icon('key-round', '') +
      '<span>' +
      esc(authLabel(mode)) +
      '</span>' +
      icon('chevron-down', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="right:0;left:auto;min-width:12rem">' +
      '<div class="hub-dd-label">' +
      esc(t('apihub.authDefaults')) +
      '</div>' +
      ['none', 'session', 'bearer', 'global-password', 'api-key']
        .map(function (m) {
          return (
            '<button type="button" class="hub-dd-item' +
            (mode === m ? ' is-on' : '') +
            '" data-hub-authopt data-mode="' +
            m +
            '">' +
            esc(authLabel(m)) +
            (mode === m ? '<span class="hub-dd-check">' + icon('check', '') + '</span>' : '') +
            '</button>'
          );
        })
        .join('') +
      (showKey
        ? '<div class="hub-dd-label" style="padding-top:0.375rem">' +
          esc(t('apihub.defaultApiKey')) +
          '</div>' +
          '<input type="password" class="' + App.ui.inputClass() + '" data-hub-default-apikey placeholder="' +
          escAttr(t('apihub.defaultApiKey')) +
          '" value="' +
          escAttr(state.secrets.defaultApiKey || '') +
          '" style="width:calc(100% - 0.5rem);margin:0 0.25rem 0.25rem" />'
        : '') +
      '</div></span>'
    );
  }

  function chipHtml(text, cls, iconName) {
    return (
      '<span class="hub-chip' +
      (cls ? ' ' + cls : '') +
      '">' +
      (iconName ? icon(iconName, '') : '') +
      esc(text) +
      '</span>'
    );
  }

  /** 路由行标签区:已选彩色 # 胶囊(显示在路由信息下方)+ 书签(add tag)图标 */
  function routeTagsHtml(key, m) {
    var picked = m.tagIds || [];
    var pills = '';
    picked.forEach(function (tid) {
      var tg = tagById(tid);
      if (!tg) return;
      pills += App.ui.tagPill({
        name: tg.name,
        color: tg.color,
        tip: t('apihub.removeTag'),
        removeLabel: t('apihub.removeTag'),
        removeAttrs:
          'data-hub-tagpill="' + escAttr(key) + '" data-id="' + escAttr(tg.id) + '"',
      });
    });
    return (
      '<span class="hub-route-tags">' +
      App.ui.tagPills(pills) +
      '<button type="button" class="hub-icon-btn hub-tagbtn" data-hub-act="addtag" data-key="' +
      escAttr(key) +
      '" data-tip="' +
      escAttr(t('apihub.addTag')) +
      '" aria-label="' +
      escAttr(t('apihub.addTag')) +
      '">' +
      bookmarkIcon('') +
      (picked.length ? '<span class="hub-tagbtn-count">' + (picked.length > 99 ? '99+' : picked.length) + '</span>' : '') +
      '</button>' +
      '</span>'
    );
  }

  /** 鉴权令牌徽章:图标 + 颜色,悬停提示详情 */
  function tokenBadgeHtml(mode) {
    var m = AUTH_META[mode] || AUTH_META.session;
    return (
      '<span class="hub-token" style="--tokc:' +
      m.color +
      '" data-tip="' +
      escAttr(authLabel(mode)) +
      '">' +
      authTokenIcon(mode) +
      '</span>'
    );
  }

  function routeRowHtml(r) {
    var key = routeKeyOf(r);
    var m = memberships(key, r);
    var pub = isPublic(key, r);
    var mode = authMode(key, r);
    var isCustom = !r.builtIn;
    var title = m.name || '';
    var desc = m.desc || r.desc || '';
    var locked = r.builtIn && r.public;
    var meta = '';
    // 鉴权令牌:图标 + 颜色(公开时显示绿色公开徽章代替)
    if (pub) {
      meta += '<span class="hub-token is-public" data-tip="' + escAttr(t('apihub.publicHint')) + '">' + icon('globe', '') + '</span>';
    } else {
      meta += tokenBadgeHtml(mode);
    }
    // 收藏 / 置顶指示
    if (m.favorite) meta += '<span class="hub-token is-fav" data-tip="' + escAttr(t('apihub.favorite')) + '">' + icon('star', '') + '</span>';
    if (m.pinned) meta += '<span class="hub-token is-pin" data-tip="' + escAttr(t('apihub.pin')) + '">' + icon('circle-dot', '') + '</span>';
    // 分组
    (m.groupIds || []).forEach(function (gid) {
      var g = groupById(gid);
      if (g) meta += chipHtml(g.name, '', 'folder');
    });
    // 标签 + 添加标签
    meta += routeTagsHtml(key, m);
    return (
      '<div class="hub-route' +
      (view.selected === key ? ' is-selected' : '') +
      '" data-hub-route="' +
      escAttr(key) +
      '">' +
      '<div class="hub-route-mcol">' +
      '<span class="hub-method ' +
      methodClass(r.method) +
      '">' +
      esc(r.method) +
      '</span>' +
      '<button type="button" class="hub-switch' +
      (pub ? ' is-on' : '') +
      (locked ? ' is-disabled' : '') +
      '" data-hub-toggle="routepub" data-key="' +
      escAttr(key) +
      '" data-tip="' +
      escAttr(t('apihub.publicHint')) +
      '" aria-label="' +
      escAttr(t('apihub.publicHint')) +
      '"><span class="hub-switch-thumb"></span></button>' +
      '</div>' +
      '<div class="hub-route-main">' +
      '<div class="hub-route-title">' +
      '<span class="hub-route-path">' +
      esc(r.path) +
      '</span>' +
      (title ? '<span class="hub-route-badge">' + esc(title) + '</span>' : '') +
      '<span class="hub-route-badge' +
      (isCustom ? ' is-custom' : '') +
      '">' +
      esc(isCustom ? t('apihub.custom') : t('apihub.builtIn')) +
      '</span>' +
      '</div>' +
      (desc ? '<div class="hub-route-desc">' + esc(desc) + '</div>' : '') +
      '<div class="hub-route-meta">' +
      meta +
      '</div>' +
      '</div>' +
      '<div class="hub-route-ctx">' +
      '<button type="button" class="hub-icon-btn hub-route-more" data-hub-act="more" data-key="' +
      escAttr(key) +
      '" data-tip="' +
      escAttr(t('apihub.menu')) +
      '" aria-label="' +
      escAttr(t('apihub.menu')) +
      '">' +
      icon('ellipsis', '') +
      '</button>' +
      '</div>' +
      '</div>'
    );
  }

  /* ---------- 路由右键菜单(⋯ 按钮 + 右键共用,公共 App.ui.contextMenu) ---------- */
  function routeCtxItemsHtml(key, r) {
    var m = memberships(key, r);
    var isCustom = !r.builtIn;
    var item = function (act, label, iconName, opts) {
      return App.ui.contextMenu.item(iconName, label, {
        attrs:
          'data-hub-ctx="' +
          act +
          '" data-key="' +
          escAttr(key) +
          '"' +
          (opts && opts.attrs ? ' ' + opts.attrs : ''),
        isOn: !!(opts && opts.isOn),
        danger: !!(opts && opts.danger),
        check: !!(opts && opts.check),
      });
    };
    var html =
      item('run', t('apihub.run'), 'send') +
      item('fav', m.favorite ? t('apihub.unfavorite') : t('apihub.favorite'), 'star', {
        isOn: m.favorite,
      }) +
      item('pin', m.pinned ? t('apihub.unpin') : t('apihub.pin'), 'circle-dot', {
        isOn: m.pinned,
      }) +
      App.ui.contextMenu.separator();
    // 分组子菜单
    var groups = state.config.groups || [];
    html += App.ui.contextMenu.submenu(
      t('apihub.assignGroup'),
      'folder',
      groups.length
        ? groups
            .map(function (g) {
              var on = (m.groupIds || []).indexOf(g.id) !== -1;
              return item('setgroup', g.name, 'folder', {
                attrs: 'data-id="' + escAttr(g.id) + '"',
                check: on,
              });
            })
            .join('')
        : App.ui.contextMenu.empty(t('apihub.noGroups'))
    );
    // 标签子菜单
    var tags = state.config.tags || [];
    html += App.ui.contextMenu.submenu(
      t('apihub.assignTags'),
      'layers',
      tags.length
        ? tags
            .map(function (tg) {
              var on = (m.tagIds || []).indexOf(tg.id) !== -1;
              var col = '';
              try {
                col = App.ui.color.resolveColor(tg.color);
              } catch (e) {
                /* noop */
              }
              return App.ui.contextMenu.item(null, tg.name, {
                attrs:
                  'data-hub-ctx="settag" data-key="' +
                  escAttr(key) +
                  '" data-id="' +
                  escAttr(tg.id) +
                  '"',
                check: on,
                hashColor: col,
              });
            })
            .join('')
        : App.ui.contextMenu.empty(t('apihub.noTags'))
    );
    html +=
      App.ui.contextMenu.separator() +
      item('auth', t('apihub.auth'), 'key-round') +
      item('copylink', t('apihub.copyLink'), 'link') +
      item('copypath', t('apihub.copyPath'), 'route');
    if (isCustom) {
      html +=
        item('editroute', t('apihub.edit'), 'pencil') +
        item('delroute', t('apihub.delete'), 'trash-2', { danger: true });
    }
    return html;
  }
  function routeCtxPopup(key, anchorEl, x, y) {
    var r = findRoute(key);
    if (!r) return;
    App.ui.contextMenu.open(routeCtxItemsHtml(key, r), { anchorEl: anchorEl, x: x, y: y });
  }
  function closeRouteCtxPopup() {
    App.ui.contextMenu.close();
  }

  /* ---------- 标签 Popover(书签图标触发,Chrome 添加联系人风格) ---------- */
  function openTagPopover(key, anchorEl) {
    closeTagPopover();
    var r = findRoute(key);
    if (!r) return;
    var m = memberships(key, r);
    var pop = document.createElement('div');
    pop.className = 'hub-tagpop';
    pop.setAttribute('data-hub-tagpop', key);
    pop.innerHTML = ensureTagTree().pickerHtml(m.tagIds || []);
    document.body.appendChild(pop);
    var w = pop.offsetWidth || 256;
    var h = pop.offsetHeight || 320;
    var left, top;
    if (anchorEl && anchorEl.getBoundingClientRect) {
      var rect = anchorEl.getBoundingClientRect();
      left = rect.right - w;
      top = rect.bottom + 4;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4);
    } else {
      left = Math.max(8, (window.innerWidth - w) / 2);
      top = Math.max(8, (window.innerHeight - h) / 2);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function closeTagPopover() {
    var pop = document.querySelector('[data-hub-tagpop]');
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
  }

  function routesHtml() {
    var list = filteredRoutes();
    if (!list.length) {
      return (
        App.ui.emptyState({ icon: 'route', desc: esc(t('apihub.empty')) })
      );
    }
    return list
      .map(function (r) {
        return routeRowHtml(r);
      })
      .join('');
  }

  /** 模块清单(按 /api/<模块> 提取,含数量) */
  function moduleFilters() {
    var map = {};
    (state.routes || []).forEach(function (r) {
      var m = moduleOf(r);
      if (!m) return;
      map[m] = (map[m] || 0) + 1;
    });
    return Object.keys(map)
      .sort()
      .map(function (id) {
        return { id: id, count: map[id] };
      });
  }

  /** 模块下拉筛选(全部模块 + 各模块) */
  function moduleFilterHtml() {
    var cur = view.moduleFilter;
    var mods = moduleFilters();
    return (
      '<span class="hub-dd" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="hub-filter-chip' +
      (cur ? ' is-on' : '') +
      '">' +
      icon('route', '') +
      '<span>' +
      esc(cur || t('apihub.allModules')) +
      '</span>' +
      icon('chevron-down', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="left:0;right:auto;min-width:10rem">' +
      '<div class="hub-dd-label">' +
      esc(t('apihub.module')) +
      '</div>' +
      '<button type="button" class="hub-dd-item' +
      (!cur ? ' is-on' : '') +
      '" data-hub-module="">' +
      icon('layers', '') +
      esc(t('apihub.allModules')) +
      (!cur ? '<span class="hub-dd-check">' + icon('check', '') + '</span>' : '') +
      '</button>' +
      mods
        .map(function (m) {
          var on = cur === m.id;
          return (
            '<button type="button" class="hub-dd-item' +
            (on ? ' is-on' : '') +
            '" data-hub-module="' +
            escAttr(m.id) +
            '">' +
            icon('route', '') +
            esc(m.id) +
            '<span class="hub-dd-count">' +
            fmtCount(m.count) +
            '</span>' +
            (on ? '<span class="hub-dd-check">' + icon('check', '') + '</span>' : '') +
            '</button>'
          );
        })
        .join('') +
      '</div></span>'
    );
  }

  /** 筛选 chip(带微信式右上角数量角标) */
  function filterChipHtml(act, labelKey, iconName, count, on) {
    return (
      '<button type="button" class="hub-filter-chip' +
      (on ? ' is-on' : '') +
      '" data-hub-act="' +
      act +
      '">' +
      icon(iconName, '') +
      esc(t(labelKey)) +
      (count > 0 ? '<span class="hub-filter-badge">' + fmtCount(count) + '</span>' : '') +
      '</button>'
    );
  }

  function fmtCount(n) {
    return n > 99 ? '99+' : String(n);
  }

  function listHtml() {
    var counts = filterCounts();
    return (
      '<div class="hub-col hub-list">' +
      '<div class="hub-list-toolbar">' +
      '<div class="hub-search">' +
      App.ui.searchInput.html({
        placeholder: t('apihub.search'),
        value: view.search,
        attrs: 'data-hub-search',
        clearLabel: t('apihub.clearSearch'),
      }) +
      '</div>' +
      '<div class="hub-filters">' +
      moduleFilterHtml() +
      filterChipHtml('filall', 'apihub.all', 'circle', counts.all, !view.favOnly && !view.pubOnly && !view.pinOnly && !view.customOnly) +
      filterChipHtml('filpub', 'apihub.pubOnly', 'globe', counts.pub, view.pubOnly) +
      filterChipHtml('filfav', 'apihub.favOnly', 'star', counts.fav, view.favOnly) +
      filterChipHtml('filpin', 'apihub.pinOnly', 'circle-dot', counts.pin, view.pinOnly) +
      filterChipHtml('filcustom', 'apihub.customOnly', 'plus', counts.custom, view.customOnly) +
      '</div>' +
      '</div>' +
      '<div class="hub-list-body" data-hub-list-body>' +
      routesHtml() +
      '</div>' +
      '</div>'
    );
  }

  function kvRowsHtml(list, kind) {
    return (
      '<div class="hub-kv">' +
      (list || [])
        .map(function (row, i) {
          return (
            '<div class="hub-kv-row">' +
            '<input type="text" data-hub-kv="' +
            kind +
            ':' +
            i +
            ':k" placeholder="key" value="' +
            escAttr(row.k) +
            '" />' +
            '<input type="text" data-hub-kv="' +
            kind +
            ':' +
            i +
            ':v" placeholder="' +
            escAttr(t('apihub.key')) +
            '" value="' +
            escAttr(row.v) +
            '" />' +
            '<button type="button" class="hub-kv-del" data-hub-kvdel="' +
            kind +
            ':' +
            i +
            '" aria-label="' +
            escAttr(t('apihub.delete')) +
            '">' +
            icon('x', '') +
            '</button>' +
            '</div>'
          );
        })
        .join('') +
      '</div>' +
      '<button type="button" class="hub-add-row" data-hub-kvadd="' +
      kind +
      '">' +
      icon('plus', '') +
      esc(t('apihub.addRow')) +
      '</button>'
    );
  }

  function requestHtml() {
    var req = view.req;
    return (
      '<div class="hub-req">' +
      '<div class="hub-req-line">' +
      '<div class="hub-method-select" data-dropdown>' +
      '<button type="button" data-dropdown-trigger><span>' +
      esc(req.method) +
      '</span>' +
      icon('chevron-down', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="left:0;right:auto;min-width:6.5rem">' +
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        .map(function (mm) {
          return (
            '<button type="button" class="hub-dd-item" data-hub-reqmethod="' +
            mm +
            '">' +
            '<span class="hub-method ' +
            methodClass(mm) +
            '" style="min-width:2.75rem;height:1.125rem;font-size:0.5625rem;margin:0">' +
            mm +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>' +
      '<input type="text" class="hub-req-path" data-hub-reqpath placeholder="/api/..." value="' +
      escAttr(req.path) +
      '" />' +
      '<button type="button" data-slot="button" class="' + App.ui.buttonClass('default') + '" data-hub-act="send"' +
      (view.running ? ' disabled' : '') +
      '>' +
      icon('send', '') +
      esc(t('apihub.send')) +
      '</button>' +
      '</div>' +
      '<div class="hub-tabs">' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'params' ? ' is-on' : '') +
      '" data-hub-tab="params">' +
      icon('sliders-horizontal', '') +
      esc(t('apihub.params')) +
      '</button>' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'headers' ? ' is-on' : '') +
      '" data-hub-tab="headers">' +
      icon('list-filter', '') +
      esc(t('apihub.headers')) +
      '</button>' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'body' ? ' is-on' : '') +
      '" data-hub-tab="body">' +
      icon('scroll-text', '') +
      esc(t('apihub.body')) +
      '</button>' +
      '</div>' +
      (view.runTab === 'params' ? kvRowsHtml(req.params, 'params') : '') +
      (view.runTab === 'headers' ? kvRowsHtml(req.headers, 'headers') : '') +
      (view.runTab === 'body'
        ? '<textarea class="hub-body-input" data-hub-reqbody placeholder="{ }">' +
          esc(req.body || '') +
          '</textarea>'
        : '') +
      '</div>'
    );
  }

  function statusClass(s) {
    if (s >= 200 && s < 300) return 'is-2xx';
    if (s >= 400 && s < 500) return 'is-4xx';
    if (s >= 500) return 'is-5xx';
    return 'is-err';
  }

  function fmtSize(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /** 递归解码 JSON 字符串值(美化视图用:settings 等 KV 值以 JSON 字符串落库) */
  function decodeNested(value) {
    if (typeof value === 'string') {
      var t = value.trim();
      if (t && (t.charAt(0) === '{' || t.charAt(0) === '[')) {
        try {
          return decodeNested(JSON.parse(value));
        } catch (e) {
          return value;
        }
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(decodeNested);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        out[k] = decodeNested(value[k]);
      });
      return out;
    }
    return value;
  }

  /** 美化视图文本:解析 JSON → 递归解码嵌套字符串 → 缩进序列化 */
  function viewPretty(text) {
    try {
      return JSON.stringify(decodeNested(JSON.parse(text)), null, 2);
    } catch (e) {
      return prettyJson(text) || text;
    }
  }

  /* ---------- 响应 JSON 树(公共组件 App.ui.jsonTree) ---------- */
  var jsonTree = null;
  /** 解析响应文本为解码后的 JSON 值;非 JSON 返回 null */
  function jsonValue(text) {
    try {
      return decodeNested(JSON.parse(text));
    } catch (e) {
      return null;
    }
  }
  function ensureJsonTree(value) {
    if (!jsonTree) {
      jsonTree = App.ui.jsonTree.create({
        labels: {
          copyNode: t('apihub.copyNode'),
          items: t('apihub.jsonItems'),
          keys: t('apihub.jsonKeys'),
        },
        onCopy: function (text) {
          copyText(text, t('apihub.copied'));
        },
        onRender: function () {
          var box = document.querySelector('[data-hub-jsonbox]');
          if (box) box.innerHTML = jsonTree.render();
        },
      });
    }
    jsonTree.setValue(value);
    return jsonTree;
  }

  function responseHtml() {
    var res = view.run;
    var isJson = res ? prettyJson(res.text || '') !== null : false;
    var html =
      '<div class="hub-res-head">' +
      '<span class="hub-res-title">' +
      icon('circle-dot', '') +
      esc(t('apihub.response')) +
      '</span>';
    if (res) {
      html +=
        '<div class="hub-res-meta">' +
        '<span class="hub-res-status ' +
        statusClass(res.status) +
        '">' +
        (res.status ? String(res.status) : 'ERR') +
        (res.statusText ? ' ' + esc(res.statusText) : '') +
        '</span>' +
        '<span class="hub-res-stat">' +
        res.timeMs +
        ' ms</span>' +
        '<span class="hub-res-stat">' +
        fmtSize(res.size) +
        '</span>' +
        '</div>';
    }
    html +=
      '<div class="hub-res-actions">' +
      '<button type="button" class="hub-res-toggle' +
      (view.resView === 'pretty' ? ' is-on' : '') +
      '" data-hub-resview="pretty">' +
      esc(t('apihub.pretty')) +
      '</button>' +
      '<button type="button" class="hub-res-toggle' +
      (view.resView === 'raw' ? ' is-on' : '') +
      '" data-hub-resview="raw">' +
      esc(t('apihub.raw')) +
      '</button>' +
      (res && isJson && view.resView === 'pretty'
        ? '<button type="button" class="hub-res-toggle" data-jexpall="all" data-tip="' +
          escAttr(t('apihub.expandAll')) +
          '" aria-label="' +
          escAttr(t('apihub.expandAll')) +
          '">' +
          icon('arrow-down', '') +
          esc(t('apihub.expandAll')) +
          '</button>' +
          '<button type="button" class="hub-res-toggle" data-jexpall="none" data-tip="' +
          escAttr(t('apihub.collapseAll')) +
          '" aria-label="' +
          escAttr(t('apihub.collapseAll')) +
          '">' +
          icon('arrow-up', '') +
          esc(t('apihub.collapseAll')) +
          '</button>'
        : '') +
      '<button type="button" class="hub-res-toggle" data-hub-act="copyres">' +
      icon('copy', '') +
      esc(t('apihub.copy')) +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="hub-res-body">';
    if (view.running) {
      html += '<div class="hub-res-empty">' + icon('circle-dot', '') + esc(t('apihub.sending')) + '</div>';
    } else if (!res) {
      html += '<div class="hub-res-empty">' + icon('route', '') + esc(t('apihub.emptyRun')) + '</div>';
    } else {
      var body = res.text || '';
      if (view.resView === 'pretty' && isJson) {
        html += '<div class="hub-json" data-hub-jsonbox>' + ensureJsonTree(jsonValue(body)).render() + '</div>';
      } else if (view.resView === 'pretty') {
        html += '<pre class="hub-pre">' + highlightJson(body) + '</pre>';
      } else {
        html += '<pre class="hub-pre">' + esc(body) + '</pre>';
      }
      if (res.headers && res.headers.length) {
        html +=
          '<div class="hub-headers-list">' +
          res.headers
            .map(function (h) {
              return '<div><span>' + esc(h[0]) + '</span><span>' + esc(h[1]) + '</span></div>';
            })
            .join('') +
          '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  function historyHtml() {
    var h = view.history || [];
    var html =
      '<div class="hub-history">' +
      '<div class="hub-history-head">' +
      icon('timer', '') +
      esc(t('apihub.history')) +
      '</div>' +
      '<div class="hub-history-list">';
    if (!h.length) {
      html += '<div class="hub-history-empty">' + esc(t('apihub.noRecent')) + '</div>';
    } else {
      html += h
        .map(function (item) {
          return (
            '<div class="hub-history-item" data-hub-replay="' +
            item.ts +
            '">' +
            '<span class="hub-method ' +
            methodClass(item.method) +
            '">' +
            esc(item.method) +
            '</span>' +
            '<span class="hub-history-path">' +
            esc(item.path) +
            '</span>' +
            '<span class="hub-history-status">' +
            item.status +
            '</span>' +
            '</div>'
          );
        })
        .join('');
    }
    html += '</div></div>';
    return html;
  }

  function runHtml() {
    return (
      '<div class="hub-col hub-run">' +
      '<div class="hub-run-scroll">' +
      requestHtml() +
      responseHtml() +
      '</div>' +
      historyHtml() +
      '</div>'
    );
  }

  function sideHtml() {
    return '<div class="hub-side-scroll" data-hub-side>' + sideSectionsHtml() + '</div>';
  }

  function pageHtml() {
    var head =
      '<div class="hub-head">' +
      '<div>' +
      '<h1>' +
      esc(t('apihub.title')) +
      '</h1>' +
      '<p>' +
      esc(t('apihub.desc')) +
      '</p>' +
      '</div>' +
      '<div class="hub-head-actions">' +
      loggingSettingsHtml() +
      authDefaultsCompactHtml() +
      '<button type="button" class="hub-action-btn" data-hub-act="refresh">' +
      icon('rotate-ccw', '') +
      esc(t('apihub.refresh')) +
      '</button>' +
      '<button type="button" class="hub-action-btn is-primary" data-hub-act="newroute">' +
      icon('plus', '') +
      esc(t('apihub.addRoute')) +
      '</button>' +
      '</div>' +
      '</div>';
    if (state.error) {
      return (
        '<div class="hub-page">' +
        head +
        '<div class="hub-grid"><div class="hub-col hub-list"><div class="hub-list-body">' +
        App.ui.emptyState({ icon: 'circle-alert', desc: esc(state.error) }) +
        '</div></div></div></div>'
      );
    }
    if (!state.loaded) {
      return (
        '<div class="hub-page">' +
        head +
        '<div class="hub-grid"><div class="hub-col hub-list"><div class="hub-list-body">' +
        App.ui.emptyState({ icon: 'route', desc: esc(t('apihub.loading')) }) +
        '</div></div></div></div>'
      );
    }
    return (
      '<div class="hub-page">' +
      head +
      '<div class="hub-grid">' +
      sideHtml() +
      listHtml() +
      runHtml() +
      '</div>' +
      '</div>'
    );
  }

  function render(path, ctx) {
    return pageHtml();
  }

  /** 全量重渲染(状态变更后) */
  function renderFull() {
    var area = document.querySelector('[data-content-area]');
    if (!area) return;
    area.innerHTML = pageHtml();
  }

  /** 仅刷新中间列表(搜索输入时避免抢焦点) */
  function rerenderList() {
    var body = document.querySelector('[data-hub-list-body]');
    if (body) body.innerHTML = routesHtml();
  }

  /** 仅刷新左侧筛选区(分组/标签激活态) */
  function rerenderSideFilters() {
    var side = document.querySelector('[data-hub-side]');
    if (side) side.innerHTML = sideSectionsHtml();
  }

  /* ---------- 事件委托 ---------- */
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    // 路由右键菜单项(⋯ 按钮/右键浮层共用)
    var ctxItem = target.closest('[data-hub-ctx]');
    if (ctxItem) {
      var cAct = ctxItem.getAttribute('data-hub-ctx');
      var cKey = ctxItem.getAttribute('data-key');
      var cId = ctxItem.getAttribute('data-id');
      closeRouteCtxPopup();
      if (cAct === 'run') {
        selectRoute(cKey);
        runRequest();
      } else if (cAct === 'fav') toggleFav(cKey);
      else if (cAct === 'pin') togglePin(cKey);
      else if (cAct === 'auth') authDialog(cKey);
      else if (cAct === 'copylink') copyLink(cKey);
      else if (cAct === 'copypath') {
        var cr = findRoute(cKey);
        if (cr) copyText(cr.path, t('apihub.copied'));
      }
      else if (cAct === 'editroute') routeFormDialog(cKey);
      else if (cAct === 'delroute') {
        confirmDialog(
          t('apihub.deleteConfirm'),
          t('apihub.deleteRouteMsg'),
          t('apihub.delete'),
          function () {
            deleteCustomRoute(cKey.slice(3));
          },
          true
        );
      } else if (cAct === 'setgroup') toggleRouteGroup(cKey, cId);
      else if (cAct === 'settag') toggleRouteTag(cKey, cId);
      return;
    }
    // 点击路由右键菜单外部 → 收起
    // 点击标签 Popover 外部(书签按钮除外)→ 收起;点「完成」也收起
    if (!target.closest('[data-hub-tagpop]') && !target.closest('[data-hub-act="addtag"]') && !target.closest('[data-tp-pop]')) closeTagPopover();
    if (target.closest('[data-tp-done]')) closeTagPopover();

    // 弹窗关闭
    if (target.closest('[data-hub-dlg-close]')) {
      closeDialog();
      return;
    }

    // 下拉触发器:交给核心层打开,不触发重渲染
    if (target.closest('[data-dropdown-trigger]')) return;

    // 公开开关(路由 / 分组)—— 须在树节点筛选之前处理(开关位于树行内)
    var sw = target.closest('[data-hub-toggle]');
    if (sw) {
      var kind = sw.getAttribute('data-hub-toggle');
      if (kind === 'routepub') toggleRoutePublic(sw.getAttribute('data-key'));
      else if (kind === 'grouppub') toggleGroupPublic(sw.getAttribute('data-id'));
      return;
    }

    // 标签胶囊移除
    var tagpill = target.closest('[data-hub-tagpill]');
    if (tagpill) {
      toggleRouteTag(tagpill.getAttribute('data-hub-tagpill'), tagpill.getAttribute('data-id'));
      return;
    }

    // 分组/标签成员选择(下拉项)
    var sg = target.closest('[data-hub-setgroup]');
    if (sg) {
      toggleRouteGroup(sg.getAttribute('data-hub-setgroup'), sg.getAttribute('data-id'));
      return;
    }

    // 默认鉴权下拉项
    var ao = target.closest('[data-hub-authopt]');
    if (ao) {
      closeDropdowns();
      setDefaultAuth(ao.getAttribute('data-mode'));
      return;
    }

    // 模块筛选下拉
    var md = target.closest('[data-hub-module]');
    if (md) {
      view.moduleFilter = md.getAttribute('data-hub-module') || '';
      closeDropdowns();
      renderFull();
      return;
    }

    // 通用动作(按钮)
    var actBtn = target.closest('[data-hub-act]');
    if (actBtn) {
      var a = actBtn.getAttribute('data-hub-act');
      var key = actBtn.getAttribute('data-key');
      closeDropdowns(); // 动作触发后收起所有下拉
      switch (a) {
        case 'run':
          selectRoute(key);
          runRequest();
          break;
        case 'fav':
          toggleFav(key);
          break;
        case 'pin':
          togglePin(key);
          break;
        case 'auth':
          authDialog(key);
          break;
        case 'copylink':
          copyLink(key);
          break;
        case 'editroute':
          routeFormDialog(key);
          break;
        case 'delroute':
          confirmDialog(
            t('apihub.deleteConfirm'),
            t('apihub.deleteRouteMsg'),
            t('apihub.delete'),
            function () {
              deleteCustomRoute(key.slice(3));
            },
            true
          );
          break;
        case 'newgroup':
          ensureGroupTree().createDialog('');
          break;
        case 'gt-expandall':
          ensureGroupTree().expandAll();
          renderFull();
          break;
        case 'gt-collapseall':
          ensureGroupTree().collapseAll();
          renderFull();
          break;
        case 'more':
          routeCtxPopup(key, actBtn);
          break;
        case 'addtag':
          if (document.querySelector('[data-hub-tagpop]')) closeTagPopover();
          else openTagPopover(key, actBtn);
          break;
        case 'newtag':
          ensureTagTree().openCreateDialog(actBtn);
          break;
        case 'newroute':
          routeFormDialog(null);
          break;
        case 'refresh':
          view.history = [];
          view.run = null;
          state.loaded = false;
          state.error = null;
          renderFull();
          load();
          break;
        case 'filfav':
          view.favOnly = !view.favOnly;
          renderFull();
          break;
        case 'filpub':
          view.pubOnly = !view.pubOnly;
          renderFull();
          break;
        case 'filcustom':
          view.customOnly = !view.customOnly;
          renderFull();
          break;
        case 'filall':
          view.favOnly = false;
          view.pubOnly = false;
          view.pinOnly = false;
          view.customOnly = false;
          renderFull();
          break;
        case 'filpin':
          view.pinOnly = !view.pinOnly;
          renderFull();
          break;
        case 'clrgroup':
          view.groupFilter = null;
          renderFull();
          break;
        case 'clrtag':
          view.tagFilter = null;
          renderFull();
          break;
        case 'send':
          runRequest();
          break;
        case 'copyres':
          if (view.run) {
            var txt = view.run.text;
            if (view.resView === 'pretty' && prettyJson(txt) !== null) txt = prettyJson(txt);
            copyText(txt);
          }
          break;
      }
      return;
    }

    // 请求方法选择
    var rm = target.closest('[data-hub-reqmethod]');
    if (rm) {
      view.req.method = rm.getAttribute('data-hub-reqmethod');
      if (!hasBody(view.req.method) && view.runTab === 'body') view.runTab = 'params';
      closeDropdowns();
      renderFull();
      return;
    }

    // 标签页切换
    var tab = target.closest('[data-hub-tab]');
    if (tab) {
      view.runTab = tab.getAttribute('data-hub-tab');
      renderFull();
      return;
    }

    // 响应视图切换
    var rv = target.closest('[data-hub-resview]');
    if (rv) {
      view.resView = rv.getAttribute('data-hub-resview');
      renderFull();
      return;
    }

    // JSON 树:全部展开/折叠(节点展开/折叠与复制由公共组件 json-tree 处理)
    var jx = target.closest('[data-jexpall]');
    if (jx) {
      var jm = jx.getAttribute('data-jexpall');
      if (jsonTree) {
        if (jm === 'all') jsonTree.expandAll();
        else jsonTree.collapseAll();
      }
      return;
    }

    // KV 行增删
    var kvdel = target.closest('[data-hub-kvdel]');
    if (kvdel) {
      var parts = kvdel.getAttribute('data-hub-kvdel').split(':');
      var list = parts[0] === 'params' ? view.req.params : view.req.headers;
      list.splice(parseInt(parts[1], 10), 1);
      renderFull();
      return;
    }
    var kvadd = target.closest('[data-hub-kvadd]');
    if (kvadd) {
      var which = kvadd.getAttribute('data-hub-kvadd');
      if (which === 'params') view.req.params.push({ k: '', v: '' });
      else view.req.headers.push({ k: '', v: '' });
      renderFull();
      return;
    }

    // 历史回放
    var replay = target.closest('[data-hub-replay]');
    if (replay) {
      var hts = replay.getAttribute('data-hub-replay');
      for (var i = 0; i < view.history.length; i++) {
        if (String(view.history[i].ts) === hts) {
          rerunHistory(view.history[i]);
          break;
        }
      }
      return;
    }

    // 路由行选中
    var row = target.closest('[data-hub-route]');
    if (row) {
      selectRoute(row.getAttribute('data-hub-route'));
      return;
    }
  });

  // 输入:搜索 / KV 行 / 请求路径/体 / 默认 API Key(实时更新,不重渲染以免抢焦点)
  document.addEventListener('input', function (e) {
    var target = e.target;
    if (!target || !target.getAttribute) return;

    if (target.hasAttribute('data-hub-search')) {
      view.search = target.value;
      rerenderList();
      return;
    }
    var kv = target.getAttribute('data-hub-kv');
    if (kv) {
      var parts = kv.split(':');
      var list = parts[0] === 'params' ? view.req.params : view.req.headers;
      var idx = parseInt(parts[1], 10);
      if (list[idx]) list[idx][parts[2]] = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-reqpath')) {
      view.req.path = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-reqbody')) {
      view.req.body = target.value;
      return;
    }
    if (target.hasAttribute('data-hub-default-apikey')) {
      setDefaultApiKey(target.value);
      return;
    }
  });

  // 日志设置变更(数字输入 / 复选框)
  document.addEventListener('change', function (e) {
    var target = e.target;
    if (!target || !target.getAttribute) return;
    if (!target.hasAttribute('data-hub-logset')) return;
    if (!state.config.logging) state.config.logging = {};
    var k = target.getAttribute('data-hub-logset');
    if (k === 'maxLogs' || k === 'retentionDays') {
      var v = parseInt(target.value, 10);
      if (!Number.isFinite(v)) return;
      state.config.logging[k] = v;
    } else {
      state.config.logging[k] = target.checked;
    }
    persist();
  });

  // 回车键:请求路径框 → 发送
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeRouteCtxPopup();
      closeTagPopover();
      return;
    }
    if (e.key !== 'Enter') return;
    var target = e.target;
    if (target && target.hasAttribute && target.hasAttribute('data-hub-reqpath')) {
      e.preventDefault();
      runRequest();
    }
  });

  // 路由行右键 → 上下文菜单(与 ⋯ 按钮共用)
  document.addEventListener('contextmenu', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var row = target.closest('[data-hub-route]');
    if (!row) return;
    e.preventDefault();
    routeCtxPopup(row.getAttribute('data-hub-route'), null, e.clientX, e.clientY);
  });

  /* ---------- 内容挂载后初始化(懒加载数据) ---------- */
  document.addEventListener('app:afterRender', function (ev) {
    var detail = ev.detail || {};
    if (detail.path === '/apihub' && !state.loaded && !state.error) {
      load();
    }
  });

  App.defineModule({ id: 'apihub', render: render });
})();
