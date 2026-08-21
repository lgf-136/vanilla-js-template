/* ============================================================
 * index.js — App.ui kit 装配入口（原 ui.js 724 行按控件族 ESM 拆分）
 * ------------------------------------------------------------
 * 模板公共 UI 由 app/core/bootstrap.js 按依赖顺序加载。
 * 拆分设计（对照 color-picker 与 settings/sp-* 既有模式）：
 *   core/utils.js        cn / escAttr·escHtml 别名 + BUTTON/BADGE/CARD/Toggle 类生成器
 *   core/form.js         inputClass / switchRow / avatarHtml
 *   core/dropdown.js     下拉族类生成器 + 下拉悬停态样式注入（副作用）
 *   core/radio.js        单选卡片族（rg-* 设置面板卡片）
 *   core/feedback.js     toast / dialog / closeDialog + Esc 全局监听（副作用）
 *   core/context-menu.js ctxMenu 浮层菜单族 + 外点关闭监听（副作用）
 *   core/misc.js         emptyState / placeholderCard / notFound / tagPill(s)
 *   core/index.js        汇总挂载 window.App.ui（对外面与拆分前完全一致）
 * 本文件只负责引线：求值 core/index.js 即完成全部挂载与副作用注册。
 * ============================================================ */
'use strict';

import './core/index.js';
