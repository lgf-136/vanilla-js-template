/* ============================================================
 * shell/index.js — 装配：renderShell 组合侧边栏/顶栏/内容区并挂载 App.shell
 * ------------------------------------------------------------
 * Shell 拆分（C5）：sidebar.js 侧边栏 / header.js 顶栏 / sheet.js 设置 Sheet
 * （含原位重绘与滚动保持）。对外面 App.shell 五方法与拆分前逐字一致，
 * 消费方（app/core/app/* 与 interactions.js）零改动。
 * ============================================================ */
'use strict';

import { sidebarHtml } from './sidebar.js';
import { headerHtml } from './header.js';
import { renderSettingsSheet, rerenderSheetContent } from './sheet.js';

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

// 对外命名空间不变：App.shell（消费方：app/core/app/* 与 interactions.js）
window.App = window.App || {};
App.shell = {
  sidebarHtml: sidebarHtml,
  headerHtml: headerHtml,
  renderShell: renderShell,
  renderSettingsSheet: renderSettingsSheet,
  rerenderSheetContent: rerenderSheetContent,
};
