/* ============================================================
 * chat-events.js — chats 模块·事件域(document 级委托,装配入口)
 * ------------------------------------------------------------
 * ⚠️ 副作用模块(仅注册监听器、无导出被消费):必须被 index.js
 *    显式 import,否则 ESM 不求值、监听器全部静默失效。
 *
 * 本文件承载主 click 委托(动作表分发)与通用弹层辅助;其余监听
 * 按职责拆分到兄弟文件并在此显式导入(顺序即监听器注册顺序):
 *   chat-events-helpers.js  会话右键 contextmenu + 供应商/MCP 删除
 *                           确认 + 查找/确认弹窗/headers 行辅助
 *   chat-events-input.js    input / keydown / paste / change / 滑块
 * 流式期间禁止切换会话(selectConversation 守卫)。
 * ============================================================ */
'use strict';

import {
  state,
  t,
  selectConversation,
  persistView,
} from './chat-store.js';
import { rerenderLeft, rerenderCenter, rerenderRight, rerenderHeader, renderFull } from './chat-view.js';
import { openPopover, closePopover, popoverEl } from './chat-popover.js';
import { ensureGroupTree, ensureTagTree, openTagPickerPopover, finishTagPicker } from './chat-left.js';
import { providerDropdownHtml, modelDropdownHtml, thinkingDropdownHtml, mcpDropdownHtml } from './chat-composer.js';
import { skillDropdownHtml, promptDropdownHtml, rightProviderDropdownHtml, maxTokensDropdownHtml } from './chat-right.js';
import {
  toggleFavorite,
  togglePin,
  toggleArchive,
  renameConversation,
  moveConversation,
  deleteConversation,
  confirmDeleteConversation,
  addGroup,
  addTag,
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
  saveCustomProvider,
  saveCustomPrompt,
  deleteCustomPrompt,
  saveCustomSkill,
  deleteCustomSkill,
  saveMcpServer,
  deleteMcpServer,
  fetchMcpTools,
  fetchModels,
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
} from './chat-actions.js';
import {
  openProviderDialog,
  openProviderManageDialog,
  openApiKeyDialog,
  confirmSaveProvider,
  openPromptManageDialog,
  openPromptForm,
  confirmSavePrompt,
  openSkillManageDialog,
  openSkillForm,
  confirmSaveSkill,
  openMcpDialog,
  confirmSaveMcp,
} from './chat-dialogs.js';
import { sendCurrent, stopStream } from './chat-stream.js';
// 副作用导入(注册监听器,勿删;顺序即注册顺序)
import { convMenu, effectiveWebSearch, effectiveMcpMaster, toggleThinking, toggleTool, copyText, inputValue, findSkill, findPrompt, findCustomProvider, findMcp, deleteProviderWithConfirm, deleteMcpWithConfirm, addHeaderRow, removeHeaderRow } from './chat-events-helpers.js';
import './chat-events-input.js';

/* ---------- 通用 ---------- */
function actEl(t) {
  return t.closest('[data-ch-act]');
}
function insidePopover(t) {
  return t.closest('[data-ch-pop]');
}

/* ---------- 打开/关闭下拉浮层 ---------- */
function openDd(anchorEl, html, width) {
  return openPopover(anchorEl, html, { width: width || '280px' });
}
function closeDd() {
  closePopover();
  document.querySelectorAll('[data-ch-act][aria-expanded]').forEach(function (el) {
    el.setAttribute('aria-expanded', 'false');
  });
}

/* ============================================================
 * click 委托
 * ============================================================ */
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;

  // 标签浮层完成按钮(组件自带 data-tp-done,在本模块浮层内收尾)
  if (t.closest('[data-ch-pop]') && t.closest('[data-tp-done]')) {
    var cid0 = t.closest('[data-ch-pop]').getAttribute('data-ch-tagconv');
    if (cid0) finishTagPicker(cid0);
    return;
  }
  // 点击浮层外关闭(标签浮层内部除外)
  if (popoverEl && !t.closest('[data-ch-pop]')) {
    closePopover();
  }

  var act = actEl(t);
  if (!act) return;
  var action = act.getAttribute('data-ch-act');
  var id = act.getAttribute('data-id') || '';
  var value = act.getAttribute('data-value') || '';
  var anchor = act;

  // 浮层内动作:默认收起浮层(多选/搜索除外)
  var inPop = insidePopover(t);
  var keepOpen = ['tp-pick', 'tp-create', 'tp-close', 'tp-done', 'model-search', 'provider-search'].indexOf(action) !== -1;

  switch (action) {
    /* ---- 左栏 ---- */
    case 'filter':
      state.view.filter = value;
      rerenderLeft();
      break;
    case 'clear-search':
      state.view.search = '';
      rerenderLeft();
      break;
    case 'select-conv':
      if (state.streaming && state.streaming.active) {
        App.ui.toast(t('chats.noSwitchWhileStreaming'), 'error');
        break;
      }
      selectConversation(act.getAttribute('data-ch-conv'));
      break;
    case 'conv-menu':
      convMenu(act.getAttribute('data-ch-conv'), anchor);
      break;
    case 'conv-fav':
      toggleFavorite(id);
      break;
    case 'conv-pin':
      togglePin(id);
      break;
    case 'conv-archive':
      toggleArchive(id);
      break;
    case 'conv-rename':
      renameConversation(id);
      break;
    case 'conv-move':
      moveConversation(id, act.getAttribute('data-group') || '');
      break;
    case 'conv-tags':
      openTagPickerPopover(id, anchor);
      break;
    case 'conv-delete':
      deleteConversation(id);
      break;
    case 'dlg-confirm-delete':
      confirmDeleteConversation(id);
      break;
    case 'left-tab':
      state.view.leftTab = value;
      rerenderLeft();
      break;
    case 'gt-collapseall':
      ensureGroupTree().collapseAll();
      rerenderLeft();
      break;
    case 'gt-expandall':
      ensureGroupTree().expandAll();
      rerenderLeft();
      break;
    case 'gt-newgroup':
      ensureGroupTree().createDialog('');
      break;
    case 'tp-clearcolor':
      ensureTagTree().setManagerColor('');
      rerenderLeft();
      break;
    case 'tp-newtag':
      ensureTagTree().openCreateDialog(anchor);
      break;
    case 'tp-close':
      closePopover();
      break;

    /* ---- 中栏顶栏 ---- */
    case 'toggle-left':
      state.view.leftOpen = !state.view.leftOpen;
      persistView();
      rerenderHeader();
      renderFull();
      break;
    case 'toggle-right':
      state.view.rightOpen = !state.view.rightOpen;
      persistView();
      rerenderHeader();
      renderFull();
      break;
    case 'close-right':
      state.view.rightOpen = false;
      persistView();
      renderFull();
      break;
    case 'right-tab':
      state.view.rightTab = value;
      rerenderRight();
      break;
    case 'center-title':
      // 点击标题回到消息底部
      var area = document.querySelector('[data-ch-messages]');
      if (area) area.scrollTop = area.scrollHeight;
      break;
    case 'stop':
      stopStream();
      break;

    /* ---- 输入框 ---- */
    case 'send':
      sendCurrent();
      break;
    case 'provider-dd':
      openDd(anchor, providerDropdownHtml(), '300px');
      break;
    case 'model-dd':
      openDd(anchor, modelDropdownHtml(), '320px');
      break;
    case 'thinking-dd':
      openDd(anchor, thinkingDropdownHtml(), '300px');
      break;
    case 'mcp-dd':
      openDd(anchor, mcpDropdownHtml(), '320px');
      break;
    case 'set-provider':
      setProvider(id);
      break;
    case 'set-model':
      setModel(value);
      break;
    case 'set-thinking':
      setThinking(value);
      break;
    case 'toggle-websearch':
      setWebSearch(!(effectiveWebSearch()));
      break;
    case 'set-webprovider':
      setWebProvider(value);
      break;
    case 'mcp-master':
      setMcpMaster(!effectiveMcpMaster());
      break;
    case 'mcp-server':
      setMcpServer(id, !(act.getAttribute('aria-checked') === 'true'));
      break;
    case 'mcp-tool':
      setMcpTool(id, act.getAttribute('data-tool') || '', !(act.getAttribute('aria-checked') === 'true'));
      break;
    case 'insert-image':
      insertRemoteUrl('image');
      break;
    case 'insert-file':
      insertRemoteUrl('file');
      break;
    case 'remove-att':
      removeAttachment(Number(value || act.getAttribute('data-index') || 0));
      break;
    case 'remote-url-apply':
      applyRemoteUrl(act.getAttribute('data-kind') || 'file');
      break;

    /* ---- 消息操作 ---- */
    case 'copy-msg':
      copyMessage(id);
      break;
    case 'edit-msg':
      editMessage(id);
      break;
    case 'retry-msg':
      retryMessage(id);
      break;
    case 'feedback':
      setFeedback(id, value);
      break;
    case 'toggle-think':
      toggleThinking(id);
      break;
    case 'toggle-tool':
      toggleTool(id, Number(act.getAttribute('data-index') || 0));
      break;
    case 'copy-code': {
      var code = act.getAttribute('data-code') || '';
      copyText(code);
      break;
    }

    /* ---- 右栏:参数 ---- */
    case 'skill-dd':
      openDd(anchor, skillDropdownHtml(), '300px');
      break;
    case 'set-skill':
      setSkill(id);
      break;
    case 'skill-manage':
      openSkillManageDialog();
      break;
    case 'new-skill':
      openSkillForm(null);
      break;
    case 'skill-edit':
      openSkillForm(findSkill(id));
      break;
    case 'skill-delete':
      deleteCustomSkill(id);
      break;
    case 'skill-save':
      confirmSaveSkill(id);
      break;
    case 'prompt-dd':
      openDd(anchor, promptDropdownHtml(), '320px');
      break;
    case 'set-prompt':
      setPrompt(id);
      break;
    case 'prompt-manage':
      openPromptManageDialog();
      break;
    case 'new-prompt':
      openPromptForm(null);
      break;
    case 'prompt-edit':
      openPromptForm(findPrompt(id));
      break;
    case 'prompt-delete':
      deleteCustomPrompt(id);
      break;
    case 'prompt-save':
      confirmSavePrompt(id);
      break;
    case 'right-provider-dd':
      openDd(anchor, rightProviderDropdownHtml(), '320px');
      break;
    case 'provider-manage':
      openProviderManageDialog();
      break;
    case 'provider-edit':
      openProviderDialog(findCustomProvider(id));
      break;
    case 'provider-delete':
      deleteProviderWithConfirm(id);
      break;
    case 'provider-apikey':
      openApiKeyDialog(id);
      break;
    case 'apikey-save':
      saveApiKey(id, inputValue('[data-ch-act="apikey-input"]'));
      App.ui.closeDialog();
      break;
    case 'new-provider':
      openProviderDialog(null);
      break;
    case 'prov-kind': {
      document.querySelectorAll('[data-ch-act="prov-kind"]').forEach(function (el) {
        el.classList.toggle('is-on', el === act);
      });
      break;
    }
    case 'prov-save':
      confirmSaveProvider(id);
      break;
    case 'fetch-models':
      fetchModels();
      break;
    case 'maxtokens-dd':
      openDd(anchor, maxTokensDropdownHtml(), '240px');
      break;
    case 'set-maxtokens':
      setMaxTokens(value);
      break;
    case 'maxtokens-apply':
      setMaxTokens(inputValue('[data-ch-act="maxtokens-input"]'));
      break;

    /* ---- 右栏:MCP ---- */
    case 'mcp-fetch':
      fetchMcpTools(id);
      break;
    case 'mcp-edit':
      openMcpDialog(findMcp(id));
      break;
    case 'mcp-delete':
      deleteMcpWithConfirm(id);
      break;
    case 'mcp-save':
      confirmSaveMcp(id);
      break;
    case 'mcp-header-add':
      addHeaderRow();
      break;
    case 'mcp-header-remove':
      removeHeaderRow(Number(act.getAttribute('data-index') || 0));
      break;
    case 'mcp-protocol': {
      document.querySelectorAll('[data-ch-act="mcp-protocol"]').forEach(function (el) {
        el.classList.toggle('is-on', el === act);
      });
      break;
    }
    case 'mcp-enable':
      act.classList.toggle('is-on');
      act.setAttribute('aria-checked', act.classList.contains('is-on') ? 'true' : 'false');
      break;
    case 'mcp-tools-toggle':
      setMcpToolsOpen(id, !(act.parentNode && act.parentNode.querySelector('.ch-mcp-tools-body').classList.contains('is-open')));
      break;
    case 'mcp-tool-toggle':
      setMcpToolOpen(id, act.getAttribute('data-tool') || '', !(act.parentNode && act.parentNode.querySelector('.ch-mcp-tool-desc')));
      break;
    case 'add-mcp':
      openMcpDialog(null);
      break;
    case 'open-mcp-tab':
      state.view.rightOpen = true;
      state.view.rightTab = 'mcp';
      persistView();
      renderFull();
      break;

    /* ---- 弹窗通用 ---- */
    case 'dlg-close':
      App.ui.closeDialog();
      break;
    case 'dlg-confirm-prompt':
      confirmPromptDialog();
      break;
  }

  // 浮层内动作默认收起(除 keepOpen)
  if (inPop && !keepOpen) closePopover();
});
