/* ============================================================
 * shell.js — App Shell 渲染(零依赖)
 * ------------------------------------------------------------
 * 侧边栏 / 顶栏 / 主题设置面板的 HTML 渲染。
 * 导航项由 app.js 根据模块注册表构建(navItems),
 * 本文件只负责把结构画出来,不关心模块内部实现。
 * ============================================================ */
(function () {
  'use strict';

  var ui = function () {
    return App.ui;
  };
  var icon = function () {
    return App.icon;
  };

  /** 转义用户可控文本(工作空间名称)——统一走 shared/escape.js（红线 13） */
  var esc = App.escape.escHtml;

  /** 工作空间图标(按工作空间强调色着底) */
  function workspaceIcon(ws, boxClass) {
    return (
      '<span class="' +
      boxClass +
      ' flex shrink-0 items-center justify-center swatch-' +
      ws.color +
      '" style="color:var(--primary-foreground)">' +
      icon().iconSvg(ws.icon, { class: 'size-4' }) +
      '</span>'
    );
  }

  /** 工作空间显示名:按当前语言取 names 映射,缺省回退简体/英文 */
  function workspaceName(ws, locale) {
    return App.settings.workspaceDisplayName(ws, locale);
  }

  // ---------- Sidebar ----------
  function sidebarHtml(navItems, settings, t, pathname, openSubmenus) {
    var navList = navItems
      .map(function (item) {
        if (item.children && item.children.length) {
          var open = !!(openSubmenus && openSubmenus[item.id]);
          var sub = item.children
            .map(function (sub) {
              return (
                '<li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" class="group/menu-sub-item relative">' +
                '<a href="#' +
                sub.href +
                '" data-link="' +
                sub.href +
                '" class="' +
                ui().cn(
                  'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
                  pathname === sub.href
                    ? 'data-active bg-sidebar-accent text-sidebar-accent-foreground'
                    : ''
                ) +
                '">' +
                '<span>' +
                sub.title +
                '</span>' +
                '</a></li>'
              );
            })
            .join('');
          return (
            '<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">' +
            '<button type="button" data-submenu-toggle="' +
            item.id +
            '" data-open="' +
            open +
            '" data-slot="sidebar-menu-button" data-sidebar="menu-button" class="' +
            ui().cn(
              'peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate'
            ) +
            '">' +
            icon().iconSvg(item.icon, { class: 'size-4' }) +
            '<span>' +
            item.title +
            '</span>' +
            '<svg class="ml-auto size-4 ' +
            (open ? 'rotate-90' : '') +
            '" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>' +
            '</button>' +
            (open
              ? '<ul data-slot="sidebar-menu-sub" data-sidebar="menu-sub" class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden">' +
                sub +
                '</ul>'
              : '') +
            '</li>'
          );
        }
        var active = pathname === item.href;
        return (
          '<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">' +
          '<a href="#' +
          item.href +
          '" data-link="' +
          item.href +
          '" data-slot="sidebar-menu-button" data-sidebar="menu-button" aria-current="' +
          (active ? 'page' : '') +
          '" class="' +
          ui().cn(
            'peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate',
            active ? 'data-active bg-sidebar-accent font-medium text-sidebar-accent-foreground' : ''
          ) +
          '">' +
          icon().iconSvg(item.icon, { class: 'size-4' }) +
          '<span>' +
          item.title +
          '</span>' +
          '</a></li>'
        );
      })
      .join('');

    var workspaces =
      settings.workspaces && settings.workspaces.length
        ? settings.workspaces
        : App.settings.DEFAULT_WORKSPACES;
    var activeWorkspace = App.settings.findWorkspace(workspaces, settings.activeWorkspace);
    var workspaceItems = workspaces
      .map(function (ws) {
        var isActive = ws.id === activeWorkspace.id;
        return (
          '<div role="menuitem" class="ws-menu-item">' +
          '<button type="button" data-workspace="' +
          ws.id +
          '" class="' +
          ui().dropdownItemClass('ws-menu-main gap-2 p-2') +
          '">' +
          workspaceIcon(ws, 'size-6 rounded-md') +
          '<span class="min-w-0 flex-1 truncate text-left">' +
          esc(workspaceName(ws, settings.locale)) +
          '</span>' +
          (isActive
            ? '<span class="ml-auto flex items-center">' +
              icon().iconSvg('circle-check', { class: 'size-4 text-primary' }) +
              '</span>'
            : '') +
          '</button>' +
          '<span class="ws-menu-actions">' +
          '<button type="button" data-ws-edit="' +
          ws.id +
          '" data-tip="' +
          t('workspace.edit') +
          '" aria-label="' +
          t('workspace.edit') +
          '">' +
          icon().iconSvg('pencil') +
          '</button>' +
          (workspaces.length > 1
            ? '<button type="button" data-ws-delete="' +
              ws.id +
              '" class="ws-menu-delete" data-tip="' +
              t('workspace.delete') +
              '" aria-label="' +
              t('workspace.delete') +
              '">' +
              icon().iconSvg('trash-2') +
              '</button>'
            : '') +
          '</span>' +
          '</div>'
        );
      })
      .join('');

    var profile = settings.profile || {};
    var displayName = profile.username || 'Admin';
    var displayEmail = profile.email || 'admin@example.com';
    var profiles =
      settings.profiles && settings.profiles.length
        ? settings.profiles
        : App.settings.defaultProfiles();
    var activeProfile = App.settings.findProfile(profiles, settings.activeProfile);
    var activeProfileName = App.settings.profileDisplayName(activeProfile, t);
    var userItems =
      '<div class="' +
      ui().dropdownLabelClass('p-0 font-normal') +
      '">' +
      '<div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">' +
      '<span data-user-avatar class="shrink-0">' +
      App.ui.avatarHtml(profile, 'size-8') +
      '</span>' +
      '<div class="grid flex-1 text-left text-sm leading-tight">' +
      '<span class="truncate font-semibold" data-user-name>' +
      esc(displayName) +
      '</span>' +
      '<span class="truncate text-xs" data-user-email>' +
      esc(displayEmail) +
      '</span>' +
      '</div></div>' +
      ui().dropdownSeparator() +
      '<button type="button" role="menuitem" class="' +
      ui().dropdownItemClass() +
      '">' +
      icon().iconSvg('user', { class: 'size-4' }) +
      '<span>' +
      t('sidebar.profile') +
      '</span></button>' +
      '<button type="button" role="menuitem" data-open-profiles class="' +
      ui().dropdownItemClass() +
      '">' +
      icon().iconSvg('user-cog', { class: 'size-4' }) +
      '<span>' +
      t('sidebar.profiles') +
      '</span>' +
      '<span class="ml-auto truncate text-xs text-muted-foreground">' +
      esc(activeProfileName) +
      '</span></button>' +
      '<button type="button" role="menuitem" class="' +
      ui().dropdownItemClass() +
      '">' +
      icon().iconSvg('settings', { class: 'size-4' }) +
      '<span>' +
      t('sidebar.settings') +
      '</span></button>' +
      ui().dropdownSeparator() +
      '<button type="button" role="menuitem" data-signout class="' +
      ui().dropdownItemClass() +
      '">' +
      icon().iconSvg('log-out', { class: 'size-4' }) +
      '<span>' +
      t('sidebar.signOut') +
      '</span></button>';

    return (
      '<div class="group peer hidden text-sidebar-foreground md:block" data-state="expanded" data-collapsible="" data-variant="' +
      settings.sidebarVariant +
      '" data-side="left" data-slot="sidebar">' +
      '<div data-slot="sidebar-gap" class="relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0 group-data-[side=right]:rotate-180 ' +
      ui().cn(
        settings.sidebarVariant === 'inset' || settings.sidebarVariant === 'floating'
          ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
          : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
      ) +
      '"></div>' +
      '<div data-slot="sidebar-container" data-side="left" class="fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 md:flex ' +
      ui().cn(
        'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]',
        settings.sidebarVariant === 'sidebar'
          ? 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r'
          : ''
      ) +
      '">' +
      '<div data-sidebar="sidebar" data-slot="sidebar-inner" class="flex size-full flex-col bg-sidebar ' +
      ui().cn(
        'group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border'
      ) +
      '">' +
      '<div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" data-tip="Drag to resize sidebar" data-resize-handle class="group/handle absolute inset-y-0 right-0 z-10 flex w-3 translate-x-1/2 cursor-col-resize touch-none items-center justify-center select-none">' +
      '<span class="h-10 w-1 rounded-full bg-border group-hover/handle:bg-muted-foreground/40"></span>' +
      '</div>' +
      '<div data-slot="sidebar-header" data-sidebar="header" class="flex flex-col gap-2 p-2">' +
      '<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-0">' +
      '<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">' +
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" class="' +
      ui().buttonClass(
        'ghost',
        'lg',
        'w-full rounded-lg p-2 text-left data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center'
      ) +
      '" aria-haspopup="menu">' +
      '<span class="flex w-full items-center gap-2">' +
      workspaceIcon(activeWorkspace, 'size-8 rounded-lg') +
      '<span class="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">' +
      '<span class="truncate text-left font-semibold" data-selected-workspace>' +
      esc(workspaceName(activeWorkspace, settings.locale)) +
      '</span>' +
      '<span class="truncate text-left text-xs text-muted-foreground">' +
      t('sidebar.workspaces') +
      '</span>' +
      '</span>' +
      '<span class="ml-auto group-data-[collapsible=icon]:hidden">' +
      icon().iconSvg('chevrons-up-down', { class: 'size-4' }) +
      '</span>' +
      '</span></button>' +
      '<div data-dropdown-menu class="' +
      ui().dropdownContentClass('w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg') +
      '" data-side="right" role="menu">' +
      '<div class="px-2 py-1.5 text-xs text-muted-foreground">' +
      t('sidebar.workspaces') +
      '</div>' +
      workspaceItems +
      ui().dropdownSeparator() +
      '<button type="button" role="menuitem" data-add-workspace class="' +
      ui().dropdownItemClass('gap-2 p-2') +
      '">' +
      '<div class="flex size-6 items-center justify-center rounded-sm border bg-muted/30">' +
      icon().iconSvg('plus', { class: 'size-3.5' }) +
      '</div>' +
      '<span>' +
      t('sidebar.createWorkspace') +
      '</span>' +
      '</button></div></div></li></ul></div>' +
      '<div data-slot="sidebar-content" data-sidebar="content" class="no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden">' +
      '<div data-slot="sidebar-group" data-sidebar="group" class="relative flex w-full min-w-0 flex-col p-2">' +
      '<div data-slot="sidebar-group-label" data-sidebar="group-label" class="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0">' +
      t('sidebar.main') +
      '</div>' +
      '<div data-slot="sidebar-group-content" data-sidebar="group-content" class="w-full text-sm">' +
      '<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-0">' +
      navList +
      '</ul>' +
      '</div></div></div>' +
      '<div data-slot="sidebar-footer" data-sidebar="footer" class="flex flex-col gap-2 p-2">' +
      '<ul data-slot="sidebar-menu" data-sidebar="menu" class="flex w-full min-w-0 flex-col gap-0">' +
      '<li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">' +
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" class="' +
      ui().buttonClass(
        'ghost',
        'lg',
        'w-full rounded-lg p-2 text-left data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center'
      ) +
      '" aria-haspopup="menu">' +
      '<span class="flex w-full items-center gap-2">' +
      '<span data-user-avatar class="shrink-0">' +
      App.ui.avatarHtml(profile, 'size-8') +
      '</span>' +
      '<span class="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">' +
      '<span class="truncate font-semibold" data-user-name>' +
      esc(displayName) +
      '</span>' +
      '<span class="truncate text-xs" data-user-email>' +
      esc(displayEmail) +
      '</span>' +
      '</span>' +
      '<span class="ml-auto group-data-[collapsible=icon]:hidden">' +
      icon().iconSvg('chevrons-up-down', { class: 'size-4' }) +
      '</span>' +
      '</span></button>' +
      '<div data-dropdown-menu class="' +
      ui().dropdownContentClass('w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg') +
      '" data-side="right" role="menu">' +
      userItems +
      '</div>' +
      '</div></li></ul></div>' +
      '</div></div></div>'
    );
  }

  // ---------- Header ----------
  function headerHtml(t, settings) {
    var theme = settings.theme;
    var locale = settings.locale;
    var themeButtons = [
      { value: 'system', icon: 'monitor', key: 'header.system' },
      { value: 'light', icon: 'sun', key: 'header.light' },
      { value: 'dark', icon: 'moon', key: 'header.dark' },
    ];
    // mpages 胶囊式 radio group:选中项反白填充,未选中悬停高亮
    var themeGroup =
      '<div class="theme-switch" role="group">' +
      themeButtons
        .map(function (b) {
          return (
            '<button type="button" data-theme-btn="' +
            b.value +
            '" aria-pressed="' +
            (theme === b.value) +
            '" class="' +
            (theme === b.value ? 'is-checked' : '') +
            '" data-tip="' +
            t(b.key) +
            '" aria-label="' +
            t(b.key) +
            '">' +
            icon().iconSvg(b.icon) +
            '<span class="sr-only">' +
            t(b.key) +
            '</span></button>'
          );
        })
        .join('') +
      '</div>';

    var langItems = [
      { value: 'zh-CN', native: '简体中文', short: '简体' },
      { value: 'zh-TW', native: '繁體中文', short: '繁體' },
      { value: 'en', native: 'English', short: 'EN' },
    ];
    var langMenu =
      '<div class="relative" data-dropdown>' +
      '<button type="button" data-dropdown-trigger data-slot="button" class="' +
      ui().buttonClass('ghost', 'icon-sm', 'size-7') +
      '" aria-label="' +
      t('header.language') +
      '" data-tip="' +
      t('header.language') +
      '">' +
      icon().iconSvg('languages', { class: 'size-4' }) +
      '<span class="sr-only">' +
      t('header.language') +
      '</span></button>' +
      '<div data-dropdown-menu class="' +
      ui().dropdownContentClass('min-w-44') +
      '" data-side="bottom" role="menu">' +
      '<div class="' +
      ui().dropdownLabelClass('text-xs text-muted-foreground') +
      '">' +
      t('header.language') +
      '</div>' +
      ui().dropdownSeparator() +
      langItems
        .map(function (l) {
          return (
            '<button type="button" role="menuitem" data-lang="' +
            l.value +
            '" class="' +
            ui().dropdownItemClass('gap-2') +
            '">' +
            '<span class="flex w-4 justify-center">' +
            (locale === l.value ? icon().iconSvg('check', { class: 'size-4' }) : '') +
            '</span>' +
            '<span class="min-w-0 flex-1 truncate">' +
            l.native +
            '</span>' +
            '<span class="text-xs text-muted-foreground">' +
            l.short +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>';

    return (
      '<header class="relative isolate z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3">' +
      '<button type="button" data-sidebar-trigger data-slot="button" class="' +
      ui().buttonClass('ghost', 'icon-sm', 'size-7') +
      '" aria-label="Toggle Sidebar" data-tip="Toggle Sidebar">' +
      icon().iconSvg('panel-left', { class: 'size-4' }) +
      '<span class="sr-only">Toggle Sidebar</span></button>' +
      '<div class="flex items-center gap-1.5 text-sm text-muted-foreground">' +
      '<span class="font-medium text-foreground">One API</span></div>' +
      '<div class="ms-auto flex items-center gap-1.5">' +
      langMenu +
      themeGroup +
      '<button type="button" data-sheet-trigger data-slot="button" class="' +
      ui().buttonClass('ghost', 'icon-sm', 'size-7') +
      '" aria-label="' +
      t('settings.title') +
      '" data-tip="' +
      t('settings.title') +
      '">' +
      icon().iconSvg('palette', { class: 'size-4' }) +
      '</button>' +
      '<button type="button" data-signout data-slot="button" class="' +
      ui().buttonClass('ghost', 'icon-sm', 'size-7') +
      '" data-tip="' +
      t('sidebar.signOut') +
      '" aria-label="' +
      t('sidebar.signOut') +
      '">' +
      icon().iconSvg('log-out', { class: 'size-4' }) +
      '</button>' +
      '</div></header>'
    );
  }

  /** 完整 App Shell(侧边栏 + 顶栏 + 内容区) */
  function renderShell(settings, t, pathname, navItems, openSubmenus) {
    return (
      '<div class="group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar h-full min-h-0!" style="--sidebar-width:' +
      settings.sidebarWidth +
      'px;--sidebar-width-icon:3rem" data-slot="sidebar-wrapper">' +
      sidebarHtml(navItems, settings, t, pathname, openSubmenus) +
      '<main data-slot="sidebar-inset" class="relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 flex min-h-0 flex-1 flex-col">' +
      headerHtml(t, settings) +
      '<div data-slot="scroll-area" class="relative min-h-0 flex-1">' +
      '<div data-slot="scroll-area-viewport" class="size-full overflow-y-auto rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1">' +
      '<div data-content-area class="p-4"></div>' +
      '</div></div></main></div>'
    );
  }

  // ---------- 主题设置面板(Sheet):radio-group 卡片统一用 App.ui.radio(样式 app.css .rg-*) ----------
  function renderSettingsSheet(s, t) {
    var settings = App.settings;
    var radio = App.ui.radio;
    var layout =
      s.sidebarVariant === 'inset'
        ? 'default'
        : s.sidebarCollapsible === 'offcanvas'
          ? 'offcanvas'
          : 'icon';
    var themeItems = App.settings.THEME_ITEMS;
    var sidebarItems = App.settings.SIDEBAR_ITEMS;
    var layoutItems = App.settings.LAYOUT_ITEMS;

    return (
      '<div data-settings-sheet role="dialog" aria-modal="true" class="fixed inset-y-0 right-0 z-50 flex h-full w-3/4 flex-col gap-4 border-l bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg sm:max-w-sm">' +
      '<div class="pb-0 pl-4 pr-4 pt-4 text-start">' +
      '<h2 class="font-heading text-lg font-semibold leading-snug">' +
      t('settings.title') +
      '</h2>' +
      '<p class="text-sm text-muted-foreground">' +
      t('settings.description') +
      '</p>' +
      '<button type="button" data-sheet-close data-slot="button" class="absolute top-3 right-3 ' +
      ui().buttonClass('ghost', 'icon-sm', 'size-7 rounded-lg') +
      '" aria-label="' +
      t('settings.close') +
      '">' +
      icon().iconSvg('x', { class: 'size-4' }) +
      '</button>' +
      '</div>' +
      '<div data-sheet-scroll class="min-h-0 flex-1 overflow-y-auto">' +
      '<div class="space-y-6 p-4">' +
      '<div>' +
      radio.sectionTitle(t('settings.theme')) +
      '<div class="' +
      radio.gridClass(3) +
      '">' +
      themeItems
        .map(function (item) {
          return radio.iconCard(
            item.icon,
            t(item.labelKey),
            s.theme === item.value,
            true,
            'theme:' + item.value
          );
        })
        .join('') +
      '</div></div>' +
      '<div class="max-md:hidden">' +
      radio.sectionTitle(t('settings.sidebar')) +
      '<div class="' +
      radio.gridClass(3) +
      '">' +
      sidebarItems
        .map(function (item) {
          return radio.iconCard(
            item.icon,
            t(item.labelKey),
            s.sidebarVariant === item.value,
            false,
            'sidebar:' + item.value
          );
        })
        .join('') +
      '</div></div>' +
      '<div class="max-md:hidden">' +
      radio.sectionTitle(t('settings.layout')) +
      '<div class="' +
      radio.gridClass(3) +
      '">' +
      layoutItems
        .map(function (item) {
          return radio.iconCard(
            item.icon,
            t(item.labelKey),
            layout === item.value,
            false,
            'layout:' + item.value
          );
        })
        .join('') +
      '</div></div>' +
      '<div>' +
      radio.sectionTitleToggle(
        t('settings.baseColor'),
        s.appearance.useBase !== false,
        'base',
        t('settings.useBase')
      ) +
      '<div>' +
      radio.swatchPicker(s.appearance.baseColor, settings.BASE_COLORS, 7, 'base') +
      '</div></div>' +
      '<div>' +
      radio.sectionTitleToggle(
        t('settings.chartColor'),
        s.appearance.useAccent !== false,
        'chart',
        t('settings.useAccent')
      ) +
      '<div>' +
      radio.swatchPicker(
        s.appearance.chartColor,
        [s.appearance.baseColor].concat(settings.CHART_COLORS),
        6,
        'chart'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.style')) +
      '<div>' +
      radio.segmented(
        settings.STYLES.map(function (st) {
          return { value: st, label: st };
        }),
        s.appearance.style,
        4,
        'style'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.bodyFont')) +
      '<div>' +
      radio.segmented(
        settings.FONTS.map(function (f) {
          return { value: f.value, label: f.label };
        }),
        s.appearance.bodyFont,
        3,
        'body-font'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.headingFont')) +
      '<div>' +
      radio.segmented(
        settings.FONTS.map(function (f) {
          return { value: f.value, label: f.label };
        }),
        s.appearance.headingFont,
        3,
        'heading-font'
      ) +
      '</div></div>' +
      radio.readonlyRow(t('settings.iconLibrary'), t('settings.lucide')) +
      '<div>' +
      radio.sectionTitle(t('settings.radius')) +
      '<div>' +
      radio.segmented(
        settings.RADII.map(function (r) {
          return { value: r.value, label: t(r.labelKey) };
        }),
        s.appearance.radius,
        3,
        'radius'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.menuColor')) +
      '<div>' +
      radio.segmented(
        [
          { value: 'default', label: t('settings.menuColorOptions.default') },
          { value: 'inverted', label: t('settings.menuColorOptions.inverted') },
        ],
        s.appearance.menuColor,
        2,
        'menu-color'
      ) +
      '</div></div>' +
      '<div>' +
      radio.sectionTitle(t('settings.menuAppearance')) +
      '<div>' +
      radio.segmented(
        [
          { value: 'solid', label: t('settings.menuAppearanceOptions.solid') },
          { value: 'translucent', label: t('settings.menuAppearanceOptions.translucent') },
        ],
        s.appearance.menuAppearance,
        2,
        'menu-appearance'
      ) +
      '</div></div>' +
      radio.readonlyRow(t('settings.menuAccent'), t('settings.subtle')) +
      '</div></div>' +
      '<div class="border-t p-4">' +
      '<button type="button" data-reset-settings data-slot="button" class="w-full ' +
      ui().buttonClass('destructive') +
      '">' +
      icon().iconSvg('rotate-ccw', { class: 'size-4' }) +
      t('settings.resetAll') +
      '</button></div></div>'
    );
  }

  /** 设置变更后重建设置面板(保留滚动位置) */
  function rerenderSheetContent(s, t) {
    var sheet = document.querySelector('[data-settings-sheet]');
    if (!sheet) return;
    var scrollEl = sheet.querySelector('[data-sheet-scroll]');
    var scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    var shell = document.createElement('div');
    shell.innerHTML = renderSettingsSheet(s, t);
    var fresh = shell.firstElementChild;
    sheet.replaceWith(fresh);
    var newScroll = document.querySelector('[data-settings-sheet] [data-sheet-scroll]');
    if (newScroll) newScroll.scrollTop = scrollTop;
  }

  window.App = window.App || {};
  App.shell = {
    sidebarHtml: sidebarHtml,
    headerHtml: headerHtml,
    renderShell: renderShell,
    renderSettingsSheet: renderSettingsSheet,
    rerenderSheetContent: rerenderSheetContent,
  };
})();
