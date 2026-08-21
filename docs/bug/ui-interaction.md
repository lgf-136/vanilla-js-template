# Bug 记录 — 交互事件冲突 / 开关状态 / 移动端遮罩（ui-interaction）

> 本文档归档 chats 等模块"事件委托冲突、开关属性撞名、移动端 overlay 时序"类 bug。

## BUG-003: MCP 服务器开关点了没反应——composer 芯片与卡片开关共用 `data-ch-mcp-toggle`

- 类型：ui-interaction
- 严重度：高
- 发现时间：2026-08-21
- 修复提交：e667b6a (fix(chats): 修复流式对话致命 bug 并补齐供应商管理/联网搜索 Key/远程附件/移动端抽屉)
- 涉及文件：`app/modules/chats/index.js`、`app/modules/chats/panels.js`
- 涉及组件：chats 右栏 MCP 卡片开关、composer 的 MCP 芯片

### 现象
右栏 MCP 卡片上的服务器总开关点击后不切换该服务器，反而翻转 composer 里"MCP"芯片的全局启用态；工具级开关表现异常。

### 根因
两个不同语义的控件使用同一个 data 属性名 `data-ch-mcp-toggle`（composer 芯片无值，卡片开关带服务器 id）。index.js 的 document 级 click 委托里 `el.closest('[data-ch-mcp-toggle]')` 对两者都命中，先进入的分支把点击当成全局开关处理后 `return`，带 id 的分支永远不可达。

### 修复过程
- 卡片/工具开关改用独立属性：服务器 `data-ch-mcp-sw="<id>"`，工具保持 `data-ch-mcp-tool="<id>:<idx>"`；
- composer 全局芯片保留 `data-ch-mcp-toggle`（无值）；
- 两类分支放在不同的委托监听器中，按属性天然互斥。

### 验证
浏览器实测：切换卡片总开关只影响该服务器；父级关闭时其下所有工具联动关闭且不可单独开启；composer 芯片独立控制全局 mcpEnabled。

### 防坑指南
同一模块内自定义 `data-*` 事件钩子属性必须全局唯一或带值区分；新增委托分支前先 grep 属性名确认没有别的控件在用。多个 `document.addEventListener('click')` 都会执行，分支互斥不能靠"前面的 return"。

## BUG-004: 右栏"启用联网搜索"开关拨了没效果——两个监听器各切一次等于没切

- 类型：ui-interaction
- 严重度：高
- 发现时间：2026-08-21
- 涉及文件：`app/modules/chats/index.js`
- 涉及组件：chats 右栏联网搜索 switch

### 现象
右栏联网搜索开关点击后视觉与状态都不变（偶发闪一下又回去）。

### 根因
index.js 有两个独立的 document click 监听器都处理 `[data-ch-ws-switch]`，各自执行 `state.webSearch.enabled = !enabled`。同一击两次取反，净效果为零。

### 修复过程
删除第二个监听器中的 ws-switch 分支，仅保留第一监听器统一处理（composer 的 `data-ch-ws-btn` 与右栏 `data-ch-ws-toggle/ws-switch` 同向合并）。

### 验证
浏览器实测开关可正常开合，且开启后出现搜索供应商选择与 API Key 配置字段。

### 防坑指南
同一个状态翻转逻辑只能有一个委托入口；review 时对 `xxx = !xxx` 型分支要全文搜索同名属性确认唯一入口。

## BUG-005: 移动端遮罩常驻全屏——抽屉关着也挡住整页点击

- 类型：ui-interaction
- 严重度：高
- 发现时间：2026-08-21
- 涉及文件：`app/modules/chats/index.js`、`app/modules/chats/module.css`
- 涉及组件：`.ch-mobile-backdrop`、`.ch-page`

### 现象
移动端（≤767px）进入聊天模块后，头部"打开左栏"按钮点不到（Playwright 报 covered by backdrop），部分区域点击无响应。

### 根因
`.ch-mobile-backdrop` 在 ≤767px 媒体查询下无条件 `display: block`（`position: fixed; inset: 0; z-index: 40`），与左右抽屉是否展开无关，常驻拦截底层交互。

### 修复过程
- `renderPage()` 在左或右抽屉展开时给 `.ch-page` 挂 `has-overlay` 类；
- CSS 改为 `.ch-page.has-overlay .ch-mobile-backdrop { display: block; }`，桌面端不受影响。

### 验证
移动端视口（390px）实测：启动两栏折叠；头部按钮开抽屉 → 点遮罩关闭；选会话自动关抽屉。

### 防坑指南
overlay/backdrop 类元素禁止用媒体查询无条件显示，必须绑定"有浮层打开"的状态类；自动化测试断言可点击性（covered 检查）能稳定暴露这类问题。

## BUG-006: 移动端抽屉全屏宽导致遮罩永远点不到

- 类型：ui-interaction
- 严重度：中
- 发现时间：2026-08-21
- 涉及文件：`app/modules/chats/module.css`
- 涉及组件：`.ch-left` / `.ch-right` 移动端样式

### 现象
修完 BUG-005 后，抽屉展开时点遮罩仍无效——Playwright 报点击点被抽屉子元素覆盖。

### 根因
移动端抽屉 `inset: 0; width: 100%` 全屏铺满，z-50 高于遮罩 z-40，遮罩中心点永远被抽屉盖住，"点遮罩关闭"形同虚设。

### 修复过程
改为标准抽屉宽度并留出遮罩可见区：
- `.ch-left`：`inset: 0 auto 0 0; width: min(85vw, 20rem)`；
- `.ch-right:not(.is-closed)`：`inset: 0 0 0 auto; width: min(92vw, 26rem)`。

### 验证
390px 视口下坐标点击遮罩露出区可关闭两侧抽屉。

### 防坑指南
移动端抽屉不要做 100% 宽；overlay 交互要保证遮罩至少一侧可见可点，否则只能依赖抽屉内部按钮关闭。

## BUG-007: 移动端选中会话后抽屉不自动收起——closeMobileLeft 在 rerender 之后调用

- 类型：ui-interaction
- 严重度：低
- 发现时间：2026-08-21
- 涉及文件：`app/modules/chats/index.js`
- 涉及组件：会话列表 `[data-ch-open]` 点击分支

### 现象
移动端从抽屉点开会话，主界面已切换但抽屉仍停留在屏幕上。

### 根因
点击分支内先 `rerender()` 再 `closeMobileLeft()`——后者只改 state 不再触发渲染，本次渲染帧仍带 `is-open` 类。

### 修复过程
调整顺序为 `closeMobileLeft(); rerender(); loadMessages(...)`。

### 预防
修改渲染前状态的辅助函数必须在 `rerender()` 之前调用；凡"改状态 + 重渲染"成对出现时检查中间是否插入了其他状态变更。

## BUG-013: 冷启动点击历史会话消息区永远空白——`state.openThink` 未初始化即被渲染路径读取

- 类型：ui-interaction
- 严重度：高（核心路径：查看历史对话）
- 发现时间：2026-08-21
- 修复提交：见本分支后续 fix(chats) 提交
- 涉及文件：`app/modules/chats/index.js`
- 涉及组件：`renderAssistantMsg()` / `renderThinkingBlock()` / `loadMessages()`

### 现象
页面刷新后（未发送过任何消息时）点击左侧历史会话，会话标题切换成功，但消息区一直空白；服务端日志显示部分会话的 messages 请求甚至没有发出。

### 根因（两层）
1. `renderAssistantMsg()` 读取 `state.openThink[m.id + '-t']`，而 `openThink` 此前只在 `startStream()`/思考折叠点击时才懒创建。冷启动直接渲染带思维链的历史消息时为 `undefined`，抛 TypeError 中断 `rerender()`——消息数据即使到达也无法上屏；
2. `loadMessages()` 的 catch 静默吞错，控制台之外无任何提示，掩盖了上述渲染崩溃的排查线索。

### 修复过程
- `state` 声明处初始化 `openThink/openTools/openToolRow` 三个集合（渲染期读取的状态必须提前存在）；
- `renderAssistantMsg` 读取处补 `!state.openThink ||` 兜底；
- `loadMessages` 失败改为 toast 提示（复用 `chats.loadFailed` 文案），不再静默。

### 附带修正：左右栏展开态不再持久化
此前 `leftOpen/rightOpen` 存入服务端偏好，移动端测试留下的 `leftOpen:false` 会让桌面端进入模块时历史列表整体隐藏、且空状态下没有任何入口可展开（标题按钮仅在有选中会话时渲染）。现改为**每次进入模块按视口重置**：桌面左栏展开/右栏折叠，移动端全部折叠为抽屉（符合需求"左栏默认展开、右栏默认折叠、移动端汉堡式"）；`persistPrefs/applyPrefs` 移除这两个字段。

### 验证
浏览器冷启动实测：点击含思维链会话加载 2 条消息（思维链可见）、多模态会话图片附件正常、3 个历史会话全部可加载；lint/i18n/18 测试/build:budget 通过。

### 防坑指南
- 凡渲染函数读取的可变 state 字段，必须在 state 声明处初始化，禁止"用时再建"——渲染路径没有统一的 try/catch，一处 TypeError 会让整个区域停止上屏；
- 数据加载的 catch 禁止完全静默，至少 toast 或 console.error，否则"请求没发/发了崩在渲染"无法区分；
- 跨设备共享的持久化偏好里不要放"视口相关"的 UI 状态（如抽屉展开态），桌面/移动端互相污染，改为进入时按视口给默认值。
