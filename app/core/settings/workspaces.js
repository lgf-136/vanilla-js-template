/* ============================================================
 * settings/workspaces.js — 工作空间注册表与活跃指针(零依赖)
 * ------------------------------------------------------------
 * settings 目录拆分设计见 index.js 头部;本文件为工作空间业务域:
 * - 预设图标/色板(zinc + 主题面板 17 种强调色)/出厂默认工作空间
 * - slug 规则与唯一 id 生成、normalizeWorkspace 白名单校验
 *   (补齐三语 names/note,兼容旧 nameKey/单 name 数据)
 * - readWorkspaces/readActiveWorkspace/findWorkspace 与显示名工具
 * 依赖:storage.js(readStorage/K)、appearance.js(CHART_COLORS)。
 * ============================================================ */
'use strict';

import { K, readStorage } from './storage.js';
import { CHART_COLORS } from './appearance.js';

// 工作空间强调色:zinc + 主题面板的 17 种强调色(与主题设置面板一致)
var WORKSPACE_COLORS = ['zinc'].concat(CHART_COLORS);
// 工作空间预设图标(均为 icons-data.js 中已内置的 lucide 图标)
var WORKSPACE_ICONS = [
  'house',
  'briefcase',
  'book-open',
  'heart',
  'gamepad-2',
  'plane',
  'folder',
  'star',
  'globe',
  'layers',
  'sparkles',
  'users',
  'building-2',
  'shopping-bag',
  'graduation-cap',
  'coffee',
  'trophy',
  'rocket',
];
// 默认工作空间(首次启动无本地数据时使用)。
// names 为三语显示名(zh-CN/en 必填,zh-TW 可选);id 采用 ws-英文名称 规则。
var DEFAULT_WORKSPACES = [
  {
    id: 'ws-default',
    name: '默认',
    names: { 'zh-CN': '默认', 'zh-TW': '預設', en: 'Default' },
    icon: 'house',
    color: 'zinc',
    note: '',
  },
  {
    id: 'ws-work',
    name: '工作',
    names: { 'zh-CN': '工作', 'zh-TW': '工作', en: 'Work' },
    icon: 'briefcase',
    color: 'blue',
    note: '',
  },
  {
    id: 'ws-study',
    name: '学习',
    names: { 'zh-CN': '学习', 'zh-TW': '學習', en: 'Study' },
    icon: 'book-open',
    color: 'violet',
    note: '',
  },
  {
    id: 'ws-life',
    name: '生活',
    names: { 'zh-CN': '生活', 'zh-TW': '生活', en: 'Life' },
    icon: 'heart',
    color: 'rose',
    note: '',
  },
  {
    id: 'ws-fun',
    name: '娱乐',
    names: { 'zh-CN': '娱乐', 'zh-TW': '娛樂', en: 'Entertainment' },
    icon: 'gamepad-2',
    color: 'emerald',
    note: '',
  },
  {
    id: 'ws-travel',
    name: '旅游',
    names: { 'zh-CN': '旅游', 'zh-TW': '旅遊', en: 'Travel' },
    icon: 'plane',
    color: 'sky',
    note: '',
  },
];

/** 工作空间默认值拷贝(避免外部修改共享引用;names 为对象需独立拷贝) */
function defaultWorkspaces() {
  return DEFAULT_WORKSPACES.map(function (w) {
    return {
      id: w.id,
      name: w.name,
      names: {
        'zh-CN': w.names['zh-CN'],
        'zh-TW': w.names['zh-TW'],
        en: w.names.en,
      },
      icon: w.icon,
      color: w.color,
      note: w.note || '',
    };
  });
}

/** 英文名称 → 工作空间 id 的 slug 规则(仅保留 a-z0-9,其余转连字符) */
function slugify(str) {
  return String(str == null ? '' : str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** 依据英文 slug 生成唯一 id(重名自动追加 -2/-3…;excludeId 供编辑时忽略自身) */
function uniqueWorkspaceId(base, list, excludeId) {
  var id = base;
  var i = 2;
  while (
    (list || []).some(function (w) {
      return w.id === id && w.id !== excludeId;
    })
  ) {
    id = base + '-' + i;
    i += 1;
  }
  return id;
}

/** 规范化任意来源(本地存储/服务端)的工作空间对象:补齐三语 names / note 并做白名单校验 */
function normalizeWorkspace(w) {
  var rawName = w && typeof w.name === 'string' ? w.name : '';
  var names = { 'zh-CN': '', 'zh-TW': '', en: '' };
  if (w && w.names && typeof w.names === 'object') {
    names['zh-CN'] = typeof w.names['zh-CN'] === 'string' ? w.names['zh-CN'] : '';
    names['zh-TW'] = typeof w.names['zh-TW'] === 'string' ? w.names['zh-TW'] : '';
    names.en = typeof w.names.en === 'string' ? w.names.en : '';
  }
  if (!names['zh-CN'] && rawName) names['zh-CN'] = rawName;
  if (!names.en) names.en = names['zh-CN'] || rawName;
  return {
    id: String(w && w.id ? w.id : ''),
    name: names['zh-CN'] || names.en,
    names: names,
    icon: WORKSPACE_ICONS.indexOf(w && w.icon) !== -1 ? w.icon : 'house',
    color: WORKSPACE_COLORS.indexOf(w && w.color) !== -1 ? w.color : 'zinc',
    note: w && typeof w.note === 'string' ? w.note : '',
  };
}

/** 当前语言下的工作空间显示名(自定义名按语言取,缺省回退简体/英文) */
function workspaceDisplayName(ws, locale) {
  if (!ws) return '';
  var n = ws.names;
  if (n && typeof n === 'object') {
    return (locale && n[locale]) || n['zh-CN'] || n.en || ws.name || '';
  }
  return ws.name || '';
}

/** 读取工作空间列表(白名单校验:非法项丢弃,空列表回退默认;兼容旧 nameKey/单 name 数据) */
function readWorkspaces() {
  var stored = readStorage(K('workspaces'));
  if (!stored) return defaultWorkspaces();
  try {
    var arr = JSON.parse(stored);
    if (!Array.isArray(arr) || !arr.length) return defaultWorkspaces();
    var out = arr
      .filter(function (w) {
        return w && typeof w === 'object' && typeof w.id === 'string' && w.id;
      })
      .map(normalizeWorkspace)
      .filter(function (w) {
        return w.name;
      });
    return out.length ? out : defaultWorkspaces();
  } catch (e) {
    return defaultWorkspaces();
  }
}

/** 读取当前工作空间 id(不在列表中则回退第一个) */
function readActiveWorkspace(workspaces) {
  var stored = readStorage(K('active-workspace'));
  if (
    stored &&
    workspaces.some(function (w) {
      return w.id === stored;
    })
  ) {
    return stored;
  }
  return workspaces[0].id;
}

/** 按 id 查找工作空间(找不到回退第一个) */
function findWorkspace(list, id) {
  var arr = list && list.length ? list : DEFAULT_WORKSPACES;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === id) return arr[i];
  }
  return arr[0];
}

export {
  WORKSPACE_COLORS,
  WORKSPACE_ICONS,
  DEFAULT_WORKSPACES,
  defaultWorkspaces,
  slugify,
  uniqueWorkspaceId,
  normalizeWorkspace,
  workspaceDisplayName,
  readWorkspaces,
  readActiveWorkspace,
  findWorkspace,
};
