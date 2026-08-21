/* ============================================================
 * sp-notifications.js — 通知（开关行，数据实时同步 settings:notifications）
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

  /* ---------- 通知(数据实时同步数据库 settings:notifications) ---------- */
  /** 胶囊开关:视觉 span + 真实 checkbox(label 包裹点击切换,change 事件委托更新) */
  function switchRow(t, labelKey, descKey, on, disabled, setting) {
    return App.ui.switchRow({
      label: t(labelKey),
      desc: t(descKey),
      checked: on,
      disabled: disabled,
      setting: setting,
    });
  }

  function pageNotifications(ctx) {
    var t = ctx.t;
    var n = ctx.settings.notifications || {};
    // 自定义单选框(替代原生 radio):真实 input 隐藏,视觉用 .sp-radio-dot,
    // label 包裹点击即切换,change 事件委托仍由核心层处理(样式类 shadcn RadioGroup)。
    var radioItem = function (value, labelKey) {
      return (
        '<label class="sp-radio">' +
        '<input type="radio" class="sp-radio-input" name="notify-type" data-setting="notifications.type" value="' +
        value +
        '"' +
        (n.type === value ? ' checked' : '') +
        ' />' +
        '<span class="sp-radio-dot" aria-hidden="true"></span>' +
        '<span class="sp-label">' +
        t(labelKey) +
        '</span>' +
        '</label>'
      );
    };
    var body =
      '<form class="sp-form">' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('notifications.notifyLabel') +
      '</label>' +
      radioItem('all', 'notifications.type.all') +
      radioItem('mentions', 'notifications.type.mentions') +
      radioItem('none', 'notifications.type.none') +
      '</div>' +
      '<div>' +
      '<h3 class="mb-4 text-lg font-medium" style="font-family:var(--font-heading-base,inherit)">' +
      t('notifications.emailSection') +
      '</h3>' +
      '<div style="display:flex;flex-direction:column;gap:1rem">' +
      switchRow(
        t,
        'notifications.communication.label',
        'notifications.communication.description',
        !!n.communication,
        false,
        'notifications.communication'
      ) +
      switchRow(
        t,
        'notifications.marketing.label',
        'notifications.marketing.description',
        !!n.marketing,
        false,
        'notifications.marketing'
      ) +
      switchRow(
        t,
        'notifications.social.label',
        'notifications.social.description',
        !!n.social,
        false,
        'notifications.social'
      ) +
      switchRow(
        t,
        'notifications.security.label',
        'notifications.security.description',
        true,
        true,
        'notifications.security'
      ) +
      '</div></div>' +
      // 自定义复选框(替代原生 checkbox):样式复用显示页 .sp-checkbox,
      // 真实 input 隐藏,label 包裹点击切换,change 事件委托由核心层处理。
      '<label class="sp-checkbox-row">' +
      '<input type="checkbox" class="sp-checkbox-input" data-setting="notifications.mobile"' +
      (n.mobile ? ' checked' : '') +
      ' />' +
      '<span class="sp-checkbox">' +
      icon().iconSvg('check', { class: 'size-3' }) +
      '</span>' +
      '<div class="sp-switch-info" style="gap:0.25rem">' +
      '<span class="sp-label" style="line-height:1.5">' +
      t('notifications.mobile.label') +
      '</span>' +
      '<p class="sp-field-desc">' +
      t('notifications.mobile.descriptionBefore') +
      ' <a href="#/settings" data-link="/settings">' +
      t('notifications.mobile.mobileSettings') +
      '</a> ' +
      t('notifications.mobile.descriptionAfter') +
      '</p>' +
      '</div></label>' +
      '<button type="button" data-slot="button" class="' +
      App.ui.buttonClass('default') +
      '">' +
      t('notifications.submit') +
      '</button>' +
      '</form>';
    return contentSection(t, 'notifications.title', 'notifications.description', body);
  }

export { pageNotifications };
