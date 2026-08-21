# Bug 记录：CSS 工具类 / 编译机制（ui-css）

> 覆盖：Tailwind 工具类缺失（预构建产物陷阱）、工具类映射错误。
> 关键认知：`app/styles/tokens.css` 是**模板预构建的 Tailwind v4 产物**（文件头
> `/*! tailwindcss v4.3.3 */`，无 `@source`/`@import`），只包含模板构建时扫描到的类；
> 项目后续新增 JS 中的新类**不会自动编译**，缺失类按项目约定补到
> `app/styles/utilities.css`（Tailwind v4 格式，在 bootstrap.js 中于 tokens.css 之后加载）。
> 注：2026-08 公共组件已迁入 `app/components/ui/<comp>/index.js` 子目录，文中如出现旧的单文件组件路径均指其迁移前前身。

---

## BUG-001: 数据表格"视图/过滤"按钮不可见——11 个 Tailwind 工具类从未编译

- 类型：ui-css
- 严重度：高（功能按钮永久隐藏，用户无法发现）
- 发现时间：2026-08-20
- 修复提交：`9897a54`（fix(ui): 补齐缺失的 Tailwind 工具类, 修复数据表格视图/过滤按钮不可见）
- 涉及文件：`app/styles/utilities.css`（+12 行）
- 涉及组件：`App.ui.dataTable`（视图/过滤按钮）、`App.ui.profile/workspace` 弹窗、
  `App.ui.ui.js` dropdown、docs 子页列表、壳层侧边栏

### 现象

任务模块右上角「视图」「过滤」按钮（数据表格工具栏 `hidden lg:flex` 容器内）
**在任何屏幕宽度下都不可见**——组件代码里有渲染、事件也有委托，但按钮永远不显示。

### 根因

`tokens.css` 是预构建产物，`lg:flex` 未在其中；`hidden lg:flex` 容器在任何断点都保持
`display:none`。进一步全库审计发现同类问题共 **11 个真实缺失类**：
`lg:flex`、`justify-end`、`mt-4`、`mt-6`、`w-12`、`w-28`、`leading-5`、
`list-decimal`、`list-disc`、`pl-5`、`no-scrollbar`。
（`justify-end` 缺失导致 profile/workspace 弹窗底部按钮此前一直左对齐——用户未必察觉的隐性 bug。）

### 修复过程

在 `utilities.css` 按 Tailwind v4 格式补齐（间距用 `calc(var(--spacing) * N)`）：
- 响应式块 `@media (width>=64rem)` 内新增 `.lg\:flex{display:flex}`（关键）；
- 布局/间距/尺寸段新增 `.justify-end` `.mt-4` `.mt-6` `.w-12` `.w-28` `.leading-5`
  `.list-decimal` `.list-disc` `.pl-5`，以及自定义类 `.no-scrollbar`（含 `::-webkit-scrollbar` 子规则）。

### 验证

1. **全库审计脚本**：提取源码全部 `class="..."` 字面量（按行匹配避免多行拼接误报）→
   对比全部 CSS 文件编译选择器（需正确反转义 `\:`、`\/`、`\[` 等）→ 输出真实缺失清单；
2. 排除两类误报：模块专属类（`ap-*`/`sp-*` 等在 module.css 定义）与
   **注入样式类**（`dt-*`/`cpk-*`/`gt-*`/`jt-*`/`tp-*`/`ws-*`/`pf-*`/`ui-*` 在组件 JS 的
   `<style>` 字符串内定义，不算缺失）；
3. 排除 Tailwind group 标记类（`group/menu-sub-item`、`group/sidebar-wrapper` 本身不生成 CSS）；
4. `just lint` / `just test`(7/7) / `i18n:check` / `build:budget` 通过。

### 防坑指南

- **新增 UI 时用了任何 Tailwind 工具类，先确认它已编译**——最快的核对方式：
  `grep -c "类名(转义形式)" app/styles/tokens.css`（如 `lg\\:flex`、`w\\-12`），
  缺失就补 `utilities.css`（注意 `:`→`\:`、`/`→`\/`、`.`→`\.`、`[`→`\[` 转义）；
- 推荐做法：每次涉及 UI 类名变更后，跑一遍"源码 class ↔ 编译 CSS"审计脚本
  （见 BUG-001 验证节，要点：按行匹配 class 字面量、反转义对比、排除注入样式类与 group 标记类）；
- `utilities.css` 必须保持 Tailwind v4 产物格式（`calc(var(--spacing) * N)`、
  `@media (width>=64rem)`），加载顺序在 bootstrap.js 中位于 tokens.css 之后才能覆盖。

---

## BUG-002: `.font-heading` 工具类映射到正文 `--font-sans`，"标题字体"设置失效

- 类型：ui-css
- 严重度：中（面板选项部分失效）
- 发现时间：2026-08-20
- 修复提交：`9c2e83d`（feat(ui): 提取通用数据表格公共组件，顺带修复）
- 涉及文件：`app/styles/tokens.css`（`.font-heading` 工具类）
- 涉及组件：所有使用 `font-heading` 类的元素（tasks 页头 h2 等）

### 现象

给元素加 `font-heading` 工具类后，切换主题面板"标题字体"无变化——
类名指向标题字体，实际渲染用的却是正文。

### 根因

模板 `tokens.css` 中 `.font-heading{font-family:var(--font-sans)}`（映射到**正文字体**），
与语义（标题字体）相反；且 `--font-sans` 本身又是 `--font-sans-base` 的别名，链路错乱。

### 修复过程

改为 `font-family: var(--font-heading-base, var(--font-sans-base))`——
标题字体优先，缺失回退正文，形成完整回退链路。
（注意：tokens.css 是单行大文件 + CRLF + CJK 注释，`str_replace` 无法锚定，
需用 Python 按内容定位替换，改完 `git diff` 复核。）

### 验证

预览手测：切"标题字体"，使用 `.font-heading` 的元素（tasks h2 等）同步变化。

### 防坑指南

- **工具类映射必须语义正确且带完整回退链路**：`var(--font-heading-base, var(--font-sans-base))`
  而不是裸 `var(--font-sans)`；
- 复用模板内置工具类前先 `grep` 确认其定义内容，不要凭类名猜语义；
- 涉及 token 别名/工具类定义变更时，检查是否已同步 ARCHITECTURE.md（§12 触发条件：
  新增/变更 token 契约）。
