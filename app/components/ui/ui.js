/* ============================================================
 * ui.js — 共享 UI 组件(零依赖)
 * ------------------------------------------------------------
 * 供所有模块复用的组件 class 与通用页面渲染:
 * button / badge / card / toggle / dropdown / placeholder / 404
 * 模块之间互不引用,只依赖本核心层
 * ============================================================ */
(function () {
  'use strict';

  /** 拼接 HTML class 属性值:转义双引号,避免破坏 HTML 属性边界 */
  function cn() {
    var parts = Array.prototype.slice.call(arguments);
    return parts.filter(Boolean).join(' ').replace(/"/g, '&quot;');
  }

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

  // ---------- Dropdown ----------
  function dropdownTriggerClass(extra) {
    return cn(
      'group/dropdown-menu-trigger inline-flex items-center justify-center rounded-lg outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
      extra
    );
  }
  function dropdownContentClass(width) {
    return cn(
      'hidden absolute z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
      width
    );
  }
  function dropdownItemClass(extra) {
    return cn(
      'group/dropdown-menu-item flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus-visible:bg-accent focus-visible:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
      extra
    );
  }
  function dropdownLabelClass(extra) {
    return cn('px-2 py-1.5 text-sm font-semibold text-muted-foreground', extra);
  }
  function dropdownSeparator() {
    return '<div role="separator" data-slot="dropdown-menu-separator" class="-mx-1 my-1 h-px bg-border"></div>';
  }

  // ---------- Avatar(个人资料头像:首字母/图标/Emoji/上传图片) ----------
  // 统一转义入口：实现收敛在 shared/escape.js（红线 13），此处仅转发以保持 App.ui 公共 API 不变
  var escAttr = App.escape.escAttr;
  var escHtml = App.escape.escHtml;
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

  // ---------- Radio-group 卡片(设置面板与外观页共用,样式见 app.css .rg-*) ----------
  var RG_GRID_COLS = {
    2: 'rg-cols-2',
    3: 'rg-cols-3',
    4: 'rg-cols-4',
    6: 'rg-cols-6',
    7: 'rg-cols-7',
  };
  function rgGridClass(cols) {
    return 'rg-grid ' + (RG_GRID_COLS[cols] || 'rg-cols-3');
  }
  function radioSectionTitle(label) {
    return '<div class="rg-section-title"><span>' + label + '</span></div>';
  }
  /** 带启用开关的标题行(基础色/强调色):开关在标题同一行右侧,kind ∈ base|chart */
  function radioSectionTitleToggle(label, checked, kind, ariaLabel) {
    return (
      '<div class="rg-section-title">' +
      '<span>' +
      label +
      '</span>' +
      '<button type="button" role="switch" aria-checked="' +
      (checked ? 'true' : 'false') +
      '" aria-label="' +
      (ariaLabel || label) +
      '" data-theme-toggle="' +
      kind +
      '" class="ui-switch ms-auto' +
      (checked ? ' is-on' : '') +
      '"></button>' +
      '</div>'
    );
  }
  function radioCheck(selected) {
    return selected
      ? '<span class="rg-opt-check">' + App.icon.iconSvg('circle-check') + '</span>'
      : '';
  }
  /** 图标预览卡(主题/侧边栏/布局):选中描边 ring-primary + 阴影 + 对勾徽标 */
  function radioIconCard(iconName, label, selected, isTheme, extra) {
    var fill = isTheme
      ? ''
      : selected
        ? 'fill-primary stroke-primary'
        : 'fill-muted-foreground stroke-muted-foreground';
    return (
      '<button type="button" data-settings-card="' +
      extra +
      '" aria-pressed="' +
      selected +
      '" class="rg-opt' +
      (selected ? ' is-active' : '') +
      '">' +
      '<span class="rg-opt-frame">' +
      radioCheck(selected) +
      App.icon.previewIcon(iconName, fill) +
      '</span>' +
      '<span class="rg-opt-label">' +
      label +
      '</span>' +
      '</button>'
    );
  }
  /** 色板卡(基础色/强调色):bordered 卡片 + 对勾徽标 */
  function radioSwatchPicker(current, options, cols, kind) {
    return (
      '<div class="' +
      rgGridClass(cols) +
      '">' +
      options
        .map(function (c) {
          var sel = current === c;
          return (
            '<button type="button" data-swatch="' +
            kind +
            '" data-value="' +
            c +
            '" aria-pressed="' +
            sel +
            '" class="rg-opt' +
            (sel ? ' is-active' : '') +
            '">' +
            '<span class="rg-opt-swatch">' +
            radioCheck(sel) +
            '<span class="rg-opt-dot swatch-' +
            c +
            '"></span>' +
            '<span class="rg-opt-swatch-label">' +
            c +
            '</span>' +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }
  /** 文本卡(风格/字体/圆角/菜单):h-14 描边卡片 + 对勾徽标 */
  function radioSegmented(options, current, cols, kind) {
    return (
      '<div class="' +
      rgGridClass(cols) +
      '">' +
      options
        .map(function (o) {
          var sel = current === o.value;
          return (
            '<button type="button" data-segmented="' +
            kind +
            '" data-value="' +
            o.value +
            '" aria-pressed="' +
            sel +
            '" class="rg-opt' +
            (sel ? ' is-active' : '') +
            '">' +
            '<span class="rg-opt-text">' +
            radioCheck(sel) +
            '<span class="text-sm font-medium">' +
            o.label +
            '</span>' +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }
  /** 只读信息行(图标库/菜单强调色等) */
  function radioReadonlyRow(label, value) {
    return (
      '<div class="flex items-center justify-between">' +
      '<span class="text-sm font-semibold text-muted-foreground">' +
      label +
      '</span>' +
      '<span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">' +
      value +
      '</span>' +
      '</div>'
    );
  }

  // 自定义下拉菜单(shadcn 风格)悬停/按下反馈:编译产物(app.css)仅含 :focus
  // 规则且依赖 Radix 的 data-highlighted,本项目自定义下拉不写该属性,
  // 因此补充 hover / active / focus-visible 三态(仅作用于本项目的下拉菜单项)。
  (function injectDropdownStyles() {
    if (!document.head) return;
    var style = document.createElement('style');
    style.setAttribute('data-dropdown-style', '');
    style.textContent =
      '[data-dropdown-trigger][aria-expanded="true"]{background-color:var(--sidebar-accent);color:var(--sidebar-accent-foreground)}' +
      '[data-dropdown-menu] [class~="group/dropdown-menu-item"]:hover{background-color:var(--accent);color:var(--accent-foreground)}' +
      '[data-dropdown-menu] [class~="group/dropdown-menu-item"]:active{background-color:color-mix(in oklab,var(--accent) 78%,var(--muted));color:var(--accent-foreground)}' +
      '[data-dropdown-menu] [class~="group/dropdown-menu-item"]:focus-visible{background-color:var(--accent);color:var(--accent-foreground)}';
    document.head.appendChild(style);
  })();

  // ---------- Toast(轻提示,类 shadcn sonner 风格;各模块共用) ----------
  function toast(message, type) {
    if (!document.body) return;
    var holder = document.querySelector('[data-toast-region]');
    if (!holder) {
      holder = document.createElement('div');
      holder.setAttribute('data-toast-region', '');
      holder.className =
        'fixed top-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2';
      document.body.appendChild(holder);
    }
    var el = document.createElement('div');
    el.setAttribute('data-toast', '');
    el.setAttribute('data-variant', type === 'error' ? 'error' : 'default');
    el.className =
      'flex items-start gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10';
    el.innerHTML =
      '<svg class="mt-0.5 size-4 shrink-0 ' +
      (type === 'error' ? 'text-destructive' : 'text-primary') +
      '" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>' +
      '<span class="flex-1 leading-5">' +
      String(message == null ? '' : message)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;') +
      '</span>';
    holder.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    }, 2600);
  }

  // ---------- Dialog(模态弹窗,类 shadcn Dialog;替代 window.confirm/prompt) ----------
  /** opts: { head, body, foot, closeLabel } — 返回 overlay 元素,调用方可继续绑定事件 */
  function dialog(opts) {
    var hadOpen = !!document.querySelector('[data-dialog-overlay]');
    closeDialog();
    var o = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.setAttribute('data-dialog-overlay', '');
    overlay.innerHTML =
      '<div class="ui-dialog" role="dialog" aria-modal="true">' +
      '<div class="ui-dialog-head">' +
      '<div class="ui-dialog-head-main">' +
      (o.head || '') +
      '</div>' +
      '<button type="button" class="ui-dialog-close" data-dialog-close aria-label="' +
      escAttr(o.closeLabel || 'Close') +
      '">' +
      App.icon.iconSvg('x', { class: 'size-4' }) +
      '</button>' +
      '</div>' +
      (o.body != null ? '<div class="ui-dialog-body">' + o.body + '</div>' : '') +
      (o.foot != null ? '<div class="ui-dialog-foot">' + o.foot + '</div>' : '') +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (
        e.target === overlay ||
        (e.target.closest && e.target.closest('[data-dialog-close]'))
      ) {
        closeDialog();
      }
    });
    if (!hadOpen) {
      var focusable = overlay.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) focusable.focus();
    }
    return overlay;
  }

  /** 关闭当前弹窗(幂等) */
  function closeDialog() {
    var ov = document.querySelector('[data-dialog-overlay]');
    if (ov) ov.remove();
  }

  // Esc 关闭弹窗/上下文菜单(全局单例监听;仅在存在浮层时生效)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeDialog();
      contextMenuClose();
    }
  });

  // ---------- Context Menu(右键 / ⋯ 按钮浮层菜单,body 级 fixed;分组/标签赋值等通用) ----------
  var ctxPop = null;
  /** 菜单项:opts = { attrs, isOn, danger, check, caret, hashColor } */
  function ctxItem(iconName, label, opts) {
    var o = opts || {};
    return (
      '<button type="button" class="ui-ctxitem' +
      (o.isOn ? ' is-on' : '') +
      (o.danger ? ' is-danger' : '') +
      '"' +
      (o.attrs ? ' ' + o.attrs : '') +
      '>' +
      (o.hashColor
        ? '<span class="ui-ctx-hash" style="color:' + escAttr(o.hashColor) + '">#</span>'
        : iconName
          ? App.icon.iconSvg(iconName, { class: 'size-3.5' })
          : '') +
      escHtml(label) +
      (o.check ? '<span class="ui-ctx-check">' + App.icon.iconSvg('check') + '</span>' : '') +
      (o.caret ? '<span class="ui-ctx-caret">' + App.icon.iconSvg('chevron-right') + '</span>' : '') +
      '</button>'
    );
  }
  function ctxSeparator() {
    return '<div class="ui-ctxsep"></div>';
  }
  /** 子菜单:父项 hover 展开右侧子面板 */
  function ctxSubmenu(label, iconName, itemsHtml) {
    return (
      '<div class="ui-ctxwrap">' +
      '<button type="button" class="ui-ctxitem ui-ctxparent" tabindex="-1">' +
      (iconName ? App.icon.iconSvg(iconName, { class: 'size-3.5' }) : '') +
      escHtml(label) +
      '<span class="ui-ctx-caret">' +
      App.icon.iconSvg('chevron-right') +
      '</span>' +
      '</button>' +
      '<div class="ui-ctxsubmenu">' +
      itemsHtml +
      '</div>' +
      '</div>'
    );
  }
  function ctxEmpty(text) {
    return '<div class="ui-ctxempty">' + escHtml(text) + '</div>';
  }
  /** 打开浮层菜单:opts = { anchorEl, x, y, className, keepOpenOn, onClose };返回 popup 元素 */
  function contextMenuOpen(html, opts) {
    contextMenuClose();
    var o = opts || {};
    ctxPop = document.createElement('div');
    ctxPop.className = 'ui-ctxpop' + (o.className ? ' ' + o.className : '');
    ctxPop.setAttribute('data-ctxpop', '');
    ctxPop.innerHTML = html;
    // keepOpenOn:该选择器内点击不触发外部关闭(交由宿主切换收起);onClose:关闭后回调(宿主清理状态)
    ctxPop._keepOpenOn = o.keepOpenOn || '';
    ctxPop._onClose = typeof o.onClose === 'function' ? o.onClose : null;
    document.body.appendChild(ctxPop);
    var w = ctxPop.offsetWidth || 200;
    var h = ctxPop.offsetHeight || 260;
    var left, top;
    if (o.anchorEl && o.anchorEl.getBoundingClientRect) {
      var rect = o.anchorEl.getBoundingClientRect();
      left = rect.right - w;
      top = rect.bottom + 4;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4);
    } else {
      left = Math.max(4, o.x || 0);
      top = Math.max(4, o.y || 0);
    }
    ctxPop.style.left = left + 'px';
    ctxPop.style.top = top + 'px';
    return ctxPop;
  }
  function contextMenuClose() {
    if (ctxPop && ctxPop.parentNode) ctxPop.parentNode.removeChild(ctxPop);
    var cb = ctxPop && ctxPop._onClose;
    ctxPop = null;
    if (cb) cb();
  }
  // 点击浮层外 → 关闭(全局单例,多实例互斥;keepOpenOn 命中不关闭,交由宿主切换)
  document.addEventListener('click', function (e) {
    if (
      ctxPop &&
      e.target &&
      (!e.target.closest || !e.target.closest('[data-ctxpop]')) &&
      !(ctxPop._keepOpenOn && e.target.closest && e.target.closest(ctxPop._keepOpenOn))
    ) {
      contextMenuClose();
    }
  });

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
          escAttr(o.removeLabel || '') +
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

  window.App = window.App || {};
  App.ui = {
    cn: cn,
    toast: toast,
    buttonClass: buttonClass,
    buttonIcon: buttonIcon,
    badgeClass: badgeClass,
    cardClass: cardClass,
    cardHeaderClass: cardHeaderClass,
    cardTitleClass: cardTitleClass,
    cardContentClass: cardContentClass,
    toggleItemClass: toggleItemClass,
    inputClass: inputClass,
    switchRow: switchRow,
    dropdownTriggerClass: dropdownTriggerClass,
    dropdownContentClass: dropdownContentClass,
    dropdownItemClass: dropdownItemClass,
    dropdownLabelClass: dropdownLabelClass,
    dropdownSeparator: dropdownSeparator,
    avatarHtml: avatarHtml,
    placeholderCard: placeholderCard,
    notFound: notFound,
    emptyState: emptyState,
    dialog: dialog,
    closeDialog: closeDialog,
    contextMenu: {
      item: ctxItem,
      separator: ctxSeparator,
      submenu: ctxSubmenu,
      empty: ctxEmpty,
      open: contextMenuOpen,
      close: contextMenuClose,
    },
    tagPill: tagPill,
    tagPills: tagPills,
    radio: {
      gridClass: rgGridClass,
      sectionTitle: radioSectionTitle,
      sectionTitleToggle: radioSectionTitleToggle,
      check: radioCheck,
      iconCard: radioIconCard,
      swatchPicker: radioSwatchPicker,
      segmented: radioSegmented,
      readonlyRow: radioReadonlyRow,
    },
  };
})();
