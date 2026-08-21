/* ============================================================
 * settings 模块 — 入口装配（C5 拆分）
 * ------------------------------------------------------------
 * 拆分设计（一设置项一文件，各设置项解耦）：
 *
 *   index.js            入口：本设计说明、子导航渲染与路由分发、模块注册。
 *   sp-common.js        跨页共享框架：页内子导航清单 NAV、通用区块布局
 *                       contentSection。只被消费，不依赖任何页面。
 *   sp-profile.js       个人资料 —— 头像选择器 + 资料表单
 *                       （数据实时同步 settings:profile，邮箱落库前加密）。
 *   sp-account.js       账号 —— 语言下拉 + 自定义日历生日选择；
 *                       本页专属事件委托（下拉选项/日历翻页选日）一并收拢于此。
 *   sp-appearance.js    外观 —— 主题/风格/字体等 radio-group 卡片。
 *   sp-notifications.js 通知 —— 开关行（settings:notifications 实时同步）。
 *   sp-display.js       显示 —— 侧边栏可见性勾选（实时生效，含锁定项）。
 *
 * 依赖方向（单向，无循环）：
 *   index ──→ sp-common ──→ （无）
 *     ├──→ sp-profile / sp-account / sp-appearance /
 *     │     sp-notifications / sp-display
 *     └───────────────→ sp-common（各页导入区块布局）
 *
 * 约定：
 *   - 新增设置项 = 新建一个 sp-<item>.js（导出 page<Item>(ctx)），
 *     在 PAGES 注册一行 + module.config.js children 补一项，互不影响其他页；
 *   - 页面内私有控件助手（如 switchRow/displayRow/optSection/日历）随页文件走，
 *     跨页复用需上移 app/components/ui 或 sp-common；
 *   - 写值统一走 App.applySettingValue / App.settings，真实 input 的
 *     change/input 由核心层处理；纯按钮类自定义控件的委托随所属页面收拢。
 *
 * 只依赖核心层 App.ui / App.icon / App.settings / App.logger / ctx 与同模块 sp-* 文件。
 * ============================================================ */
'use strict';

import { NAV, contentSection } from './sp-common.js';
import { pageProfile } from './sp-profile.js';
import { pageAccount } from './sp-account.js';
import { pageAppearance } from './sp-appearance.js';
import { pageNotifications } from './sp-notifications.js';
import { pageDisplay } from './sp-display.js';

var icon = function () {
  return App.icon;
};

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

App.defineModule({ id: 'settings', render: render });
