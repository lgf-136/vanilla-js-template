/* ============================================================
 * chat-dialogs.js — chats 模块·弹窗域(装配入口)
 * ------------------------------------------------------------
 * 按弹窗类型拆分为三个兄弟文件,本文件含 供应商弹窗 + 提示词管理
 * 并 re-export 其余弹窗(消费方统一从 ./chat-dialogs.js 引用):
 *   chat-dialogs-util.js   fieldHtml / inputValue 共享表单工具
 *   chat-dialogs-skill.js  技能管理/表单
 *   chat-dialogs-mcp.js    MCP 弹窗 + 供应商管理 + API Key 弹窗
 * 全部使用 App.ui.dialog;交互事件由 chat-events 委托处理。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon } from './chat-store.js';
import { fieldHtml, inputValue } from './chat-dialogs-util.js';
import { saveCustomProvider, saveCustomPrompt } from './chat-actions.js';

/* ============================================================
 * 供应商弹窗
 * ============================================================ */
export function openProviderDialog(provider) {
  var isEdit = !!provider;
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(isEdit ? t('chats.providerEdit') : t('chats.addProvider')) + '</h3>',
    body:
      '<div class="ch-dlg-form">' +
      fieldHtml(t('chats.providerName'), '<input type="text" class="ch-input-sm" data-ch-act="prov-name" value="' + escAttr((provider && provider.name) || '') + '" placeholder="' + escAttr(t('chats.providerNamePlaceholder')) + '" />') +
      fieldHtml(t('chats.providerBaseUrl'), '<input type="text" class="ch-input-sm" data-ch-act="prov-baseurl" value="' + escAttr((provider && provider.baseUrl) || '') + '" placeholder="https://api.example.com/v1" />') +
      fieldHtml(
        t('chats.providerKind'),
        '<div class="ch-seg" role="tablist">' +
          ['openai', 'anthropic']
            .map(function (k) {
              return (
                '<button type="button" role="tab" aria-selected="' +
                ((provider ? provider.kind : 'openai') === k ? 'true' : 'false') +
                '" class="ch-seg-item' +
                ((provider ? provider.kind : 'openai') === k ? ' is-on' : '') +
                '" data-ch-act="prov-kind" data-value="' +
                k +
                '">' +
                esc(k === 'openai' ? 'OpenAI' : 'Anthropic') +
                '</button>'
              );
            })
            .join('') +
          '</div>'
      ) +
      fieldHtml(t('chats.providerApiKey'), '<input type="password" class="ch-input-sm" data-ch-act="prov-apikey" value="' + escAttr('') + '" placeholder="' + escAttr(t('chats.apiKeyPlaceholder')) + '" autocomplete="off" />') +
      fieldHtml(
        t('chats.providerModels'),
        '<input type="text" class="ch-input-sm" data-ch-act="prov-models" value="' +
          escAttr(((provider && provider.models) || []).join(', ')) +
          '" placeholder="' +
          escAttr(t('chats.providerModelsPlaceholder')) +
          '" />'
      ) +
      '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="prov-save" data-id="' +
      escAttr((provider && provider.id) || '') +
      '">' +
      esc(t('chats.save')) +
      '</button>',
  });
}

export function confirmSaveProvider(id) {
  var name = inputValue('[data-ch-act="prov-name"]');
  var baseUrl = inputValue('[data-ch-act="prov-baseurl"]');
  var apiKey = inputValue('[data-ch-act="prov-apikey"]');
  var models = inputValue('[data-ch-act="prov-models"]');
  var kind = document.querySelector('[data-ch-act="prov-kind"].is-on');
  if (!name || !baseUrl) {
    App.ui.toast(t('chats.providerRequired'), 'error');
    return;
  }
  saveCustomProvider({
    id: id || '',
    name: name,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: apiKey,
    kind: kind ? kind.getAttribute('data-value') : 'openai',
    models: models
      .split(',')
      .map(function (m) { return m.trim(); })
      .filter(Boolean),
  });
}

/* ============================================================
 * 提示词管理
 * ============================================================ */
export function openPromptManageDialog(editPrompt) {
  var prompts = (state.config && state.config.prompts) || [];
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(t('chats.promptManage')) + '</h3>',
    body:
      '<div class="ch-dlg-list">' +
      prompts
        .map(function (p) {
          return (
            '<div class="ch-dlg-row">' +
            '<div class="ch-dlg-row-main">' +
            '<span class="ch-dlg-row-name">' +
            esc(p.name) +
            '</span>' +
            '<span class="ch-dlg-row-preview">' +
            esc((p.content || '').slice(0, 60)) +
            '</span>' +
            '</div>' +
            '<span class="ch-dlg-row-actions">' +
            '<button type="button" class="ch-icon-btn" data-ch-act="prompt-edit" data-id="' +
            escAttr(p.id) +
            '" data-tip="' +
            escAttr(t('chats.edit')) +
            '" aria-label="' +
            escAttr(t('chats.edit')) +
            '">' +
            icon('pencil', 'size-3.5') +
            '</button>' +
            '<button type="button" class="ch-icon-btn is-danger" data-ch-act="prompt-delete" data-id="' +
            escAttr(p.id) +
            '" data-tip="' +
            escAttr(t('chats.delete')) +
            '" aria-label="' +
            escAttr(t('chats.delete')) +
            '">' +
            icon('trash-2', 'size-3.5') +
            '</button>' +
            '</span>' +
            '</div>'
          );
        })
        .join('') +
      '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.close')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="new-prompt">' +
      icon('plus', 'size-3.5') +
      esc(t('chats.newPrompt')) +
      '</button>',
  });
}

export function openPromptForm(editPrompt) {
  var isEdit = !!editPrompt;
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(isEdit ? t('chats.promptEdit') : t('chats.newPrompt')) + '</h3>',
    body:
      '<div class="ch-dlg-form">' +
      fieldHtml(t('chats.name'), '<input type="text" class="ch-input-sm" data-ch-act="prompt-name" value="' + escAttr((editPrompt && editPrompt.name) || '') + '" />') +
      fieldHtml(
        t('chats.promptContent'),
        '<textarea class="ch-input-sm ch-dlg-textarea" data-ch-act="prompt-content" rows="8" placeholder="' +
          escAttr(t('chats.promptContentPlaceholder')) +
          '">' +
          esc((editPrompt && editPrompt.content) || '') +
          '</textarea>'
      ) +
      '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="prompt-save" data-id="' +
      escAttr((editPrompt && editPrompt.id) || '') +
      '">' +
      esc(t('chats.save')) +
      '</button>',
  });
}

export function confirmSavePrompt(id) {
  var name = inputValue('[data-ch-act="prompt-name"]');
  var content = inputValue('[data-ch-act="prompt-content"]');
  if (!name || !content) {
    App.ui.toast(t('chats.promptRequired'), 'error');
    return;
  }
  saveCustomPrompt({ id: id || '', name: name, content: content });
}

/* ============================================================
 * re-export(技能 / MCP / 供应商管理弹窗)
 * ============================================================ */
export {
  openSkillManageDialog,
  openSkillForm,
  confirmSaveSkill,
} from './chat-dialogs-skill.js';
export {
  openMcpDialog,
  confirmSaveMcp,
  openProviderManageDialog,
  openApiKeyDialog,
} from './chat-dialogs-mcp.js';
export { closePopover } from './chat-popover.js';
