/* ============================================================
 * chat-actions-groups.js — chats 模块·动作域·分组/标签 CRUD
 * ------------------------------------------------------------
 * 分组:新建/重命名/删除(级联子孙,会话仅解除引用)/移动/图标/颜色
 * 标签:新建/重命名/删除(从所有会话移除引用)/设色。
 * ============================================================ */
'use strict';

import { state, uid, persistConfig, persistConversation } from './chat-store.js';
import { renderFull } from './chat-view.js';

/* ---------- 分组 CRUD ---------- */
export function addGroup(name, parentId) {
  var g = (state.config.groups = state.config.groups || []);
  g.push({ id: uid('g'), name: name, parentId: parentId || '', sort: g.length });
  persistConfig();
  renderFull();
}
export function renameGroup(id, name) {
  var g = groupById(id);
  if (g) {
    g.name = name;
    persistConfig();
    renderFull();
  }
}
export function deleteGroup(id) {
  var g = state.config.groups || [];
  var removeIds = descendantsOf(g, id);
  state.config.groups = g.filter(function (x) {
    return removeIds.indexOf(x.id) === -1;
  });
  // 会话仅解除引用,不受影响
  state.conversations.forEach(function (c) {
    if (removeIds.indexOf(c.groupId || '') !== -1) c.groupId = '';
  });
  if (state.view.groupFilter && removeIds.indexOf(state.view.groupFilter) !== -1) {
    state.view.groupFilter = null;
  }
  persistConfig();
  persistConversation();
  renderFull();
}
export function moveGroup(id, targetId, zone) {
  var list = state.config.groups || [];
  var next = App.ui.groupTree.moveNode(list, id, targetId, zone);
  if (!next) return;
  state.config.groups = next;
  persistConfig();
  renderFull();
}
export function setGroupIcon(id, iconName) {
  var g = groupById(id);
  if (g) {
    g.icon = iconName || '';
    persistConfig();
    renderFull();
  }
}
export function setGroupColor(id, color) {
  var g = groupById(id);
  if (g) {
    g.color = color || '';
    persistConfig();
    renderFull();
  }
}
function groupById(id) {
  var g = state.config.groups || [];
  for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
  return null;
}
function descendantsOf(nodes, id) {
  var out = [id];
  var changed = true;
  while (changed) {
    changed = false;
    nodes.forEach(function (n) {
      if (out.indexOf(n.id) === -1 && out.indexOf(n.parentId || '') !== -1) {
        out.push(n.id);
        changed = true;
      }
    });
  }
  return out;
}

/* ---------- 标签 CRUD ---------- */
export function addTag(name, color) {
  var tags = (state.config.tags = state.config.tags || []);
  tags.push({ id: uid('t'), name: name, color: color || '', sort: tags.length });
  persistConfig();
  renderFull();
}
export function renameTag(id, name, color) {
  var tg = tagById(id);
  if (tg) {
    tg.name = name;
    if (arguments.length > 2) tg.color = color || '';
    persistConfig();
    renderFull();
  }
}
export function deleteTag(id) {
  state.config.tags = (state.config.tags || []).filter(function (x) {
    return x.id !== id;
  });
  // 从所有会话移除引用
  state.conversations.forEach(function (c) {
    c.tagIds = (c.tagIds || []).filter(function (tid) {
      return tid !== id;
    });
  });
  if (state.view.tagFilter === id) state.view.tagFilter = null;
  persistConfig();
  persistConversation();
  renderFull();
}
export function setTagColor(id, color) {
  var tg = tagById(id);
  if (tg) {
    tg.color = color || '';
    persistConfig();
    renderFull();
  }
}
function tagById(id) {
  var tags = state.config.tags || [];
  for (var i = 0; i < tags.length; i++) if (tags[i].id === id) return tags[i];
  return null;
}
