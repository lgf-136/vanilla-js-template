/* ============================================================
 * sp-profile.js — 个人资料（头像选择器 + 资料表单，数据实时同步 settings:profile，邮箱落库前加密）
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

  /* ---------- 头像选择器(首字母 / 图标 / Emoji / 上传图片;交互由 app/components/ui/avatar.js 处理) ---------- */
  function avatarSection(t, p) {
    var avatar = App.settings.sanitizeAvatar(p.avatar);
    var type = avatar.type;
    var S = App.settings;
    var tabs = S.AVATAR_TYPES.map(function (tp) {
      return (
        '<button type="button" data-avatar-type="' +
        tp +
        '" class="sp-avatar-tab' +
        (type === tp ? ' is-active' : '') +
        '">' +
        t('avatar.type.' + tp) +
        '</button>'
      );
    }).join('');
    var iconGrid = S.AVATAR_ICONS.map(function (name) {
      return (
        '<button type="button" data-avatar-icon="' +
        name +
        '" class="sp-avatar-opt' +
        (type === 'icon' && avatar.value === name ? ' is-active' : '') +
        '" data-tip="' +
        name +
        '">' +
        icon().iconSvg(name) +
        '</button>'
      );
    }).join('');
    var emojiGrid = S.AVATAR_EMOJIS.map(function (em) {
      return (
        '<button type="button" data-avatar-emoji="' +
        em +
        '" class="sp-avatar-opt' +
        (type === 'emoji' && avatar.value === em ? ' is-active' : '') +
        '">' +
        em +
        '</button>'
      );
    }).join('');
    var opt = function (tp, inner) {
      return (
        '<div data-avatar-opt="' +
        tp +
        '"' +
        (type === tp ? '' : ' style="display:none"') +
        '>' +
        inner +
        '</div>'
      );
    };
    return (
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('avatar.title') +
      '</label>' +
      '<div class="sp-avatar-row">' +
      '<span class="shrink-0">' +
      App.ui.avatarHtml(p, 'sp-avatar-lg', true) +
      '</span>' +
      '<div class="sp-avatar-col">' +
      '<div class="sp-avatar-tabs">' +
      tabs +
      '</div>' +
      opt('initial', '<p class="sp-field-desc">' + t('avatar.initialDesc') + '</p>') +
      opt(
        'icon',
        '<p class="sp-field-desc">' +
          t('avatar.iconDesc') +
          '</p>' +
          '<div class="sp-avatar-grid">' +
          iconGrid +
          '</div>'
      ) +
      opt(
        'emoji',
        '<p class="sp-field-desc">' +
          t('avatar.emojiDesc') +
          '</p>' +
          '<div class="sp-avatar-grid">' +
          emojiGrid +
          '</div>'
      ) +
      opt(
        'image',
        '<p class="sp-field-desc">' +
          t('avatar.imageDesc') +
          '</p>' +
          '<div class="sp-avatar-upload">' +
          '<input type="file" data-avatar-file accept="image/*" style="display:none" />' +
          '<button type="button" data-avatar-upload data-slot="button" class="' +
          App.ui.buttonClass('outline', 'sm') +
          '">' +
          icon().iconSvg('image-plus', { class: 'size-4' }) +
          t('avatar.upload') +
          '</button>' +
          '</div>' +
          '<p class="sp-avatar-error" data-avatar-error></p>'
      ) +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  /* ---------- 个人资料(数据实时同步数据库 settings:profile,邮箱落库前加密) ---------- */
  function pageProfile(ctx) {
    var t = ctx.t;
    var p = ctx.settings.profile || {};
    var links = Array.isArray(p.links) && p.links.length ? p.links : ['', ''];
    var body =
      '<form class="sp-form">' +
      avatarSection(t, p) +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('profile.username.label') +
      '</label>' +
      '<input class="' + App.ui.inputClass() + '" type="text" data-setting="profile.username" value="' +
      escAttr(p.username) +
      '" placeholder="' +
      t('profile.username.placeholder') +
      '" />' +
      '<p class="sp-field-desc">' +
      t('profile.username.description') +
      '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('profile.email.label') +
      '</label>' +
      '<input class="' + App.ui.inputClass() + '" type="email" data-setting="profile.email" value="' +
      escAttr(p.email) +
      '" placeholder="' +
      t('profile.email.placeholder') +
      '" />' +
      '<p class="sp-field-desc">' +
      t('profile.email.descriptionBefore') +
      ' <a href="#/settings" data-link="/settings">' +
      t('profile.email.emailSettings') +
      '</a>.</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('profile.bio.label') +
      '</label>' +
      '<textarea class="' + App.ui.inputClass() + '" data-setting="profile.bio" placeholder="' +
      t('profile.bio.placeholder') +
      '">' +
      escHtml(p.bio || '') +
      '</textarea>' +
      '<p class="sp-field-desc">' +
      t('profile.bio.descriptionBefore') +
      ' <span>' +
      t('profile.bio.mention') +
      '</span> ' +
      t('profile.bio.descriptionAfter') +
      '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('profile.urls.label') +
      '</label>' +
      '<p class="sp-field-desc">' +
      t('profile.urls.description') +
      '</p>' +
      '<input class="' + App.ui.inputClass() + '" type="url" data-setting="profile.links.0" value="' +
      escAttr(links[0]) +
      '" />' +
      '<input class="' + App.ui.inputClass() + '" type="url" data-setting="profile.links.1" value="' +
      escAttr(links[1]) +
      '" />' +
      '<button type="button" data-slot="button" class="' +
      App.ui.buttonClass('outline', 'sm') +
      '">' +
      t('profile.urls.add') +
      '</button>' +
      '</div>' +
      '<button type="button" data-slot="button" class="' +
      App.ui.buttonClass('default') +
      '">' +
      t('profile.submit') +
      '</button>' +
      '</form>';
    return contentSection(t, 'profile.title', 'profile.description', body);
  }

  /** 统一转义（shared/escape.js，红线 13） */

export { pageProfile };
