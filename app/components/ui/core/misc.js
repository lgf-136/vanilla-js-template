/* ============================================================
 * misc.js — 杂项渲染（ui.js ESM 拆分，拆分设计总览见 ../index.js 头注）
 * ------------------------------------------------------------
 * 职责：emptyState 空状态（反留白铁律 3.6）/ placeholderCard 子页面占位卡 /
 *       notFound 未知路由 404 兜底 / tagPill·tagPills 彩色标签胶囊
 *       （分组/标签筛选通用）。
 * 依赖 utils.js 的类生成器与转义别名；运行期消费 App.icon 与
 * App.ui.color.resolveColor；对外挂载统一由 core/index.js 完成。
 * ============================================================ */
'use strict';

import {
  badgeClass,
  buttonClass,
  cardClass,
  cardContentClass,
  escAttr,
  escHtml,
} from './utils.js';

  // ---------- 空状态(图标 + 标题 + 描述 + 可选操作;遵循反留白铁律 3.6) ----------
  /** opts: { icon, title, desc, actionHtml, fill } — 各模块空列表/空结果统一使用 */
  function emptyState(opts) {
    var o = opts || {};
    return (
      '<div class="ui-empty' +
      (o.fill ? ' ui-empty-fill' : '') +
      '">' +
      (o.icon
        ? '<div class="ui-empty-icon">' +
          App.icon.iconSvg(o.icon, { class: 'size-8' }) +
          '</div>'
        : '') +
      (o.title ? '<h1 class="ui-empty-title">' + o.title + '</h1>' : '') +
      (o.desc ? '<p class="ui-empty-desc">' + o.desc + '</p>' : '') +
      (o.actionHtml ? o.actionHtml : '') +
      '</div>'
    );
  }

  // ---------- 通用页面渲染 ----------
  /** 子页面占位卡(渠道/令牌/日志/系统等模块共用) */
  function placeholderCard(t, icon, title, desc) {
    return (
      '<div class="mx-auto flex max-w-3xl flex-col gap-6">' +
      '<div data-slot="card" data-size="default" class="' +
      cardClass('') +
      '">' +
      '<div class="' +
      cardContentClass('flex flex-col items-center gap-4 py-16 text-center') +
      '">' +
      '<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">' +
      App.icon.iconSvg(icon, { class: 'size-8' }) +
      '</div>' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">' +
      title +
      '</h1>' +
      '<p class="max-w-md text-sm text-muted-foreground">' +
      desc +
      '</p>' +
      '<span data-slot="badge" data-variant="secondary" class="' +
      badgeClass('secondary') +
      '">' +
      t('placeholder.wip') +
      '</span>' +
      '<a href="#/" data-link="/" class="mt-2"><button type="button" data-slot="button" class="' +
      buttonClass('outline') +
      '">' +
      App.icon.iconSvg('arrow-left', { class: 'size-4' }) +
      t('placeholder.back') +
      '</button></a>' +
      '</div></div></div>'
    );
  }

  /** 未知路由 404 兜底 */
  function notFound(t) {
    return (
      '<div class="mx-auto flex max-w-3xl flex-col gap-6">' +
      '<div data-slot="card" data-size="default" class="' +
      cardClass('') +
      '">' +
      '<div class="' +
      cardContentClass('flex flex-col items-center gap-4 py-16 text-center') +
      '">' +
      '<div class="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">' +
      App.icon.iconSvg('file-question', { class: 'size-8' }) +
      '</div>' +
      '<h1 class="font-heading text-2xl font-semibold tracking-tight">404</h1>' +
      '<p class="max-w-md text-sm text-muted-foreground">' +
      t('notFound.desc') +
      '</p>' +
      '<a href="#/" data-link="/" class="mt-2"><button type="button" data-slot="button" class="' +
      buttonClass('outline') +
      '">' +
      t('placeholder.back') +
      '</button></a>' +
      '</div></div></div>'
    );
  }

  // ---------- Tag Pill(彩色标签胶囊: # 前缀 + 名称 + 可移除按钮;分组/标签筛选通用) ----------
  /** opts: { name, color, tip, removeAttrs, removeLabel } */
  function tagPill(opts) {
    var o = opts || {};
    var col = '';
    try {
      col = App.ui.color.resolveColor(o.color);
    } catch (e) {
      /* noop */
    }
    return (
      '<span class="ui-tagpill"' +
      (col ? ' style="--tagc:' + col + ';"' : '') +
      (o.tip ? ' data-tip="' + escAttr(o.tip) + '"' : '') +
      '>' +
      '<span class="ui-tagpill-hash">#</span>' +
      escHtml(o.name) +
      (o.removeAttrs
        ? '<button type="button" class="ui-tagpill-x" ' +
          o.removeAttrs +
          ' aria-label="' +
          escAttr(
            o.removeLabel ||
              App.i18n.makeT(document.documentElement.lang || App.i18n.DEFAULT_LOCALE)('common.remove')
          ) +
          '"' +
          (o.tip ? ' data-tip="' + escAttr(o.tip) + '"' : '') +
          '>' +
          App.icon.iconSvg('x', { class: 'size-2.5' }) +
          '</button>'
        : '') +
      '</span>'
    );
  }
  /** 标签胶囊容器(横向排列,超出隐藏) */
  function tagPills(innerHtml) {
    return '<span class="ui-tagpills">' + innerHtml + '</span>';
  }

export { emptyState, placeholderCard, notFound, tagPill, tagPills };
