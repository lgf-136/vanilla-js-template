/* ============================================================
 * chats 模块 — 入口装配(H2 拆分)
 * ------------------------------------------------------------
 * AI 聊天工作台,左中右三栏(移动端抽屉):
 *   左栏  会话历史(搜索/过滤/分组树/标签树)  → chat-left.js
 *   中栏  聊天主界面(流式 Markdown/思维链/工具卡片) → chat-center.js
 *         输入框(多模态/供应商/模型/思考/联网)  → chat-composer.js
 *   右栏  参数 / MCP / Agent                  → chat-right.js
 * 流式  SSE 客户端(ai-stream-kit)+ 断点续传/中止 → chat-stream.js
 * 动作  会话/分组/标签/供应商/提示词/技能/MCP   → chat-actions.js
 * 弹窗  供应商/提示词/技能/MCP/API Key 表单     → chat-dialogs.js
 * 事件  document 级委托(唯一监听注册点)        → chat-events.js(副作用)
 * 状态  可变状态收敛 + 加载/持久化              → chat-store.js
 * 重绘  渲染函数注入 + 局部重绘                 → chat-view.js
 * 纯逻辑 chat-logic / chat-md / chat-util / chat-rag(可选 RAG)
 *
 * 本文件只负责:页面组装(pageHtml)、渲染函数注入(registerPainters)、
 * 数据懒加载触发与模块注册。依赖方向严格单向:
 *   store → view → 各渲染域 → events(装配期注入解耦)。
 * ============================================================ */
'use strict';

import { state, t, esc, icon, load } from './chat-store.js';
import { registerPainters } from './chat-view.js';
import { leftHtml } from './chat-left.js';
import { centerHtml, headerHtml } from './chat-center.js';
import { rightHtml } from './chat-right.js';
// 副作用导入:事件委托监听器在 chat-events 求值时注册(无导出被消费,勿删)
import './chat-events.js';

/* ---------- 页面组装 ---------- */
function pageHtml() {
  if (state.error) {
    return (
      '<div class="ch-page">' +
      '<div class="ch-page-center">' +
      App.ui.emptyState({ icon: 'circle-alert', desc: esc(state.error) }) +
      '</div>' +
      '</div>'
    );
  }
  if (!state.loaded) {
    return (
      '<div class="ch-page">' +
      '<div class="ch-page-center">' +
      '<div class="ch-loading">' +
      icon('loader-circle', 'ch-loading-spin') +
      '<span>' +
      esc(t('chats.loading')) +
      '</span>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }
  return (
    '<div class="ch-page">' +
    leftHtml() +
    centerHtml() +
    rightHtml() +
    (state.view.overlay ? '<div class="ch-overlay" data-ch-overlay></div>' : '') +
    '</div>'
  );
}

/* ---------- 装配:向视图控制层注入渲染函数 ---------- */
registerPainters({
  page: pageHtml,
  left: leftHtml,
  center: centerHtml,
  right: rightHtml,
  header: headerHtml,
});

/* ---------- 内容挂载后初始化(懒加载数据,仅一次) ---------- */
document.addEventListener('app:afterRender', function (ev) {
  var detail = ev.detail || {};
  if (detail.path === '/chats' && !state.loaded && !state.error) {
    load();
  }
});

App.defineModule({ id: 'chats', render: function render() { return pageHtml(); } });
