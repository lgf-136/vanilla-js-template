/* ============================================================
 * tasks 模块 — 入口装配（H1 拆分）
 * ------------------------------------------------------------
 * 复刻参考项目 shadcn-admin 的 Tasks 页(数据表格):
 * - 表格本体(搜索/过滤/排序/选择/批量/分页)已提取为公共组件
 *   App.ui.dataTable(见 app/components/ui/data-table.js)
 * - 本模块只保留业务:任务数据、行操作菜单、新建/编辑抽屉、导入/删除确认弹窗
 * 零依赖自研,数据为固定种子生成的 100 条任务。
 *
 * 拆分设计（按业务域，方向严格单向 data → cells → store → view ← events）：
 *   tk-data.js   数据域:选项定义(LABELS/STATUSES/PRIORITIES/PAGE_SIZES)、
 *                固定种子任务生成器、统一转义 esc
 *   tk-cells.js  单元格渲染域:labelBadge/statusCell/priorityCell 与
 *                行操作下拉菜单 rowActionsHtml(含标签子菜单)
 *   tk-store.js  状态域:可变状态(state/draft/draftError/bulkDeleteInput)、
 *                表格实例 table(App.ui.dataTable 单例)、数据变更
 *                (mutateRow/findRow/deleteRowByIds/createTask)
 *   tk-view.js   视图域:renderTasks 主区域、drawerBody/confirmHtml/
 *                renderDialog 弹窗、openDrawer/saveDraft 流程编排
 *   tk-events.js 事件域:document click/input/change 委托,副作用模块,
 *                被本文件显式 import 才会求值
 *
 * 本文件只负责装配:注入弹窗渲染回调(setDialogRenderer)、
 * render 透传 ctx.t 给 renderTasks,再注册模块。
 * ============================================================ */
'use strict';

import { setDialogRenderer } from './tk-store.js';
import { renderTasks, renderDialog } from './tk-view.js';
// 副作用导入:事件委托监听器在 tk-events 求值时注册(无导出被消费,勿删)
import './tk-events.js';

setDialogRenderer(renderDialog);

function render(_route, ctx) {
  return renderTasks(ctx.t);
}

App.defineModule({ id: 'tasks', render: render });
