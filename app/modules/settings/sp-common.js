/* ============================================================
 * sp-common.js — 设置模块跨页共享框架（C5 拆分）
 * ------------------------------------------------------------
 * 页内子导航清单 NAV 与通用区块布局 contentSection。
 * 各设置页（sp-*.js）与入口 index.js 共同消费；本文件不依赖任何页面。
 * ============================================================ */
'use strict';

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

export { NAV, contentSection };
