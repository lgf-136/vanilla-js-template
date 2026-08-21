/* hub-list.js — 路由列表渲染：行/徽章/标签胶囊/KV 行 */
import { filterChipHtml, filterCounts, filteredRoutes, moduleFilterHtml } from './hub-filters.js';
import { addTag } from './hub-groups-tags.js';
import { AUTH_META, authLabel, authMode, authTokenIcon, bookmarkIcon, esc, escAttr, groupById, icon, isPublic, memberships, routeKeyOf, t, tagById, view } from './hub-store.js';

'use strict';

  /* ---------- 渲染 ---------- */
  var METHOD_ORDER = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4, HEAD: 5, OPTIONS: 6 };
  function methodClass(m) {
    return 'hub-method-' + String(m || 'GET').toLowerCase();
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

export { METHOD_ORDER, chipHtml, fmtCount, kvRowsHtml, listHtml, methodClass, routeRowHtml, routeTagsHtml, routesHtml, tokenBadgeHtml };
