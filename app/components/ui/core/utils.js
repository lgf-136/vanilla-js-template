/* ============================================================
 * utils.js — App.ui kit 基础工具 + BUTTON/BADGE/CARD 类生成器
 * ------------------------------------------------------------
 * 职责（ui.js ESM 拆分，拆分设计总览见 ../index.js 头注）：
 *   - cn：HTML class 属性拼接（转义双引号，避免破坏属性边界）
 *   - escAttr / escHtml：shared/escape.js 别名转发（红线 13 唯一实现收敛），
 *     供本目录各控件族引用，保持 App.ui 公共 API 不变
 *   - BUTTON / BADGE / CARD / Toggle 类名生成器（纯字符串函数，无副作用）
 * 本文件是 core/ 最底层模块，被 form / dropdown / feedback /
 * context-menu / misc 共同消费；对外挂载统一由 core/index.js 完成。
 * ============================================================ */
'use strict';

  /** 拼接 HTML class 属性值:转义双引号,避免破坏 HTML 属性边界 */
  function cn() {
    var parts = Array.prototype.slice.call(arguments);
    return parts.filter(Boolean).join(' ').replace(/"/g, '&quot;');
  }

  // 统一转义入口：实现收敛在 shared/escape.js（红线 13），此处仅转发以保持 App.ui 公共 API 不变
  var escAttr = App.escape.escAttr;
  var escHtml = App.escape.escHtml;

  // ---------- Button ----------
  var BUTTON_BASE =
    'group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4';
  var BUTTON_VARIANTS = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    outline:
      'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
    ghost:
      'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
    destructive:
      'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
  };
  var BUTTON_SIZES = {
    default:
      'h-8 gap-1.5 rounded-lg px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
    sm: 'h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem]! in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*="size-"])]:size-3.5',
    lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
    icon: 'size-8',
    'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
  };
  function buttonClass(variant, size, extra) {
    return cn(
      BUTTON_BASE,
      BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.default,
      BUTTON_SIZES[size] || BUTTON_SIZES.default,
      extra
    );
  }
  function buttonIcon(variant, size, icon, extra) {
    return (
      '<button type="button" data-slot="button" class="' +
      buttonClass(variant, size, extra) +
      '">' +
      App.icon.iconSvg(icon, { class: 'size-4' }) +
      '</button>'
    );
  }

  // ---------- Badge ----------
  var BADGE_BASE =
    'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!';
  var BADGE_VARIANTS = {
    default: 'border-transparent bg-primary text-primary-foreground [a]:hover:bg-primary/80',
    secondary:
      'border-transparent bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
    outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
    destructive:
      'border-transparent bg-destructive/10 text-destructive [a]:hover:bg-destructive/20 dark:bg-destructive/20 dark:[a]:hover:bg-destructive/30',
  };
  function badgeClass(variant, extra) {
    return cn(BADGE_BASE, BADGE_VARIANTS[variant] || BADGE_VARIANTS.secondary, extra);
  }

  // ---------- Card ----------
  var CARD_BASE =
    'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl';
  function cardClass(extra) {
    return cn(CARD_BASE, extra);
  }
  function cardHeaderClass(extra) {
    return cn(
      'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
      extra
    );
  }
  function cardTitleClass(extra) {
    return cn(
      'font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
      extra
    );
  }
  function cardContentClass(extra) {
    return cn('px-(--card-spacing)', extra);
  }

  // ---------- Toggle / ToggleGroup ----------
  function toggleItemClass(pressed, extra) {
    return cn(
      'group/toggle inline-flex items-center justify-center gap-1 text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
      'border border-input bg-transparent hover:bg-muted',
      pressed ? 'bg-muted' : '',
      extra
    );
  }

export {
  cn,
  escAttr,
  escHtml,
  buttonClass,
  buttonIcon,
  badgeClass,
  cardClass,
  cardHeaderClass,
  cardTitleClass,
  cardContentClass,
  toggleItemClass,
};
