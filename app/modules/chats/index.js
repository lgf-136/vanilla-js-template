/* ============================================================
 * chats 模块 — 入口装配（H1 拆分）
 * ------------------------------------------------------------
 * 复刻参考项目 shadcn-admin 的 Chats 页:
 * - 左侧会话列表(头像/名称/最后一条消息)+ 搜索
 * - 右侧聊天面板:按日期分组气泡(自己右侧高亮,对方左侧灰底)
 * - 顶部 视频/电话/更多 按钮 + 底部输入框
 * - 新建消息弹窗(搜索联系人,多选标签,可移除)
 * 数据为固定种子(10 个会话),头像用首字母生成(不依赖外部图片)。
 *
 * 拆分设计（按业务域，方向严格单向 data → store → view ← events）：
 *   ch-data.js   数据域:CONVERSATIONS 固定种子数据 + 纯函数
 *                (esc/initials/avatarHtml/fmtDate/fmtTime/
 *                groupMessages/usersWithoutMessages/findConversationById)
 *   ch-store.js  状态域:state{ search, selectedId, newSearch,
 *                selectedUsers } 与派生查询 filteredChats
 *   ch-view.js   视图域:renderChats 主区域、newChatDialogParts/
 *                openNewChatDialog/updateNewChatDialog 弹窗、rerender
 *   ch-events.js 事件域:document input/click/submit 委托,副作用模块,
 *                被本文件显式 import 才会求值
 *
 * 本文件只负责装配:render 透传 ctx.t 给 renderChats,再注册模块。
 * ============================================================ */
'use strict';

import { renderChats } from './ch-view.js';
// 副作用导入:事件委托监听器在 ch-events 求值时注册(无导出被消费,勿删)
import './ch-events.js';

function render(_route, ctx) {
  return renderChats(ctx.t);
}

App.defineModule({ id: 'chats', render: render });
