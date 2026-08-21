# Bug 记录 — 服务端流式/大模型接入（server-streaming）

> 本文档归档 chats 模块后端 SSE 流式、多供应商协议适配、MCP 接入类 bug。
> 此类 bug 的共同特征：**单测 mock 数据自带错误字段/结构，测试全绿但真实运行即坏**。

## BUG-008: 流式对话完全不可用——历史查询引用不存在的列 `tool_results`

- 类型：server-streaming
- 严重度：致命（核心功能 100% 坏）
- 发现时间：2026-08-21
- 修复提交：e667b6a (fix(chats): 修复流式对话致命 bug 并补齐供应商管理/联网搜索 Key/远程附件/移动端抽屉)
- 涉及文件：`server/modules/chats/ai.js`、`server/modules/chats/ai.test.js`
- 涉及组件：`runChat()` / `normalizeHistory()`

### 现象
POST `/api/chats/chat` 立即返回 `error: "no such column: tool_results"`，任何会话都无法获得模型回复。

### 根因
`runChat` 的历史查询 SELECT 了 `tool_results` 列，但 `server/db/schema.js` 的 `chats_messages` 表从未定义该列。而 `ai.test.js` 里 mock 行**自带** `tool_results: '[]'` 字段，单测通过，掩盖了真实 schema 不一致。

### 修复过程
SELECT 与 `normalizeHistory` 移除 `tool_results`；测试 mock 行同步删除该字段。

### 验证
curl 实测 SSE 全链路：reasoning/text/usage/done 事件正常；18 个单测通过。

### 防坑指南
后端单测的 mock 行必须从 `schema.js` 真实列推导（或直接用 `db.query('PRAGMA table_info(...)')` 断言），禁止手写"看起来合理"的字段集合。

## BUG-009: SSE 解析器把帧分隔空行 skip 掉——整条流缓冲到最后、JSON 全部解析失败

- 类型：server-streaming
- 严重度：致命
- 发现时间：2026-08-21
- 涉及文件：`server/modules/chats/ai.js`（`readSse`）
- 涉及组件：openai/anthropic/gemini 三种协议流解析的共同底层

### 现象
流式请求 HTTP 200 且能读到上游数据，但前端收不到任何 text/reasoning 事件，结束时只收到一条空 done；助手消息内容为空。

### 根因
`readSse` 逐行拆分后遇到空行直接 `continue`，而 SSE 协议中**空行正是帧分隔符**。于是所有 `data:` 行被无限累积，直到流结束才作为一帧 yield（多帧 JSON 拼在一起必然 `JSON.parse` 失败被 `continue` 吞掉）。原代码里 `if (val === '' && dataLines.length)` 的切帧条件只在出现空值 data 行时才触发，标准流不会命中。

### 修复过程
重写 `readSse` 主循环：空行 → 若有累积 data 行则 yield 一帧并复位 event/data；同时兼容 `\r\n` 行尾（行尾 `\r` 剥除）与注释行。新增回归测试：逐字节推送（模拟 TCP 分包）+ `\r\n` + 注释行 + 多 data 行帧。

### 验证
`node --test` 新增 readSse 用例通过；真实供应商（opencode mimo-v2.5）实测 reasoning/text/usage 事件逐帧到达。

### 防坑指南
实现 SSE 解析必须以"空行 = 帧边界"为第一规则；测试用例必须包含 TCP 分包（逐字节喂 chunk）与 `\r\n` 行尾。前端 `app/modules/chats/sse.js` 的实现是对的，可对照。

## BUG-010: MCP 工具调用取不到 client、工具结果先于 assistant 入库——多轮工具循环必坏

- 类型：server-streaming
- 严重度：高
- 发现时间：2026-08-21
- 涉及文件：`server/modules/chats/ai.js`（`runChat` 工具轮次块）
- 涉及组件：MCP agent 循环

### 根因（两处）
1. `toolRegistry` 只存了 `{ server, tool }`（server 是 DB 行），执行时取 `entry.server.client` —— DB 行上没有 client，永远 undefined，工具调用被静默替换为空结果；
2. 工具结果消息先于 assistant(tool_calls) 消息 push 进 history，违反 OpenAI/Anthropic 协议"tool 结果必须紧跟带 tool_calls 的 assistant 消息"，第二轮请求会被供应商 400 拒绝。

### 修复过程
registry 改存 `{ server, conn, tool }` 并经 `entry.conn.client` 取连接；history 先 push assistant(tool_calls) 再逐个 push tool 结果。

### 防坑指南
多轮工具循环的消息顺序是协议硬约束：assistant(tool_calls) → tool(s)；改动该块必须同时核对 openai/anthropic/gemini 三种 build*Request 的假设。

## BUG-011: Anthropic 开启 thinking 时仍发送 temperature/top_p/top_k——API 400

- 类型：server-streaming
- 严重度：中
- 发现时间：2026-08-21
- 涉及文件：`server/modules/chats/ai.js`（`buildAnthropicRequest`）

### 根因
Anthropic 规定 thinking enabled 时 temperature 必须为默认(1)且不可传 top_p/top_k；原实现无条件透传用户参数。

### 修复过程
`body.thinking.type === 'enabled'` 时跳过三个采样参数。

### 防坑指南
各供应商"扩展能力与采样参数互斥"类约束要在 build 层集中处理，不能指望上游容错。

## BUG-012: 流式请求 90s 超时——长回答/多轮工具必被腰斩

- 类型：server-streaming
- 严重度：中
- 发现时间：2026-08-21
- 涉及文件：`server/modules/chats/ai.js`

### 根因
`streamOnce` 复用普通请求的 `REQUEST_TIMEOUT_MS`(90s)，`AbortSignal.timeout` 到点掐断整个流式响应。

### 修复过程
新增 `STREAM_TIMEOUT_MS = 5min` 仅用于流式主请求；models/MCP/远程抓取维持 90s。

### 防坑指南
流式接口的超时上限要按"最长合法响应"估，而不是按连接建立时间；客户端 abort 才是流式的主要退出路径。
