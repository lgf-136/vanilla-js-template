/* ============================================================
 * apihub 模块 — 入口装配（C5 拆分）
 * ------------------------------------------------------------
 * API Hub 管理台,三栏工作区:
 *   左栏  分组(多级)/ 标签(扁平彩色 # 标签)      → hub-groups-tags.js
 *   中栏  全部 API 路由(自动发现)                → hub-list.js / hub-filters.js
 *   右栏  请求构建器 + 响应查看 + 历史           → hub-builder.js
 * 数据与派生工具 → hub-store.js；配置变更动作 → hub-actions.js；
 * 弹窗 → hub-dialogs.js；事件委托 → hub-events.js；重绘控制 → hub-view.js。
 *
 * 本文件只负责：页面组装（pageHtml）、渲染函数注入（registerPainters）、
 * 深链处理与模块注册。业务实现见上述各文件。
 * 服务端配合 server/modules/apihub/service.js:公开开关与鉴权方式真正生效于
 * 每次 API 请求的门禁,而不只是前端展示。
 * 只依赖核心层 App.ui / App.icon / App.i18n / App.api / ctx 与同模块 hub-* 文件。
 * ============================================================ */
'use strict';

import {
  state,
  view,
  load,
  findRoute,
  setHashSelector,
  esc,
  escAttr,
  t,
  icon
} from './hub-store.js';
import { registerPainters } from './hub-view.js';
import { selectRoute } from './hub-builder.js';
import {
  ensureGroupTree,
  ensureTagTree,
} from './hub-groups-tags.js';
import { listHtml, routesHtml } from './hub-list.js';
import {
  loggingSettingsHtml,
  authDefaultsCompactHtml,
} from './hub-filters.js';
import {
  requestHtml,
  responseHtml,
  historyHtml,
  runHtml,
} from './hub-builder.js';
// 副作用导入：事件委托监听器在 hub-events 求值时注册（无导出被消费，勿删）
import './hub-events.js';

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

function sideHtml() {
  return '<div class="hub-side-scroll" data-hub-side>' + sideSectionsHtml() + '</div>';
}

/** 左栏区块：分组树 + 标签列表（组件实例由 hub-groups-tags 懒创建并常驻） */
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

/* ---------- 装配：向视图控制层注入渲染函数 ---------- */
registerPainters({
  page: pageHtml,
  list: routesHtml,
  side: sideSectionsHtml,
});
setHashSelector(applyHashSelection);

/* ---------- 内容挂载后初始化(懒加载数据) ---------- */
document.addEventListener('app:afterRender', function (ev) {
  var detail = ev.detail || {};
  if (detail.path === '/apihub' && !state.loaded && !state.error) {
    load();
  }
});

App.defineModule({ id: 'apihub', render: render });
