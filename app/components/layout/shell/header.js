/* ============================================================
 * shell/header.js — 顶栏渲染（搜索/工作空间菜单/用户菜单/主题与设置入口）
 * ------------------------------------------------------------
 * Shell 拆分（C5）：装配与对外挂载 App.shell 见 index.js。
 * ============================================================ */
'use strict';


  var ui = function () {
    return App.ui;
  };
  var icon = function () {
    return App.icon;
  };

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

export {  };
