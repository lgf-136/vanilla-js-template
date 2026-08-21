/* ============================================================
 * dropdown.js — 下拉菜单族（ui.js ESM 拆分，拆分设计总览见 ../index.js 头注）
 * ------------------------------------------------------------
 * 职责：dropdownTrigger/Content/Item/Label 类生成器与 separator 渲染。
 * 副作用：模块求值时注入下拉悬停/按下反馈样式
 *         （<style data-dropdown-style>，编译产物 app.css 仅含 :focus 规则），
 *         随本文件 import 即注册，行为与拆分前一致。
 * 依赖 utils.js 的 cn；对外挂载统一由 core/index.js 完成。
 * ============================================================ */
'use strict';

import { cn } from './utils.js';

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

export {
  dropdownTriggerClass,
  dropdownContentClass,
  dropdownItemClass,
  dropdownLabelClass,
  dropdownSeparator,
};
