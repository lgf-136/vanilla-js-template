const children = [
  {
    id: 'profile',
    icon: 'user-cog',
    order: 1,
    title: { 'zh-CN': '个人资料', 'zh-TW': '個人資料', en: 'Profile' },
    route: '/settings',
  },
  {
    id: 'account',
    icon: 'wrench',
    order: 2,
    title: { 'zh-CN': '账户', 'zh-TW': '帳戶', en: 'Account' },
    route: '/settings/account',
  },
  {
    id: 'appearance',
    icon: 'palette',
    order: 3,
    title: { 'zh-CN': '外观', 'zh-TW': '外觀', en: 'Appearance' },
    route: '/settings/appearance',
  },
  {
    id: 'notifications',
    icon: 'bell',
    order: 4,
    title: { 'zh-CN': '通知', 'zh-TW': '通知', en: 'Notifications' },
    route: '/settings/notifications',
  },
  {
    id: 'display',
    icon: 'monitor',
    order: 5,
    title: { 'zh-CN': '显示', 'zh-TW': '顯示', en: 'Display' },
    route: '/settings/display',
  },
];

const manifest = {
  id: 'settings',
  icon: 'settings',
  order: 7,
  i18nNamespace: 'settings',
  loadRoot: () => import('./index.js'),
  title: { 'zh-CN': '设置', 'zh-TW': '設定', en: 'Settings' },
  route: '/settings',
  load: 'index.js',
  css: ['module.css', 'module-controls.css', 'module-pages.css'],
  i18nFile: 'i18n.js',
  children,
};

window.App?.registerModule(manifest);
export default manifest;
