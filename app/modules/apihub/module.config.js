const manifest = {
  id: 'apihub',
  icon: 'route',
  order: 6,
  i18nNamespace: 'apihub',
  loadRoot: () => import('./index.js'),
  children: [],
  title: { 'zh-CN': 'API Hub', 'zh-TW': 'API Hub', en: 'API Hub' },
  route: '/apihub',
  load: 'index.js',
  css: ['module.css', 'module-list.css', 'module-builder.css', 'module-overlays.css'],
  i18nFile: 'i18n.js',
};

window.App?.registerModule(manifest);
export default manifest;
