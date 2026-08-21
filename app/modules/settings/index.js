/* ============================================================
 * settings 模块 — 实现(懒加载,首次访问 /settings 时下载)
 * ------------------------------------------------------------
 * 从 mpages 移植的 Settings 二级子菜单页面(仅页面内容,无功能):
 * 个人资料 / 账号 / 外观 / 通知 / 显示。
 * 父模块按路由分发到对应页面渲染;表单为静态展示(无提交/校验)。
 * 只依赖核心层 App.ui / App.icon / App.settings / ctx。
 * ============================================================ */
(function () {
  'use strict';

  var S = function () {
    return App.settings;
  };
  var icon = function () {
    return App.icon;
  };

  /* ---------- 页内子导航(与主侧边栏二级菜单一致) ---------- */
  var NAV = [
    { id: 'profile', route: '/settings', icon: 'user-cog', titleKey: 'profile.title' },
    { id: 'account', route: '/settings/account', icon: 'wrench', titleKey: 'account.title' },
    {
      id: 'appearance',
      route: '/settings/appearance',
      icon: 'palette',
      titleKey: 'appearance.title',
    },
    {
      id: 'notifications',
      route: '/settings/notifications',
      icon: 'bell',
      titleKey: 'notifications.title',
    },
    { id: 'display', route: '/settings/display', icon: 'monitor', titleKey: 'display.title' },
  ];

  /* ---------- 通用布局 ---------- */
  function contentSection(t, titleKey, descKey, body) {
    return (
      '<div class="sp-section">' +
      '<h3>' +
      t(titleKey) +
      '</h3>' +
      '<p class="sp-section-desc">' +
      t(descKey) +
      '</p>' +
      '<div class="sp-sep"></div>' +
      '<div class="sp-section-body"><div class="sp-section-inner">' +
      body +
      '</div></div>' +
      '</div>'
    );
  }

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
  var escAttr = App.escape.escAttr;
  var escHtml = App.escape.escHtml;

  /* ---------- 账号 ---------- */
  var ACCOUNT_LANGUAGES = [
    { label: 'English', value: 'en' },
    { label: 'French', value: 'fr' },
    { label: 'German', value: 'de' },
    { label: 'Spanish', value: 'es' },
    { label: 'Portuguese', value: 'pt' },
    { label: 'Russian', value: 'ru' },
    { label: 'Japanese', value: 'ja' },
    { label: 'Korean', value: 'ko' },
    { label: 'Chinese', value: 'zh' },
  ];

  /** 自定义下拉(替代原生 <select>,复用 [data-dropdown] 弹层机制,样式类 shadcn Select) */
  function languageSelectHtml(t, value) {
    var selected = null;
    for (var i = 0; i < ACCOUNT_LANGUAGES.length; i++) {
      if (ACCOUNT_LANGUAGES[i].value === value) {
        selected = ACCOUNT_LANGUAGES[i];
        break;
      }
    }
    var options = ACCOUNT_LANGUAGES.map(function (l) {
      var active = l.value === value;
      return (
        '<button type="button" role="option" aria-selected="' +
        active +
        '" data-select-option data-setting="account.language" data-value="' +
        l.value +
        '" class="' +
        App.ui.dropdownItemClass(active ? ' bg-accent text-accent-foreground' : '') +
        '">' +
        '<span class="flex-1 text-left">' +
        l.label +
        '</span>' +
        (active ? icon().iconSvg('check', { class: 'size-4' }) : '') +
        '</button>'
      );
    }).join('');
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="sp-select-trigger" aria-haspopup="listbox">' +
      '<span class="sp-select-label">' +
      (selected ? selected.label : t('account.language.selectPlaceholder')) +
      '</span>' +
      '<svg class="sp-select-chevron" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>' +
      '</button>' +
      '<div role="listbox" data-dropdown-menu class="' +
      App.ui.dropdownContentClass('sp-select-menu min-w-48') +
      '">' +
      options +
      '</div>' +
      '</div>'
    );
  }

  /* ---------- 自定义日历(替代原生 input[type=date],样式类 shadcn Calendar) ---------- */
  var calView = null; // { year, month } 当前浏览的年月(0 基)

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isoToDate(iso) {
    if (!iso) return null;
    var d = new Date(String(iso) + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function monthTitle(year, month, locale) {
    try {
      return new Date(year, month, 1).toLocaleDateString(locale === 'en' ? 'en-US' : locale, {
        year: 'numeric',
        month: 'long',
      });
    } catch (e) {
      return year + '-' + (month + 1);
    }
  }

  function formatDob(iso, locale) {
    var d = isoToDate(iso);
    if (!d) return '';
    try {
      return d.toLocaleDateString(locale === 'en' ? 'en-US' : locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return iso;
    }
  }

  function calendarInnerHtml(year, month, selected, t, locale) {
    var first = new Date(year, month, 1);
    var startWeekday = first.getDay(); // 0=周日
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var weekdays = String(t('account.dob.weekdays')).split(',');
    var today = todayIso();
    var cells = [];
    for (var w = 0; w < startWeekday; w++) cells.push('<span class="sp-cal-empty"></span>');
    for (var d = 1; d <= daysInMonth; d++) {
      var iso = year + '-' + pad2(month + 1) + '-' + pad2(d);
      var cls =
        'sp-cal-day' +
        (iso === selected ? ' is-selected' : '') +
        (iso === today ? ' is-today' : '');
      cells.push(
        '<button type="button" data-calendar-day data-value="' +
          iso +
          '" class="' +
          cls +
          '">' +
          d +
          '</button>'
      );
    }
    return (
      '<div class="sp-cal-head">' +
      '<button type="button" data-calendar-prev class="sp-cal-nav" aria-label="Previous month">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"></path></svg>' +
      '</button>' +
      '<div class="sp-cal-title">' +
      monthTitle(year, month, locale) +
      '</div>' +
      '<button type="button" data-calendar-next class="sp-cal-nav" aria-label="Next month">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>' +
      '</button>' +
      '</div>' +
      '<div class="sp-cal-weekdays">' +
      weekdays
        .map(function (w) {
          return '<span>' + w + '</span>';
        })
        .join('') +
      '</div>' +
      '<div class="sp-cal-grid">' +
      cells.join('') +
      '</div>' +
      '<button type="button" data-calendar-clear class="sp-cal-clear">' +
      t('account.dob.clear') +
      '</button>'
    );
  }

  function initCalView(iso) {
    var d = isoToDate(iso) || new Date();
    calView = { year: d.getFullYear(), month: d.getMonth() };
  }

  function rerenderCalendar(t, locale) {
    var root = document.querySelector('[data-cal-root]');
    if (!root || !calView) return;
    var selected = App.getShellContext().settings.account.dob;
    root.innerHTML = calendarInnerHtml(calView.year, calView.month, selected, t, locale);
  }

  /** 自定义日期触发器 + 日历弹层(替代原生 date 输入,复用 [data-dropdown] 机制) */
  function datePickerHtml(t, ac, locale) {
    initCalView(ac.dob);
    var shown = formatDob(ac.dob, locale);
    return (
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="sp-select-trigger" aria-haspopup="dialog">' +
      '<span class="sp-select-label' +
      (shown ? '' : ' sp-select-placeholder') +
      '">' +
      (shown || t('account.dob.placeholder')) +
      '</span>' +
      '<svg class="sp-select-chevron" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg>' +
      '</button>' +
      '<div data-dropdown-menu class="' +
      App.ui.dropdownContentClass('sp-cal-pop min-w-64') +
      '">' +
      '<div data-cal-root data-year="' +
      calView.year +
      '" data-month="' +
      calView.month +
      '">' +
      calendarInnerHtml(calView.year, calView.month, ac.dob, t, locale) +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function pageAccount(ctx) {
    var t = ctx.t;
    var ac = ctx.settings.account || {};
    var body =
      '<form class="sp-form">' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('account.name.label') +
      '</label>' +
      '<input class="' + App.ui.inputClass() + '" type="text" data-setting="account.name" value="' +
      escAttr(ac.name) +
      '" placeholder="' +
      t('account.name.placeholder') +
      '" />' +
      '<p class="sp-field-desc">' +
      t('account.name.description') +
      '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('account.dob.label') +
      '</label>' +
      datePickerHtml(t, ac, ctx.settings.locale) +
      '<p class="sp-field-desc">' +
      t('account.dob.description') +
      '</p>' +
      '</div>' +
      '<div class="sp-field">' +
      '<label class="sp-label">' +
      t('account.language.label') +
      '</label>' +
      languageSelectHtml(t, ac.language) +
      '<p class="sp-field-desc">' +
      t('account.language.description') +
      '</p>' +
      '</div>' +
      '<button type="button" data-slot="button" class="' +
      App.ui.buttonClass('default') +
      '">' +
      t('account.submit') +
      '</button>' +
      '</form>';
    return contentSection(t, 'account.title', 'account.description', body);
  }

  /* ---------- 外观(mpages radio-group 风格):卡片统一用 App.ui.radio(样式 app.css .rg-*) ---------- */
  function optSection(t, titleKey, inner) {
    return '<div class="sp-opt-group">' + App.ui.radio.sectionTitle(t(titleKey)) + inner + '</div>';
  }

  function pageAppearance(ctx) {
    var t = ctx.t;
    var s = ctx.settings;
    var ap = s.appearance;
    var st = S();
    var radio = App.ui.radio;

    var layout =
      s.sidebarVariant === 'inset'
        ? 'default'
        : s.sidebarCollapsible === 'offcanvas'
          ? 'offcanvas'
          : 'icon';
    var themeItems = st.THEME_ITEMS;
    var sidebarItems = st.SIDEBAR_ITEMS;
    var layoutItems = st.LAYOUT_ITEMS;

    var body =
      '<div class="sp-form">' +
      optSection(
        t,
        'settings.theme',
        '<div class="' +
          radio.gridClass(3) +
          '">' +
          themeItems
            .map(function (it) {
              return radio.iconCard(
                it.icon,
                t(it.labelKey),
                s.theme === it.value,
                true,
                'theme:' + it.value
              );
            })
            .join('') +
          '</div>'
      ) +
      optSection(
        t,
        'settings.sidebar',
        '<div class="' +
          radio.gridClass(3) +
          '">' +
          sidebarItems
            .map(function (it) {
              return radio.iconCard(
                it.icon,
                t(it.labelKey),
                s.sidebarVariant === it.value,
                false,
                'sidebar:' + it.value
              );
            })
            .join('') +
          '</div>'
      ) +
      optSection(
        t,
        'settings.layout',
        '<div class="' +
          radio.gridClass(3) +
          '">' +
          layoutItems
            .map(function (it) {
              return radio.iconCard(
                it.icon,
                t(it.labelKey),
                layout === it.value,
                false,
                'layout:' + it.value
              );
            })
            .join('') +
          '</div>'
      ) +
      '<div class="sp-opt-group">' +
      radio.sectionTitleToggle(
        t('settings.baseColor'),
        ap.useBase !== false,
        'base',
        t('settings.useBase')
      ) +
      radio.swatchPicker(ap.baseColor, st.BASE_COLORS, 7, 'base') +
      '</div>' +
      '<div class="sp-opt-group">' +
      radio.sectionTitleToggle(
        t('settings.chartColor'),
        ap.useAccent !== false,
        'chart',
        t('settings.useAccent')
      ) +
      radio.swatchPicker(ap.chartColor, [ap.baseColor].concat(st.CHART_COLORS), 6, 'chart') +
      '</div>' +
      optSection(
        t,
        'settings.style',
        radio.segmented(
          st.STYLES.map(function (v) {
            return { value: v, label: v };
          }),
          ap.style,
          4,
          'style'
        )
      ) +
      optSection(
        t,
        'settings.bodyFont',
        radio.segmented(
          st.FONTS.map(function (f) {
            return { value: f.value, label: f.label };
          }),
          ap.bodyFont,
          3,
          'body-font'
        )
      ) +
      optSection(
        t,
        'settings.headingFont',
        radio.segmented(
          st.FONTS.map(function (f) {
            return { value: f.value, label: f.label };
          }),
          ap.headingFont,
          3,
          'heading-font'
        )
      ) +
      radio.readonlyRow(t('settings.iconLibrary'), t('settings.lucide')) +
      optSection(
        t,
        'settings.radius',
        radio.segmented(
          st.RADII.map(function (r) {
            return { value: r.value, label: t(r.labelKey) };
          }),
          ap.radius,
          3,
          'radius'
        )
      ) +
      optSection(
        t,
        'settings.menuColor',
        radio.segmented(
          [
            { value: 'default', label: t('settings.menuColorOptions.default') },
            { value: 'inverted', label: t('settings.menuColorOptions.inverted') },
          ],
          ap.menuColor,
          2,
          'menu-color'
        )
      ) +
      optSection(
        t,
        'settings.menuAppearance',
        radio.segmented(
          [
            { value: 'solid', label: t('settings.menuAppearanceOptions.solid') },
            { value: 'translucent', label: t('settings.menuAppearanceOptions.translucent') },
          ],
          ap.menuAppearance,
          2,
          'menu-appearance'
        )
      ) +
      radio.readonlyRow(t('settings.menuAccent'), t('settings.subtle')) +
      '<button type="button" data-reset-appearance data-slot="button" class="' +
      App.ui.buttonClass('destructive') +
      '">' +
      t('appearance.reset') +
      '</button>' +
      '</div>';
    return contentSection(t, 'appearance.title', 'appearance.description', body);
  }

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

  /* ---------- 分发 ---------- */
  var PAGES = {
    profile: pageProfile,
    account: pageAccount,
    appearance: pageAppearance,
    notifications: pageNotifications,
    display: pageDisplay,
  };

  function render(route, ctx) {
    var t = ctx.t;
    var pageId = route === '/settings' ? 'profile' : route.split('/').pop();
    App.logger.debug('settings', '渲染子页面: ' + pageId); // 日志示例:自动带上 文件#函数:行号
    var renderer = PAGES[pageId] || null;
    var bodyHtml = renderer ? renderer(ctx) : App.ui.notFound(t);

    var navHtml = NAV.map(function (n) {
      var active = n.id === pageId;
      return (
        '<a href="#' +
        n.route +
        '" data-link="' +
        n.route +
        '" class="sp-nav-link' +
        (active ? ' is-active' : '') +
        '">' +
        icon().iconSvg(n.icon, { class: 'size-4' }) +
        '<span>' +
        t(n.titleKey) +
        '</span>' +
        '</a>'
      );
    }).join('');

    return (
      '<div class="sp-page">' +
      '<div class="sp-page-head">' +
      '<h1>' +
      t('settings.title') +
      '</h1>' +
      '<p>' +
      t('settings.description') +
      '</p>' +
      '</div>' +
      '<div class="sp-sep"></div>' +
      '<div class="sp-body">' +
      '<aside class="sp-nav-col"><nav class="sp-nav">' +
      navHtml +
      '</nav></aside>' +
      '<div class="sp-content">' +
      bodyHtml +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  /* ---------- 自定义控件事件委托(下拉选项 / 日历翻页与选日) ----------
   * 与核心层约定:真实 input 的 change/input 由 app.js 处理;纯按钮类自定义
   * 控件(下拉选项、日历日)在此处理,写值统一走 App.applySettingValue。
   */
  function moduleT() {
    var locale = App.getShellContext().settings.locale;
    return App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.settings);
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var opt = target.closest('[data-select-option]');
    if (opt) {
      App.applySettingValue(
        opt.getAttribute('data-setting'),
        opt.getAttribute('data-value'),
        false
      );
      return;
    }
    var calDay = target.closest('[data-calendar-day]');
    if (calDay) {
      App.applySettingValue('account.dob', calDay.getAttribute('data-value'), false);
      return;
    }
    var calClear = target.closest('[data-calendar-clear]');
    if (calClear) {
      App.applySettingValue('account.dob', '', false);
      return;
    }
    if (target.closest('[data-calendar-prev]') || target.closest('[data-calendar-next]')) {
      var delta = target.closest('[data-calendar-prev]') ? -1 : 1;
      if (calView) {
        calView.month += delta;
        if (calView.month < 0) {
          calView.month = 11;
          calView.year--;
        } else if (calView.month > 11) {
          calView.month = 0;
          calView.year++;
        }
        var t = moduleT();
        rerenderCalendar(t, App.getShellContext().settings.locale);
      }
      return;
    }
  });

  App.defineModule({ id: 'settings', render: render });
})();
