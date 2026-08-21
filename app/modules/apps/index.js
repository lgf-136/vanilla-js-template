/* ============================================================
 * apps 模块 — 实现(懒加载,首次访问 #/apps 时下载)
 * 复刻参考项目 shadcn-admin 的 Apps 页:App Integrations。
 * - 品牌图标(15 个 lucide 风格 logo)来自 icons-data.js
 * - 筛选输入 + 连接状态下拉 + 排序下拉(asc/desc)
 * - 卡片网格:logo + 名称 + 描述 + 连接状态按钮
 * 零依赖;render 遵循核心契约(返回 HTML 字符串),交互走
 * document 级事件委托(与 tasks/dashboard 一致)。
 * ============================================================ */
(function () {
  'use strict';

  var icon = function () {
    return App.icon;
  };

  /* ---------- 应用数据(与参考项目一致) ---------- */
  var APPS = [
    {
      name: 'Telegram',
      logo: 'telegram',
      connected: false,
      desc: 'Connect with Telegram for real-time communication.',
    },
    {
      name: 'Notion',
      logo: 'notion',
      connected: true,
      desc: 'Effortlessly sync Notion pages for seamless collaboration.',
    },
    {
      name: 'Figma',
      logo: 'figma',
      connected: true,
      desc: 'View and collaborate on Figma designs in one place.',
    },
    {
      name: 'Trello',
      logo: 'trello',
      connected: false,
      desc: 'Sync Trello cards for streamlined project management.',
    },
    {
      name: 'Slack',
      logo: 'slack',
      connected: false,
      desc: 'Integrate Slack for efficient team communication.',
    },
    {
      name: 'Zoom',
      logo: 'zoom',
      connected: true,
      desc: 'Host Zoom meetings directly from the dashboard.',
    },
    {
      name: 'Stripe',
      logo: 'stripe',
      connected: false,
      desc: 'Easily manage Stripe transactions and payments.',
    },
    {
      name: 'Gmail',
      logo: 'gmail',
      connected: true,
      desc: 'Access and manage Gmail messages effortlessly.',
    },
    {
      name: 'Medium',
      logo: 'medium',
      connected: false,
      desc: 'Explore and share Medium stories on your dashboard.',
    },
    {
      name: 'Skype',
      logo: 'skype',
      connected: false,
      desc: 'Connect with Skype contacts seamlessly.',
    },
    {
      name: 'Docker',
      logo: 'docker',
      connected: false,
      desc: 'Effortlessly manage Docker containers on your dashboard.',
    },
    {
      name: 'GitHub',
      logo: 'github',
      connected: false,
      desc: 'Streamline code management with GitHub integration.',
    },
    {
      name: 'GitLab',
      logo: 'gitlab',
      connected: false,
      desc: 'Efficiently manage code projects with GitLab integration.',
    },
    {
      name: 'Discord',
      logo: 'discord',
      connected: false,
      desc: 'Connect with Discord for seamless team communication.',
    },
    {
      name: 'WhatsApp',
      logo: 'whatsapp',
      connected: false,
      desc: 'Easily integrate WhatsApp for direct messaging.',
    },
  ];

  /* ---------- 状态 ---------- */
  var state = { term: '', type: 'all', sort: 'asc' };

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;

  function filteredApps() {
    var list = APPS.slice();
    var term = state.term.trim().toLowerCase();
    if (state.type === 'connected')
      list = list.filter(function (a) {
        return a.connected;
      });
    else if (state.type === 'notConnected')
      list = list.filter(function (a) {
        return !a.connected;
      });
    if (term)
      list = list.filter(function (a) {
        return a.name.toLowerCase().indexOf(term) !== -1;
      });
    list.sort(function (a, b) {
      var c = a.name.localeCompare(b.name);
      return state.sort === 'asc' ? c : -c;
    });
    return list;
  }

  /* ---------- 渲染(返回 HTML 字符串) ---------- */
  function render(route, ctx) {
    var t = ctx.t;
    var list = filteredApps();

    var html =
      '<div class="ap-page" data-app-region>' +
      '<div class="ap-head">' +
      '<h1>' +
      t('apps.title') +
      '</h1>' +
      '<p>' +
      t('apps.desc') +
      '</p>' +
      '</div>' +
      '<div class="ap-toolbar">' +
      '<div class="ap-toolbar-left">' +
      '<div class="ap-search-wrap">' +
      App.ui.searchInput.html({
        placeholder: t('apps.filterPlaceholder'),
        value: state.term,
        attrs: 'data-app-filter',
        clearLabel: t('apps.filterPlaceholder'),
      }) +
      '</div>' +
      '<div data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="ap-select ap-select-type" aria-label="' +
      t('apps.type.' + state.type) +
      '">' +
      '<span data-app-type-label>' +
      t('apps.type.' + state.type) +
      '</span>' +
      icon().iconSvg('chevron-down', { class: 'ap-chevron' }) +
      '</button>' +
      '<div data-dropdown-content class="' +
      App.ui.dropdownContentClass() +
      '" role="menu">' +
      '<button type="button" role="menuitem" class="' +
      App.ui.dropdownItemClass() +
      '" data-app-type="all">' +
      (state.type === 'all'
        ? icon().iconSvg('check', { class: 'size-4 me-2' })
        : '<span class="size-4 me-2"></span>') +
      t('apps.type.all') +
      '</button>' +
      '<button type="button" role="menuitem" class="' +
      App.ui.dropdownItemClass() +
      '" data-app-type="connected">' +
      (state.type === 'connected'
        ? icon().iconSvg('check', { class: 'size-4 me-2' })
        : '<span class="size-4 me-2"></span>') +
      t('apps.type.connected') +
      '</button>' +
      '<button type="button" role="menuitem" class="' +
      App.ui.dropdownItemClass() +
      '" data-app-type="notConnected">' +
      (state.type === 'notConnected'
        ? icon().iconSvg('check', { class: 'size-4 me-2' })
        : '<span class="size-4 me-2"></span>') +
      t('apps.type.notConnected') +
      '</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div data-dropdown>' +
      '<button type="button" data-dropdown-trigger class="ap-select ap-select-sort" aria-label="' +
      t('apps.sort.' + state.sort) +
      '">' +
      icon().iconSvg('sliders-horizontal', { class: 'size-4' }) +
      '</button>' +
      '<div data-dropdown-content class="' +
      App.ui.dropdownContentClass() +
      '" role="menu">' +
      '<button type="button" role="menuitem" class="' +
      App.ui.dropdownItemClass() +
      '" data-app-sort="asc">' +
      icon().iconSvg('arrow-up-a-z', { class: 'size-4 me-2' }) +
      '<span>' +
      t('apps.sort.asc') +
      '</span>' +
      (state.sort === 'asc' ? icon().iconSvg('check', { class: 'size-4 ms-auto' }) : '') +
      '</button>' +
      '<button type="button" role="menuitem" class="' +
      App.ui.dropdownItemClass() +
      '" data-app-sort="desc">' +
      icon().iconSvg('arrow-down-a-z', { class: 'size-4 me-2' }) +
      '<span>' +
      t('apps.sort.desc') +
      '</span>' +
      (state.sort === 'desc' ? icon().iconSvg('check', { class: 'size-4 ms-auto' }) : '') +
      '</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="ap-separator"></div>' +
      '<div class="ap-grid">';

    if (list.length === 0) {
      html += App.ui.emptyState({
        icon: 'package',
        title: esc(t('apps.emptyTitle')),
        desc: esc(t('apps.emptyDesc')),
      });
    } else {
      html += list
        .map(function (a) {
          return (
            '<div class="ap-card">' +
            '<div class="ap-card-top">' +
            '<div class="ap-logo">' +
            icon().iconSvg(a.logo, { class: 'ap-logo-svg' }) +
            '</div>' +
            '<button type="button" class="ap-connect ' +
            (a.connected ? 'ap-connect-on' : '') +
            '" data-app-toggle="' +
            esc(a.name) +
            '">' +
            (a.connected ? t('apps.connected') : t('apps.connect')) +
            '</button>' +
            '</div>' +
            '<h2>' +
            esc(a.name) +
            '</h2>' +
            '<p>' +
            esc(a.desc) +
            '</p>' +
            '</div>'
          );
        })
        .join('');
    }

    html += '</div></div>';
    return html;
  }

  /* ---------- 交互(document 级事件委托,模块加载时绑定一次) ---------- */
  function rerender() {
    var region = document.querySelector('[data-app-region]');
    if (!region) return;
    var locale = App.getShellContext().settings.locale;
    var t = App.i18n.makeT(locale, window.__moduleI18n && window.__moduleI18n.apps);
    region.outerHTML = render('/apps', { t: t, settings: App.getShellContext().settings });
  }

  document.addEventListener('input', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var el = target.closest('[data-app-filter]');
    if (!el) return;
    state.term = el.value;
    rerender();
  });

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var typeBtn = target.closest('[data-app-type]');
    if (typeBtn) {
      state.type = typeBtn.getAttribute('data-app-type');
      rerender();
      return;
    }
    var sortBtn = target.closest('[data-app-sort]');
    if (sortBtn) {
      state.sort = sortBtn.getAttribute('data-app-sort');
      rerender();
      return;
    }
    var toggle = target.closest('[data-app-toggle]');
    if (toggle) {
      var name = toggle.getAttribute('data-app-toggle');
      APPS.forEach(function (a) {
        if (a.name === name) a.connected = !a.connected;
      });
      rerender();
    }
  });

  App.defineModule({ id: 'apps', render: render });
})();
