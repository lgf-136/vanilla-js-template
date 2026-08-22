/* ============================================================
 * chat-actions.js — chats 模块·动作域(装配入口)
 * ------------------------------------------------------------
 * 按业务职责拆分为五个兄弟文件,本文件仅做 re-export 汇总
 * (消费方统一从 ./chat-actions.js 引用,拆分不改变任何调用方):
 *   chat-actions-conv.js    会话 CRUD(收藏/置顶/存档/重命名/标签/删除)
 *   chat-actions-groups.js  分组 + 标签 CRUD
 *   chat-actions-params.js  参数保存(三层覆盖)+ API Key
 *   chat-actions-config.js  供应商/提示词/技能/MCP CRUD + 模型拉取
 *   chat-actions-msg.js     附件管理 + 消息操作 + promptDialog
 * 依赖方向:conv/groups → store/view;config → params → store/view;
 * msg → store/view/util(conv 复用 msg 的 promptDialog,单向)。
 * ============================================================ */
'use strict';

export {
  toggleFavorite,
  togglePin,
  toggleArchive,
  renameConversation,
  moveConversation,
  setConversationTags,
  deleteConversation,
  confirmDeleteConversation,
} from './chat-actions-conv.js';
export {
  addGroup,
  renameGroup,
  deleteGroup,
  moveGroup,
  setGroupIcon,
  setGroupColor,
  addTag,
  renameTag,
  deleteTag,
  setTagColor,
} from './chat-actions-groups.js';
export {
  setProvider,
  setModel,
  setPrompt,
  setSkill,
  setThinking,
  setParam,
  setMaxTokens,
  setWebSearch,
  setWebProvider,
  setMcpMaster,
  setMcpServer,
  setMcpTool,
  setMcpToolsOpen,
  setMcpToolOpen,
  saveApiKey,
} from './chat-actions-params.js';
export {
  saveCustomProvider,
  deleteCustomProvider,
  saveCustomPrompt,
  deleteCustomPrompt,
  saveCustomSkill,
  deleteCustomSkill,
  saveMcpServer,
  deleteMcpServer,
  fetchMcpTools,
  fetchModels,
} from './chat-actions-config.js';
export {
  addImageFiles,
  addFileFiles,
  insertRemoteUrl,
  applyRemoteUrl,
  removeAttachment,
  addPastedText,
  copyMessage,
  editMessage,
  retryMessage,
  setFeedback,
  promptDialog,
  confirmPromptDialog,
} from './chat-actions-msg.js';
