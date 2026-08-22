/* ============================================================
 * ch-store.js — chats 模块·状态域(可变状态 + 派生查询)
 * ------------------------------------------------------------
 * 拆分设计见 index.js 头注;本文件收敛全部可变状态:
 * - state{ search, selectedId, newSearch, selectedUsers }
 * - 派生查询 filteredChats / usersWithoutMessages
 * 方向:data ← store ← view ← events(events 直接 import view 的
 * rerender,无需注入)。
 * ============================================================ */
'use strict';

import { CONVERSATIONS, usersWithoutMessages as allUsers } from './ch-data.js';

/* ---------- 状态 ---------- */
export var state = {
  search: '',
  selectedId: null,
  newSearch: '',
  selectedUsers: [],
};

/* ---------- 派生查询 ---------- */
export function filteredChats() {
  var q = state.search.trim().toLowerCase();
  return CONVERSATIONS.filter(function (c) {
    return c.fullName.toLowerCase().indexOf(q) !== -1;
  });
}

export function usersWithoutMessages() {
  return allUsers();
}
