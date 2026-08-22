/* ============================================================
 * interactions.js — 交互层(零依赖)
 * ------------------------------------------------------------
 * 从 app.js 拆出的自包含交互逻辑,保持内核职责单一:
 * - 拖拽调整侧边栏宽度(pointer 事件 + rAF 节流)
 * - 移动端抽屉侧边栏(<768px 由 data-sidebar-trigger 打开)
 * 状态由 DOM 自身持有,不依赖 app.js 内部闭包;
 * 需要内核能力时通过 App 公开 API 调用。
 * ============================================================ */
(function () {
  'use strict';

  var app = document.getElementById('app');

  // ---------- 拖拽调整侧边栏宽度 ----------
  var dragging = false;
  var rafId = null;
  var lastX = 0;
  var dragWidth = 0;

  document.addEventListener('pointerdown', function (e) {
    var handle = e.target.closest ? e.target.closest('[data-resize-handle]') : null;
    if (!handle) return;
    dragging = true;
    document.body.classList.add('sidebar-resizing');
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  });

  function applyDragWidth() {
    rafId = null;
    var wrapper = app.querySelector('[data-slot="sidebar-wrapper"]');
    if (!wrapper) return;
    var left = wrapper.getBoundingClientRect().left;
    dragWidth = Math.min(
      App.settings.SIDEBAR_MAX_WIDTH,
      Math.max(App.settings.SIDEBAR_MIN_WIDTH, Math.round(lastX - left))
    );
    wrapper.style.setProperty('--sidebar-width', dragWidth + 'px');
  }

  document.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    lastX = e.clientX;
    if (rafId === null) rafId = requestAnimationFrame(applyDragWidth);
  });

  function endResize() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('sidebar-resizing');
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (dragWidth && typeof App.setSidebarWidth === 'function') App.setSidebarWidth(dragWidth);
  }
  document.addEventListener('pointerup', endResize);
  document.addEventListener('pointercancel', endResize);
  document.addEventListener('lostpointercapture', endResize);

  // ---------- 移动端侧边栏 ----------
  var mql = window.matchMedia('(max-width: 767px)');
  var isMobile = mql.matches;

  function openMobileSidebar() {
    if (document.querySelector('[data-mobile-sidebar]')) return;
    var overlay = document.createElement('div');
    overlay.dataset.mobileOverlay = '';
    overlay.className = 'fixed inset-0 z-40 bg-black/50';
    overlay.addEventListener('click', closeMobileSidebar);
    var sheet = document.createElement('div');
    sheet.dataset.mobileSidebar = '';
    sheet.className =
      'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-lg';
    var ctx = App.getShellContext();
    sheet.innerHTML = App.shell.sidebarHtml(
      ctx.navItems,
      ctx.settings,
      App.i18n.makeT(ctx.settings.locale),
      ctx.pathname,
      ctx.openSubmenus
    );
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className =
      'absolute top-3 right-3 flex size-7 items-center justify-center rounded-lg hover:bg-sidebar-accent';
    closeBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
    // aria-label 走核心词典(红线 17,不硬编码英文)
    closeBtn.setAttribute(
      'aria-label',
      App.i18n.makeT(document.documentElement.lang || App.i18n.DEFAULT_LOCALE)('sidebar.closeSidebar')
    );
    closeBtn.addEventListener('click', closeMobileSidebar);
    sheet.append(closeBtn);
    document.body.append(overlay, sheet);
  }

  function closeMobileSidebar() {
    var overlay = document.querySelector('[data-mobile-overlay]');
    if (overlay) overlay.remove();
    var sheet = document.querySelector('[data-mobile-sidebar]');
    if (sheet) sheet.remove();
  }

  mql.addEventListener('change', function (ev) {
    isMobile = ev.matches;
    if (!isMobile) closeMobileSidebar();
  });

  window.App = window.App || {};
  App.interactions = {
    isMobile: function () {
      return isMobile;
    },
    openMobileSidebar: openMobileSidebar,
    closeMobileSidebar: closeMobileSidebar,
  };
})();
