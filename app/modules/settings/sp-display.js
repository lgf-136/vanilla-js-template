/* ============================================================
 * sp-display.js — 显示（侧边栏显示控制：勾选实时控制侧边栏可见性，设置项锁定）
 * ------------------------------------------------------------
 * 设置项独立文件（一设置项一文件，见 index.js 拆分设计说明）。
 * ============================================================ */
'use strict';

import { contentSection } from './sp-common.js';

  var S = function () {
    return App.settings;
  };
  var icon = function () {
    return App.icon;
  };
  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;
  var escAttr = App.escape.escAttr;
  var escHtml = App.escape.escHtml;

  /* ---------- 显示(侧边栏显示控制:勾选实时控制侧边栏可见性,设置项锁定) ---------- */
  /** 单行渲染(父级 data-nav-toggle=id,子级 data-nav-toggle=parent:child,均可独立显隐) */
  function displayRow(t, navId, label, ic, checked, locked, sub) {
    return (
      '<button type="button" data-nav-toggle="' +
      navId +
      '" class="sp-display-item' +
      (sub ? ' is-sub' : '') +
      (locked ? ' is-locked' : '') +
      (checked ? '' : ' is-hidden') +
      '">' +
      '<span class="sp-checkbox' +
      (checked ? ' is-checked' : '') +
      '">' +
      (checked ? icon().iconSvg('check', { class: 'size-3' }) : '') +
      '</span>' +
      '<span class="sp-item-icon">' +
      icon().iconSvg(ic) +
      '</span>' +
      '<span class="sp-item-title">' +
      label +
      '</span>' +
      (locked
        ? '<span class="sp-lock">' + icon().iconSvg('lock') + t('display.locked') + '</span>'
        : '') +
      '</button>'
    );
  }

  function pageDisplay(ctx) {
    var t = ctx.t;
    var hidden = ctx.settings.hiddenNav || [];
    // 用不过滤的完整列表(含全部二级菜单),隐藏项也要能在此重新显示;
    // 列表来自模块注册表(App.buildAllNavItems),新增模块/子模块自动出现,无需硬编码。
    var items = App.buildAllNavItems(ctx.settings.locale);
    var rows = [];
    items.forEach(function (item) {
      var locked = item.id === 'settings';
      rows.push(
        displayRow(t, item.id, item.title, item.icon, hidden.indexOf(item.id) === -1, locked, false)
      );
      (item.children || []).forEach(function (c) {
        var navId = item.id + ':' + c.id;
        rows.push(
          displayRow(t, navId, c.title, 'chevron-right', hidden.indexOf(navId) === -1, false, true)
        );
      });
    });
    var body =
      '<div class="sp-display-group">' +
      '<h4>' +
      t('display.sidebar.label') +
      '</h4>' +
      '<div class="sp-display-items">' +
      rows.join('') +
      '</div>' +
      '</div>' +
      '<p class="sp-display-hint">' +
      t('display.lockHint') +
      '</p>' +
      '<p class="sp-display-hint">' +
      t('display.submenuHint') +
      '</p>';
    return contentSection(t, 'display.title', 'display.description', body);
  }

export { pageDisplay };
