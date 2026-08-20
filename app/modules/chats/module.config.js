const manifest = {
  id: 'chats',
  icon: 'messages-square',
  order: 4,
  i18nNamespace: 'chats',
  loadRoot: () => import('./index.js'),
  deps: ['app/modules/chats/md.js', 'app/modules/chats/sse.js'],
  children: [],
  title: { 'zh-CN': '聊天', 'zh-TW': '聊天', en: 'Chats' },
  route: '/chats',
  load: 'index.js',
  css: 'module.css',
  i18nFile: 'i18n.js',
};

window.App?.registerModule(manifest);
export default manifest;
