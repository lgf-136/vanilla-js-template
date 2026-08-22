/* ============================================================
 * chat-right-params.js — chats 模块·右栏·参数 Tab
 * ------------------------------------------------------------
 * 技能下拉(默认通用助手 + 管理入口)、提示词下拉(内置角色 + 自定义,
 * 90 字预览)、供应商下拉(内置/自定义分组 + 搜索 + 新增)与 API Key
 * 密码框(按供应商独立存储,留空删除)、模型组合框(可输入/筛选 + 自动
 * 获取模型列表)、Top P / Top K / 温度自绘滑块、max_tokens 组合框
 * (k/M 换算:1.5k→1536,显示 8192→8k)。
 * 全部自研控件(类 shadcn 风格);事件由 chat-events 委托处理。
 * ============================================================ */
'use strict';

import { state, t, esc, escAttr, icon, effectiveDraft, providerById, skillById, promptById } from './chat-store.js';
import { formatMaxTokens } from './chat-util.js';

/* ---------- 技能下拉 ---------- */
function skillHtml(d) {
  var skills = (state.config && state.config.skills) || [];
  var skill = skillById(d.skillId) || skills[0];
  return (
    '<div class="ch-field">' +
    '<label class="ch-field-label">' +
    esc(t('chats.skill')) +
    '</label>' +
    '<div class="ch-field-row">' +
    '<button type="button" class="ch-select" data-ch-act="skill-dd" aria-expanded="false">' +
    '<span class="ch-select-ic">' +
    icon((skill && skill.icon) || 'sparkles', 'size-3.5') +
    '</span>' +
    '<span class="ch-select-label">' +
    esc((skill && skill.name) || t('chats.generalAssistant')) +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-icon-btn" data-ch-act="skill-manage" data-tip="' +
    escAttr(t('chats.skillManage')) +
    '" aria-label="' +
    escAttr(t('chats.skillManage')) +
    '">' +
    icon('settings', 'size-4') +
    '</button>' +
    '</div>' +
    (skill && skill.description
      ? '<p class="ch-field-desc">' + esc(skill.description) + '</p>'
      : '') +
    '</div>'
  );
}

export function skillDropdownHtml() {
  var d = effectiveDraft();
  var skills = (state.config && state.config.skills) || [];
  var html =
    '<div class="ch-dd-list">' +
    skills
      .map(function (s) {
        return (
          '<button type="button" class="ch-dd-item' +
          (d.skillId === s.id ? ' is-on' : '') +
          '" data-ch-act="set-skill" data-id="' +
          escAttr(s.id) +
          '">' +
          '<span class="ch-dd-ic">' +
          icon(s.icon || 'sparkles', 'size-3.5') +
          '</span>' +
          '<span class="ch-dd-name">' +
          esc(s.name) +
          '</span>' +
          (d.skillId === s.id ? '<span class="ch-dd-check">' + icon('check', 'size-3.5') + '</span>' : '') +
          '</button>'
        );
      })
      .join('') +
    '</div>' +
    '<div class="ch-dd-foot">' +
    '<button type="button" class="ch-dd-action" data-ch-act="skill-manage">' +
    icon('settings', 'size-3.5') +
    esc(t('chats.skillManage')) +
    '</button>' +
    '</div>';
  return html;
}

/* ---------- 提示词下拉 ---------- */
function promptHtml(d) {
  var prompts = (state.config && state.config.prompts) || [];
  var prompt = promptById(d.promptId) || prompts[0];
  var preview = prompt && prompt.content ? prompt.content.slice(0, 90) : '';
  return (
    '<div class="ch-field">' +
    '<label class="ch-field-label">' +
    esc(t('chats.prompt')) +
    '</label>' +
    '<div class="ch-field-row">' +
    '<button type="button" class="ch-select" data-ch-act="prompt-dd" aria-expanded="false">' +
    '<span class="ch-select-ic">' +
    icon('scroll-text', 'size-3.5') +
    '</span>' +
    '<span class="ch-select-label">' +
    esc((prompt && prompt.name) || t('chats.generalAssistant')) +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-icon-btn" data-ch-act="prompt-manage" data-tip="' +
    escAttr(t('chats.promptManage')) +
    '" aria-label="' +
    escAttr(t('chats.promptManage')) +
    '">' +
    icon('settings', 'size-4') +
    '</button>' +
    '</div>' +
    (preview ? '<p class="ch-field-preview">' + esc(preview) + '</p>' : '') +
    '</div>'
  );
}

export function promptDropdownHtml() {
  var d = effectiveDraft();
  var prompts = (state.config && state.config.prompts) || [];
  var html =
    '<div class="ch-dd-list">' +
    prompts
      .map(function (p) {
        return (
          '<button type="button" class="ch-dd-item' +
          (d.promptId === p.id ? ' is-on' : '') +
          '" data-ch-act="set-prompt" data-id="' +
          escAttr(p.id) +
          '">' +
          '<span class="ch-dd-name">' +
          esc(p.name) +
          '</span>' +
          (d.promptId === p.id ? '<span class="ch-dd-check">' + icon('check', 'size-3.5') + '</span>' : '') +
          '</button>'
        );
      })
      .join('') +
    '</div>' +
    '<div class="ch-dd-foot">' +
    '<button type="button" class="ch-dd-action" data-ch-act="new-prompt">' +
    icon('plus', 'size-3.5') +
    esc(t('chats.newPrompt')) +
    '</button>' +
    '<button type="button" class="ch-dd-action" data-ch-act="prompt-manage">' +
    icon('settings', 'size-3.5') +
    esc(t('chats.promptManage')) +
    '</button>' +
    '</div>';
  return html;
}

/* ---------- 供应商 + API Key ---------- */
function providerFieldHtml(d) {
  var provider = providerById(d.providerId) || {};
  var key = state.secrets.providerKeys && state.secrets.providerKeys[d.providerId];
  var local = d.providerId === 'ollama' || d.providerId === 'lmstudio';
  return (
    '<div class="ch-field">' +
    '<label class="ch-field-label">' +
    esc(t('chats.provider')) +
    '</label>' +
    '<div class="ch-field-row">' +
    '<button type="button" class="ch-select" data-ch-act="right-provider-dd" aria-expanded="false">' +
    '<span class="ch-select-ic">' +
    icon('boxes', 'size-3.5') +
    '</span>' +
    '<span class="ch-select-label">' +
    esc(provider.name || d.providerId || t('chats.selectProvider')) +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-icon-btn" data-ch-act="provider-manage" data-tip="' +
    escAttr(t('chats.providerManage')) +
    '" aria-label="' +
    escAttr(t('chats.providerManage')) +
    '">' +
    icon('settings', 'size-4') +
    '</button>' +
    '</div>' +
    '<div class="ch-field-api">' +
    '<label class="ch-field-sub">' +
    esc(t('chats.apiKey')) +
    '</label>' +
    '<input type="password" class="ch-input-sm" data-ch-act="api-key" data-id="' +
    escAttr(d.providerId) +
    '" value="' +
    escAttr(key || '') +
    '" placeholder="' +
    escAttr(local ? t('chats.noKeyNeeded') : t('chats.apiKeyPlaceholder')) +
    '" autocomplete="off" />' +
    '<p class="ch-field-desc">' +
    esc(key ? t('chats.keySet') : t('chats.keyMissing')) +
    '</p>' +
    '</div>' +
    '</div>'
  );
}

export function rightProviderDropdownHtml() {
  var d = effectiveDraft();
  var builtIn = state.providerCatalog || [];
  var custom = ((state.config && state.config.providers) || []).filter(function (p) {
    return builtIn.every(function (b) { return b.id !== p.id; });
  });
  var search = state.view.providerSearch || '';
  function row(p) {
    return (
      '<button type="button" class="ch-dd-item' +
      (d.providerId === p.id ? ' is-on' : '') +
      '" data-ch-act="set-provider" data-id="' +
      escAttr(p.id) +
      '">' +
      '<span class="ch-dd-name">' +
      esc(p.name) +
      '</span>' +
      (d.providerId === p.id ? '<span class="ch-dd-check">' + icon('check', 'size-3.5') + '</span>' : '') +
      '</button>'
    );
  }
  function group(title, list) {
    var filtered = list.filter(function (p) {
      return !search || p.name.toLowerCase().indexOf(search.toLowerCase()) !== -1;
    });
    if (!filtered.length) return '';
    return '<div class="ch-dd-label">' + esc(title) + '</div>' + filtered.map(row).join('');
  }
  return (
    '<div class="ch-dd-search">' +
    '<span>' +
    icon('search', 'size-3.5') +
    '</span>' +
    '<input type="text" class="ch-dd-search-input" data-ch-act="provider-search" value="' +
    escAttr(search) +
    '" placeholder="' +
    escAttr(t('chats.searchProvider')) +
    '" />' +
    '</div>' +
    '<div class="ch-dd-list">' +
    group(t('chats.builtin'), builtIn) +
    group(t('chats.custom'), custom) +
    '</div>' +
    '<div class="ch-dd-foot">' +
    '<button type="button" class="ch-dd-action" data-ch-act="new-provider">' +
    icon('plus', 'size-3.5') +
    esc(t('chats.addProvider')) +
    '</button>' +
    '</div>'
  );
}

/* ---------- 模型组合框 ---------- */
function modelFieldHtml(d) {
  var fetching = state.view.fetchingModels;
  return (
    '<div class="ch-field">' +
    '<label class="ch-field-label">' +
    esc(t('chats.model')) +
    '</label>' +
    '<div class="ch-field-row">' +
    '<button type="button" class="ch-select ch-select-model" data-ch-act="model-dd" aria-expanded="false">' +
    '<span class="ch-select-ic">' +
    icon('cpu', 'size-3.5') +
    '</span>' +
    '<span class="ch-select-label">' +
    esc(d.model || t('chats.selectModel')) +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '<button type="button" class="ch-icon-btn' +
    (fetching ? ' is-spinning' : '') +
    '" data-ch-act="fetch-models" data-tip="' +
    escAttr(t('chats.fetchModels')) +
    '" aria-label="' +
    escAttr(t('chats.fetchModels')) +
    '">' +
    (fetching ? '<span class="ch-spin"></span>' : icon('refresh', 'size-4')) +
    '</button>' +
    '</div>' +
    '</div>'
  );
}

/* ---------- 自绘滑块 ---------- */
function sliderHtml(key, label, min, max, step, value, decimals) {
  var pct = ((Number(value) - min) / (max - min)) * 100;
  var display = decimals != null ? Number(value).toFixed(decimals) : String(Math.round(Number(value) * 100) / 100);
  return (
    '<div class="ch-field">' +
    '<label class="ch-field-label">' +
    esc(label) +
    '</label>' +
    '<div class="ch-slider" data-ch-slider="' +
    key +
    '" data-min="' +
    min +
    '" data-max="' +
    max +
    '" data-step="' +
    step +
    '" data-value="' +
    value +
    '">' +
    '<div class="ch-slider-track"><div class="ch-slider-fill" style="width:' +
    pct +
    '%"></div><div class="ch-slider-thumb" style="left:' +
    pct +
    '%"></div></div>' +
    '</div>' +
    '<div class="ch-slider-foot">' +
    '<input type="text" class="ch-slider-num" data-ch-act="slider-num" data-key="' +
    key +
    '" value="' +
    escAttr(display) +
    '" aria-label="' +
    escAttr(label) +
    '" />' +
    '<span class="ch-slider-range">' +
    esc(String(min) + ' – ' + String(max)) +
    '</span>' +
    '</div>' +
    '</div>'
  );
}

/* ---------- max_tokens 组合框 ---------- */
var MAX_TOKENS_COMMON = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 393216, 524288, 1048576, 2097152];

function maxTokensFieldHtml(d) {
  var v = d.params.maxTokens || 8192;
  return (
    '<div class="ch-field">' +
    '<label class="ch-field-label">' +
    esc(t('chats.maxTokens')) +
    '</label>' +
    '<div class="ch-field-row">' +
    '<button type="button" class="ch-select" data-ch-act="maxtokens-dd" aria-expanded="false">' +
    '<span class="ch-select-ic">' +
    icon('list-todo', 'size-3.5') +
    '</span>' +
    '<span class="ch-select-label ch-mono">' +
    esc(formatMaxTokens(v)) +
    '</span>' +
    icon('chevrons-up-down', 'size-3.5') +
    '</button>' +
    '</div>' +
    '<div class="ch-field-row ch-field-row-tight">' +
    '<input type="text" class="ch-input-sm ch-mono" data-ch-act="maxtokens-input" value="' +
    escAttr(formatMaxTokens(v)) +
    '" placeholder="' +
    escAttr(t('chats.maxTokensPlaceholder')) +
    '" aria-label="' +
    escAttr(t('chats.maxTokens')) +
    '" />' +
    '<button type="button" class="ch-icon-btn" data-ch-act="maxtokens-apply" data-tip="' +
    escAttr(t('chats.apply')) +
    '" aria-label="' +
    escAttr(t('chats.apply')) +
    '">' +
    icon('check', 'size-4') +
    '</button>' +
    '</div>' +
    '</div>'
  );
}

export function maxTokensDropdownHtml() {
  return (
    '<div class="ch-dd-list">' +
    MAX_TOKENS_COMMON.map(function (n) {
      return (
        '<button type="button" class="ch-dd-item ch-mono" data-ch-act="set-maxtokens" data-value="' +
        n +
        '">' +
        '<span class="ch-dd-name">' +
        esc(formatMaxTokens(n)) +
        '</span>' +
        '<span class="ch-dd-num">' +
        esc(String(n)) +
        '</span>' +
        '</button>'
      );
    }).join('') +
    '</div>'
  );
}

/* ---------- 参数 Tab ---------- */
export function paramsTabHtml() {
  var d = effectiveDraft();
  return (
    '<div class="ch-panel-scroll">' +
    skillHtml(d) +
    promptHtml(d) +
    providerFieldHtml(d) +
    modelFieldHtml(d) +
    sliderHtml('temperature', t('chats.temperature'), 0, 2, 0.05, d.params.temperature || 0.7, 2) +
    sliderHtml('topP', t('chats.topP'), 0, 1, 0.01, d.params.topP != null ? d.params.topP : 0.95, 2) +
    sliderHtml('topK', t('chats.topK'), 0, 100, 1, d.params.topK || 0, 0) +
    maxTokensFieldHtml(d) +
    '</div>'
  );
}
