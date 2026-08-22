/* ============================================================
 * chat-dialogs-skill.js — chats 模块·弹窗域·技能 CRUD
 * ------------------------------------------------------------
 * openSkillManageDialog  技能列表管理(编辑/删除,内置 general 无删除)
 * openSkillForm          技能表单(名称/图标/描述/系统提示词/工具多选
 *                        [来源 = 已启用 MCP 服务器工具]/参数预设 JSON/
 *                        知识文档 RAG)
 * confirmSaveSkill       校验 + 收集表单值 → saveCustomSkill
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon } from './chat-store.js';
import { effectiveMcpTools } from './chat-logic.js';
import { fieldHtml, inputValue } from './chat-dialogs-util.js';
import { saveCustomSkill } from './chat-actions.js';

export function openSkillManageDialog(editSkill) {
  var skills = (state.config && state.config.skills) || [];
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(t('chats.skillManage')) + '</h3>',
    body:
      '<div class="ch-dlg-list">' +
      skills
        .map(function (s) {
          return (
            '<div class="ch-dlg-row">' +
            '<div class="ch-dlg-row-main">' +
            '<span class="ch-dlg-row-ic">' +
            icon(s.icon || 'sparkles', 'size-3.5') +
            '</span>' +
            '<span class="ch-dlg-row-name">' +
            esc(s.name) +
            '</span>' +
            '<span class="ch-dlg-row-preview">' +
            esc((s.description || '').slice(0, 50)) +
            '</span>' +
            '</div>' +
            '<span class="ch-dlg-row-actions">' +
            '<button type="button" class="ch-icon-btn" data-ch-act="skill-edit" data-id="' +
            escAttr(s.id) +
            '" data-tip="' +
            escAttr(t('chats.edit')) +
            '" aria-label="' +
            escAttr(t('chats.edit')) +
            '">' +
            icon('pencil', 'size-3.5') +
            '</button>' +
            (s.id === 'general'
              ? ''
              : '<button type="button" class="ch-icon-btn is-danger" data-ch-act="skill-delete" data-id="' +
                escAttr(s.id) +
                '" data-tip="' +
                escAttr(t('chats.delete')) +
                '" aria-label="' +
                escAttr(t('chats.delete')) +
                '">' +
                icon('trash-2', 'size-3.5') +
                '</button>') +
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
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="new-skill">' +
      icon('plus', 'size-3.5') +
      esc(t('chats.newSkill')) +
      '</button>',
  });
}

/** 技能表单:可选工具多选 = 已启用 MCP 服务器的工具 */
export function openSkillForm(editSkill) {
  var isEdit = !!editSkill;
  var effective = effectiveMcpTools((state.config && state.config.mcp) || [], true);
  var toolOptions = effective.map(function (e) { return e.tool.name; });
  var selected = (editSkill && editSkill.toolIds) || [];
  App.ui.dialog({
    head: '<h3 class="ch-dlg-title">' + esc(isEdit ? t('chats.skillEdit') : t('chats.newSkill')) + '</h3>',
    body:
      '<div class="ch-dlg-form">' +
      fieldHtml(t('chats.name'), '<input type="text" class="ch-input-sm" data-ch-act="skill-name" value="' + escAttr((editSkill && editSkill.name) || '') + '" />') +
      fieldHtml(t('chats.skillIcon'), '<input type="text" class="ch-input-sm" data-ch-act="skill-icon" value="' + escAttr((editSkill && editSkill.icon) || 'sparkles') + '" placeholder="sparkles / languages / search …" />') +
      fieldHtml(t('chats.skillDesc'), '<input type="text" class="ch-input-sm" data-ch-act="skill-desc" value="' + escAttr((editSkill && editSkill.description) || '') + '" />') +
      fieldHtml(
        t('chats.skillPrompt'),
        '<textarea class="ch-input-sm ch-dlg-textarea" data-ch-act="skill-prompt" rows="6" placeholder="' +
          escAttr(t('chats.skillPromptPlaceholder')) +
          '">' +
          esc((editSkill && editSkill.systemPrompt) || '') +
          '</textarea>'
      ) +
      (toolOptions.length
        ? fieldHtml(
            t('chats.skillTools'),
            '<div class="ch-dlg-tools">' +
              toolOptions
                .map(function (name) {
                  return (
                    '<label class="ch-dlg-check">' +
                    '<input type="checkbox" class="ch-hidden-check" data-ch-act="skill-tool" value="' +
                    escAttr(name) +
                    '"' +
                    (selected.indexOf(name) !== -1 ? ' checked' : '') +
                    ' />' +
                    '<span class="ch-dlg-checkbox">' +
                    (selected.indexOf(name) !== -1 ? icon('check', 'size-3') : '') +
                    '</span>' +
                    '<span class="ch-dlg-check-label">' +
                    esc(name) +
                    '</span>' +
                    '</label>'
                  );
                })
                .join('') +
            '</div>'
          )
        : fieldHtml(t('chats.skillTools'), '<p class="ch-field-desc">' + esc(t('chats.skillToolsEmpty')) + '</p>')) +
      fieldHtml(
        t('chats.skillParamsPreset'),
        '<textarea class="ch-input-sm ch-dlg-textarea ch-mono" data-ch-act="skill-params" rows="4" placeholder=\'{ "temperature": 0.5 }\'>' +
          esc(JSON.stringify((editSkill && editSkill.paramsPreset) || {}, null, 2)) +
          '</textarea>'
      ) +
      fieldHtml(
        t('chats.skillDocs'),
        '<textarea class="ch-input-sm ch-dlg-textarea" data-ch-act="skill-docs" rows="4" placeholder="' +
          escAttr(t('chats.skillDocsPlaceholder')) +
          '">' +
          esc(((editSkill && editSkill.knowledgeDocs) || []).join('\n---\n')) +
          '</textarea>'
      ) +
      '</div>',
    foot:
      '<button type="button" class="ch-btn" data-ch-act="dlg-close">' +
      esc(t('chats.cancel')) +
      '</button>' +
      '<button type="button" class="ch-btn ch-btn-primary" data-ch-act="skill-save" data-id="' +
      escAttr((editSkill && editSkill.id) || '') +
      '">' +
      esc(t('chats.save')) +
      '</button>',
  });
}

export function confirmSaveSkill(id) {
  var name = inputValue('[data-ch-act="skill-name"]');
  var iconName = inputValue('[data-ch-act="skill-icon"]') || 'sparkles';
  var desc = inputValue('[data-ch-act="skill-desc"]');
  var prompt = inputValue('[data-ch-act="skill-prompt"]');
  if (!name || !prompt) {
    App.ui.toast(t('chats.skillRequired'), 'error');
    return;
  }
  var toolIds = [];
  document.querySelectorAll('[data-ch-act="skill-tool"]:checked').forEach(function (el) {
    toolIds.push(el.value);
  });
  var paramsPreset = {};
  try {
    paramsPreset = JSON.parse(inputValue('[data-ch-act="skill-params"]') || '{}');
    if (typeof paramsPreset !== 'object' || Array.isArray(paramsPreset)) paramsPreset = {};
  } catch (e) {
    App.ui.toast(t('chats.skillParamsInvalid'), 'error');
    return;
  }
  var docs = inputValue('[data-ch-act="skill-docs"]')
    .split(/---+/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  saveCustomSkill({
    id: id || '',
    name: name,
    icon: iconName,
    description: desc,
    systemPrompt: prompt,
    toolIds: toolIds,
    paramsPreset: paramsPreset,
    knowledgeDocs: docs,
  });
}
