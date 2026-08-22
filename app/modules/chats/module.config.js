const manifest = {
  id: 'chats',
  icon: 'messages-square',
  order: 4,
  i18nNamespace: 'chats',
  loadRoot: () => import('./index.js'),
  children: [],
  title: { 'zh-CN': '聊天', 'zh-TW': '聊天', en: 'Chats' },
  route: '/chats',
  load: 'index.js',
  css: [
    'module.css',
    'chat-left.css',
    'chat-center.css',
    'chat-tools.css',
    'chat-input.css',
    'chat-right.css',
    'chat-mcp.css',
    'chat-common.css',
    'chat-popover.css',
    'chat-anim.css',
    'chat-mobile.css',
  ],
  i18nFile: 'i18n.js',
};

window.App?.registerModule(manifest);
export default manifest;
