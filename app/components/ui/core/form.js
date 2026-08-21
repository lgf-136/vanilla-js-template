/* ============================================================
 * form.js — 表单族控件（ui.js ESM 拆分，拆分设计总览见 ../index.js 头注）
 * ------------------------------------------------------------
 * 职责：inputClass 输入框类 / switchRow 开关行（label+描述+胶囊开关）/
 *       avatarHtml 个人资料头像渲染（图片/Emoji/图标/首字母）。
 * 依赖 utils.js 的 cn 与转义别名；运行期消费 App.icon / App.settings。
 * 对外挂载统一由 core/index.js 完成。
 * ============================================================ */
'use strict';

import { cn, escAttr, escHtml } from './utils.js';

  // ---------- Input(表单输入框/文本域;各模块统一使用) ----------
  function inputClass(extra) {
    return cn('ui-input', extra);
  }

  // ---------- Switch(开关行:label + 描述 + 胶囊开关;label 包裹隐藏 checkbox) ----------
  /** opts: { label, desc, checked, disabled, setting } */
  function switchRow(opts) {
    var o = opts || {};
    return (
      '<label class="ui-switch-row">' +
      '<div class="ui-switch-info">' +
      '<span class="ui-switch-label">' +
      o.label +
      '</span>' +
      (o.desc ? '<p class="ui-switch-desc">' + o.desc + '</p>' : '') +
      '</div>' +
      '<span role="switch" aria-checked="' +
      (o.checked ? 'true' : 'false') +
      '" class="ui-switch' +
      (o.checked ? ' is-on' : '') +
      (o.disabled ? ' is-disabled' : '') +
      '"></span>' +
      '<input type="checkbox" class="ui-switch-input" data-setting="' +
      o.setting +
      '"' +
      (o.checked ? ' checked' : '') +
      (o.disabled ? ' disabled' : '') +
      ' />' +
      '</label>'
    );
  }

  // ---------- Avatar(个人资料头像:首字母/图标/Emoji/上传图片) ----------
  /** 渲染用户头像:image → 图片;emoji → 底色圆;icon → 图标圆;其余 → 用户名/邮箱首字母 */
  function avatarHtml(profile, sizeClass, large) {
    var avatar = profile && profile.avatar;
    var type = avatar && avatar.type;
    var value = avatar && typeof avatar.value === 'string' ? avatar.value : '';
    var base =
      'flex shrink-0 items-center justify-center overflow-hidden rounded-full ' +
      (sizeClass || 'size-8');
    if (type === 'image' && value.indexOf('data:image/') === 0) {
      return (
        '<span class="' +
        base +
        ' bg-muted"><img src="' +
        escAttr(value) +
        '" alt="" style="width:100%;height:100%;object-fit:cover" /></span>'
      );
    }
    if (type === 'emoji' && value) {
      return (
        '<span class="' +
        base +
        ' bg-primary/10" style="font-size:' +
        (large ? '2.5rem' : '1.25rem') +
        '">' +
        escHtml(value) +
        '</span>'
      );
    }
    if (type === 'icon') {
      var iconName = App.settings.AVATAR_ICONS.indexOf(value) !== -1 ? value : 'user';
      return (
        '<span class="' +
        base +
        ' bg-primary text-primary-foreground">' +
        App.icon.iconSvg(iconName, { class: large ? 'size-8' : 'size-4' }) +
        '</span>'
      );
    }
    var source = (profile && (profile.username || profile.email)) || 'A';
    var letter = (source.trim().charAt(0) || 'A').toUpperCase();
    return (
      '<span class="' +
      base +
      ' bg-primary text-sm font-semibold text-primary-foreground"' +
      (large ? ' style="font-size:1.75rem"' : '') +
      '>' +
      escHtml(letter) +
      '</span>'
    );
  }

export { inputClass, switchRow, avatarHtml };
