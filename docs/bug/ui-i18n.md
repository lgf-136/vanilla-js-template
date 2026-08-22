# Bug 记录：i18n 文案缺失 / key 不一致（ui-i18n）

> 覆盖：模块翻译缺失、三语言 key 不一致。
> 相关规范：AGENTS.md §7（i18n 新增文案流程）；`just i18n:check` 只保证三语言 key 集合一致，
> **不保证"源码用到的 key 存在于词典"**——这是本类 bug 反复出现的根因。

---

## BUG-001: tasks 模块 12 个翻译 key 缺失（批量操作栏/分页/排序菜单显示裸 key）

- 类型：ui-i18n
- 严重度：中（界面显示裸 key，功能可用）
- 发现时间：2026-08-20
- 修复提交：`950a203`（feat(tasks): 表头排序增加默认选项, 新增过滤控制下拉并补齐遗漏翻译）
- 涉及文件：`app/modules/tasks/i18n.js`（en / zh-CN / zh-TW 三语言同步补齐）
- 涉及组件：tasks 批量操作浮动栏、分页、页码按钮 aria-label、批量删除确认弹窗、排序菜单

### 现象

- 批量操作栏显示裸 key `tasks.tasksSelected`（用户截图反馈）；
- 分页中部显示裸 key `tasks.pageOf`；
- 页码按钮 aria-label 裸 key `tasks.goToPage`；
- 批量删除确认标题/提示裸 key（`bulkDeleteTitle` / `bulkDeleteTitlePlural` / `bulkDeleteType`）。

### 根因

新增功能（批量操作、分页、排序菜单、删除确认）时只写了 `t('tasks.xxx')` 调用，
忘记在词典补 key；`i18n:check` 只查三语言**对齐**，缺失 key 不会被检出。

### 修复过程

1. 用 Python 脚本**程序化提取**模块源码全部 `t('tasks.*')` key，与词典对比，列出缺失清单；
2. 补上 13 个 key（三语言同步）：
   `taskSelected` / `tasksSelected` / `pageOf` / `goToPage` /
   `bulkDeleteTitle` / `bulkDeleteTitlePlural` / `bulkDeleteType` /
   `sort.default` / `sort.asc` / `sort.desc` / `sort.hide` / `filterToggle` / `toggleFilters`；
3. **顺带修正调用 bug**：`pageOf` 原来传 2 个参数，但 `translate` 只替换 `{n}` 占位符
   （第二个参数被忽略）→ 改为先合成 `current / total` 字符串再传入；
4. 说明：`bulkDeleteTitle`/`bulkDeleteTitlePlural` 是**动态拼接的 key**（`'tasks.bulkDeleteTitle' + (n>1?'Plural':'')`），
   正则无法捕获，靠人工核对发现。

### 验证

- `just i18n:check` 通过（三语言 key 集合一致）；
- 预览手测：批量选择后浮动栏显示"已选 N 项"，分页显示"第 x / y 页"，删除确认文案正常。

### 防坑指南

- **`i18n:check` 查不到"源码用到但词典缺失"的 key**——每次新增 `t('...')` 调用后，
  用提取脚本（源码 key 全集 vs 词典）自检，或肉眼核对；
- **动态拼接的 key**（`'tasks.bulkDeleteTitle' + suffix`）正则提取不到，重点人工核对；
- 三语言必须同步补齐同一 key（漏一个 `i18n:check` 即失败）；
- 新增排序/过滤/分页等通用表格文案优先放 core 词典 `dataTable.*`（宿主 `t` 自动兜底），
  模块词典只留业务文案（见 `9c2e83d` 提取公共组件时的清理约定）。

---

## BUG-002: 公共组件硬编码英文 fallback（toast/搜索空态/json-tree/交互提示）

- 类型：ui-i18n
- 严重度：中（违反红线 17，语言切换后仍显示英文）
- 发现时间：2026-08-22（合规审计 M2）
- 修复提交：c9055b2（fix(i18n) M2）
- 涉及文件：app/components/ui/core/feedback.js（toast 内部文案）、
  app/components/ui/json-tree/index.js、app/components/ui/core/misc.js、
  app/core/interactions.js
- 涉及组件：App.ui.toast / App.ui.jsonTree / App.ui.emptyState 等

### 现象
切换语言到 zh-CN / zh-TW 后，部分公共组件内嵌的提示文案仍为英文
（如 json-tree 空态 "Nothing to show"、toast 兜底提示），三语言
dicts.js 却已存在对应 key。

### 根因
组件作者直接写死英文字符串作为 fallback，未消费 `App.i18n` 词典；
核心 dicts.js 中的 `common.*` key 存在但组件未引用。

### 修复过程
在 app/core/i18n/dicts.js 新增/复用 key，四处消费点改走
`t('common.xxx')`（makeT 经当前 locale 解析），无字典时回退
key 本身而非硬编码英文；`just i18n-check` 已覆盖 dicts.js 保证
三语言 key 对齐。

### 验证
`just i18n-check` 通过；`just test` 全绿；切换三语言手测提示文案跟随。

### 防坑指南
1. 公共组件一切用户可见文案必须走 `App.i18n.makeT`（壳层词典）或
   模块 i18n.js，禁止硬编码英文 fallback。
2. i18n-check 现覆盖 dicts.js 与全部模块 i18n.js，新增 key 漏补
   任意语言即 CI 失败。
