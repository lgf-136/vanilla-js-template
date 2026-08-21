/* hub-actions.js — 路由级配置变更动作（公开开关/收藏/置顶/鉴权/自定义路由 CRUD） */
import { closeDropdowns, renderFull } from './hub-view.js';
import { customById, findRoute, memberships, overrideOf, persist, state, uid, view } from './hub-store.js';

'use strict';

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

export { addCustomRoute, apiKeyOf, deleteCustomRoute, patchCustom, patchRoute, setDefaultApiKey, setDefaultAuth, setRouteApiKey, setRouteAuth, toggleFav, togglePin, toggleRouteGroup, toggleRoutePublic, toggleRouteTag, updateCustomRoute };
