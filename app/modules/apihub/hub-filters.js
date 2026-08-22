/* hub-filters.js — 过滤/模块筛选/右键菜单/日志与默认鉴权面板 */
import { copyLink } from './hub-dialogs.js';
import { METHOD_ORDER, fmtCount } from './hub-list.js';
import { authLabel, descendants, esc, escAttr, findRoute, icon, isPublic, memberships, moduleOf, routeKeyOf, state, t, view } from './hub-store.js';

'use strict';

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
      '<div class="hub-dd-menu hub-logmenu" data-dropdown-menu style="right: 0;left: auto;min-width: calc(var(--spacing) * 68)">' +
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
      '<div class="hub-dd-menu" data-dropdown-menu style="right: 0;left: auto;min-width: calc(var(--spacing) * 48)">' +
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
        ? '<div class="hub-dd-label" style="padding-top: calc(var(--spacing) * 1.5)">' +
          esc(t('apihub.defaultApiKey')) +
          '</div>' +
          '<input type="password" class="' + App.ui.inputClass() + '" data-hub-default-apikey placeholder="' +
          escAttr(t('apihub.defaultApiKey')) +
          '" value="' +
          escAttr(state.secrets.defaultApiKey || '') +
          '" style="width:calc(100% - var(--spacing) * 2);margin: 0 calc(var(--spacing) * 1) calc(var(--spacing) * 1)" />'
        : '') +
      '</div></span>'
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
      '<div class="hub-dd-menu" data-dropdown-menu style="left: 0;right: auto;min-width: calc(var(--spacing) * 40)">' +
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

export { authDefaultsCompactHtml, closeRouteCtxPopup, filterChipHtml, filterCounts, filteredRoutes, loggingSettingsHtml, matchesBase, moduleFilterHtml, moduleFilters, routeCtxItemsHtml, routeCtxPopup };
