# Bug 记录：主题面板全量控制 / 受控组件（ui-theme）

> 覆盖：强调色、基础色、风格、标题字体、菜单外观、硬编码颜色。
> 相关铁律：AGENTS.md §1.11 受控组件铁律（不可违反）；ARCHITECTURE.md 3.7。
> 注：2026-08 公共组件已迁入 `app/components/ui/<comp>/index.js` 子目录，文中旧的单文件路径（如 `profile.js`、`color-picker.js`）均指其迁移前前身。

---

## BUG-001: 强调色切换后 `--primary` 纹丝不动（CSS 特异性冲突）

- 类型：ui-theme
- 严重度：高（主题面板核心选项失效，全库主色钉死）
- 发现时间：2026-08-20
- 修复提交：`317121a`（fix(theme): 强调色(chart-*)真正驱动 --primary,图表/按钮/开关随强调色变化）
- 涉及文件：`app/styles/tokens.css`（48 条强调色规则选择器）
- 涉及组件：全库（按钮、开关、选中态、侧边栏高亮、聚焦环、dashboard 图表）

### 现象

切换主题面板"强调色"（如 red/blue），仪表盘柱状图（用 `--primary`）、折线图主线、
按钮、开关全部**无任何变化**。

### 根因

`tokens.css` 里两组规则同时命中 `<html class="base-zinc chart-blue">`：

- 基础色规则 `:root.base-*`（特异性 **0,2,0**）、`:root.dark.base-*`（**0,3,0**）→ 定义 `--primary/--ring/--sidebar-primary`；
- 强调色规则 `.chart-*`、`.dark.chart-*`（特异性只有 **0,1,0**）→ 定义 `--primary`。

**基础色规则永远赢** → `--primary` 被钉死在基础色上，强调色从未生效。
图表本身代码没问题（`cssVar('--primary')` + 监听 `app:themechange` 重建）。

### 修复过程

把 48 条强调色规则的选择器从 `.chart-*` / `.dark.chart-*` 提升为
`:root.chart-*` / `:root.dark.chart-*`——与基础色规则**同特异性**，且位于其后
（文件内强调色块在基础色块之后）→ 强调色胜出，真正驱动
`--primary/--ring/--sidebar-primary`。

> 实现注意：tokens.css 是单行大文件、含 CRLF 与 CJK 注释，`str_replace` 无法锚定；
> 本次用**行号定位的 Python 脚本**批量替换 48 行（注意避免 `:root..chart-` 双点、
> 缺点的 `:rootchart-` 等中间态错误，改完必须 `git diff` 复核）。

### 验证

- `grep` 确认强调色块全部为 `:root.chart-*` / `:root.dark.chart-*`；
- 确认强调色块之后无其它 `--primary` 覆盖；
- 预览手测：切强调色 red/blue，按钮/开关/图表柱状色/折线主色实时变化。

### 防坑指南

- **任何要在 `<html>` 上覆盖 base 体系的类，特异性必须 ≥ `:root.base-*`（0,2,0）且位于其后的文件位置**，
  否则永远是死代码；
- 新增主题面板选项时，先检查 `tokens.css` 中该规则的特异性与文件顺序，再做接线；
- 同类陷阱：`.menu-color-inverted`（见 BUG-005）、`style-*` 组件皮肤（见 BUG-002）。

---

## BUG-002: 风格（style-*）切换无变化——全库按钮缺 `data-slot="button"`

- 类型：ui-theme
- 严重度：高（风格面板 8 套样式全部无效）
- 发现时间：2026-08-20
- 修复提交：`7f76c10`（feat(theme): 风格系统接线到全库公共按钮）
- 涉及文件：`app/components/ui/ui.js`、`app/components/layout/shell.js`、`app/components/ui/profile.js`、
  `app/components/ui/workspace.js`、`app/modules/{apihub,tasks,settings,chats,dashboard,docs}/index.js`
- 涉及组件：`App.ui.buttonClass` 全库 55 处渲染的按钮

### 现象

切换主题面板"风格"（nova/vega/maia/lyra/mira/luma/sera/rhea），按钮圆角/间距/阴影
**零变化**（此前"切换样式无任何改变"的根因之一）。

### 根因

模板 `tokens.css` 内置的 8 套风格组件规则**全部以 `[data-slot=button]` 为目标**
（约 524 条规则），但全库 `App.ui.buttonClass` 渲染的按钮**都没有该属性** →
规则从不命中，风格切换不产生任何视觉差异。

### 修复过程

1. 为 shell / profile / workspace / ui / apihub / tasks / settings / chats / dashboard / docs
   共 **55 处按钮**补 `data-slot="button"`（`str_replace` 逐个锚定；
   注意 apihub 含 `data-hub-act="send"` 的行会被工具内容过滤器拦截，改用 Python 脚本替换）；
2. `BUTTON_SIZES.sm` 的 `text-[0.8rem]` 加 `!` 提升为 `text-[0.8rem]!`，
   防止无层级的 `[data-slot=button]` 基础规则覆盖小按钮字号。

### 验证

- `grep -c 'data-slot="button"'` 覆盖全部调用点；`node --check` 语法通过；
- 预览手测：切风格 lyra/sera 按钮变直角、maia/luma 圆角放大、nova 默认视觉不变。

### 防坑指南

- **`App.ui.*` 渲染的组件必须带 `data-slot="<组件名>"`**，否则命中不了 `style-*` 皮肤规则；
- 新增/修改公共组件时，若涉及 `data-slot` 或类名约定变更，**必须全库检索所有调用点**
  （`grep -rn 'App.ui.xxxClass(' app --include="*.js"`）逐一核对；
- 给公共组件属性加 `!important` 前先确认是否会被无层级基础规则覆盖（`[data-slot=button]` 特异性 0,1,0
  但位于 utils 层之后仍可能覆盖工具类，小字号类需 `!` 保护）。

---

## BUG-003: 标题字体设置只覆盖部分模块

- 类型：ui-theme
- 严重度：中（面板选项部分失效）
- 发现时间：2026-08-20
- 修复提交：`055b0f3`（feat(theme): 标题字体设置适配全部模块页头与卡片标题）
- 涉及文件：`app/modules/{apihub,tasks,apps,chats,dashboard,docs}/module.css` 或 `index.js`
- 涉及组件：各模块页头 h1/h2、卡片标题

### 现象

切换主题面板"标题字体"（Inter/Manrope/System），tasks / apps / chats / dashboard 的
页头与卡片标题仍用正文默认字体，无变化（此前只有 apihub / docs / settings / 壳层生效）。

### 根因

新模块页头/卡片标题的 CSS 未消费 `--font-heading-base` token（默认继承正文 `--font-sans-base`）。

### 修复过程

逐个模块补齐：`.tk-header h1` / `.tk-drawer-head h2`、`.ap-head h1` / `.ap-card h2`、
`.ch-inbox-title h1` 补 `font-family: var(--font-heading-base, inherit)`；
dashboard 页头 h1 追加 `font-heading` 工具类（注意此时 `.font-heading` 映射还是错的，见 ui-css BUG-002）。

### 验证

预览手测：切换标题字体，所有模块页头/卡片标题同步变化。

### 防坑指南

- **新增任何页头/标题/卡片标题样式，必须消费 `--font-heading-base`**（带回退 `inherit`）；
- 主题面板新增选项后，用"选项 → 消费 token"对照表全库盘点（参考 ARCHITECTURE.md 3.7）。

---

## BUG-004: 基础色/强调色色板加 dark|light 选项破坏 darkmode（已撤销，改为启用开关）

- 类型：ui-theme
- 严重度：高（暗色模式整体失效）
- 发现时间：2026-08-20
- 修复提交：`3cbc5c4`（引入，feat）→ `9a782ff`（撤销并改方案，feat）
- 涉及文件：`app/core/settings.js`、`app/styles/tokens.css`、`app/core/app.js`、
  `app/components/ui/ui.js`、`app/components/layout/shell.js`、`app/modules/settings/index.js`、
  `app/core/i18n.js`
- 涉及组件：主题面板（基础色/强调色色板）、`radio.sectionTitleToggle`（新增公共组件）

### 现象

在基础色/强调色色板里加 `dark` / `light` 两个颜色后，**主题模式 dark 失效**：
`base-dark` 等类与暗色模式规则冲突，深色表面被错误覆盖。

### 根因

明暗语义被塞进"色板"维度（base/chart 类）而非"主题模式"维度，
两套机制同时控制同一批表面变量（`--background/--card/...`），互相打架。

### 修复过程（新方案）

1. **撤销**：`BASE_COLORS` / `CHART_COLORS` / `WORKSPACE_COLORS` 恢复原样；
   `tokens.css` 删除 `base-dark/light`、`chart-dark/light`、`swatch-dark/light` 全部规则；
2. **改为启用开关**：在"基础色 / 强调色"标题行右侧各加一个 switch（`role="switch"` + `aria-checked` 键盘可达）：
   - `useBase` 开启 → 应用 `base-*` 类；关闭 → 移除类，回退默认 zinc 表面；
   - `useAccent` 开启 → 应用 `chart-*` 类；关闭 → 移除类，**回退到主题模式默认主色**
     （浅色近黑 / 深色近白，即"darkmode 的颜色"）；
3. 状态接线：`settings.js` 新增 `useBase/useAccent`（读取/应用/持久化/重置），
   `app.js` 处理 `data-theme-toggle` 点击 + 服务器 `settings:appearance` **双向同步**两字段，
   `profileCapture/profileApply` 快照包含两字段（切换配置文件时记忆）；
4. 面板与设置页"外观"子页两处共用新公共组件 `radio.sectionTitleToggle`；
5. 三语言新增 `settings.useBase` / `settings.useAccent` 文案。

> 保留项：`menu-color-inverted` 特异性修复（BUG-005，独立 bug，与 dark/light 无关）；
> 强调色特异性修复（BUG-001）保留——开关开启时 `:root.chart-*` 必须覆盖 base，关闭时类被移除天然回退，互补。

### 验证

- 开关关闭 + 深色主题：表面回退默认 zinc、主色近白，暗色模式正常；
- 开关关闭 + 浅色主题：按钮回到近黑；
- 开关状态跨刷新/多设备一致（服务器同步）、切换配置文件快照一致；
- `just lint` / `just test`(7/7) / `i18n:check` / `build:budget` 通过。

### 防坑指南

- **明暗语义属于"主题模式"维度，禁止塞进色板维度**（base/chart 类只承载色相选择）；
- 撤销历史方案时必须同步清理：白名单数组、CSS 规则、预览 swatch、i18n，缺一即残留；
- 新增主题面板选项时：状态字段必须贯通 读取 → 应用（`applySettings`）→ 持久化 →
  服务器双向同步 → 配置文件快照 → 重置，任何一环缺失都会导致"刷新丢状态/换配置不生效"。

---

## BUG-005: 菜单颜色→反色（menu-color-inverted）从未生效

- 类型：ui-theme
- 严重度：中（面板选项失效）
- 发现时间：2026-08-20（顺带发现修复于 `3cbc5c4`）
- 修复提交：`3cbc5c4`（feat(theme): 基础色/强调色新增 dark 与 light 选项，顺带修复）
- 涉及文件：`app/styles/tokens.css`
- 涉及组件：侧边栏菜单（壳层）

### 现象

主题面板"菜单颜色 → 反色"切换后侧边栏配色无变化。

### 根因

与 BUG-001 同类：`.menu-color-inverted` 特异性 **0,1,0**，被 `:root.base-*`（0,2,0）压住，规则从未生效。

### 修复过程

选择器提升为 `:root.menu-color-inverted`，并置于强调色规则之后（文件靠后），
使其真正覆盖侧边栏配色。

### 验证

预览手测：菜单颜色"反色"后侧边栏配色反转。

### 防坑指南

同 BUG-001：凡是 `<html>` 上的覆盖类，特异性必须 ≥ `:root.base-*` 且位于其后；
排查"面板选项无效果"时，先怀疑特异性被压（`grep -nE '^:root\.' tokens.css` 对比）。

---

## BUG-006: 公共组件注入样式残留 8 处硬编码颜色

- 类型：ui-theme
- 严重度：中（违反受控组件铁律，不随主题变化）
- 发现时间：2026-08-20
- 修复提交：`e521351`（refactor(theme): 清理 UI 组件注入样式中残留的硬编码颜色）
- 涉及文件：`app/components/ui/color-picker.js`、`app/components/ui/group-tree.js`、
  `app/components/ui/tag-picker.js`、`app/components/ui/tooltip.js`
- 涉及组件：color-picker（取色器）、group-tree（分组树）、tag-picker（标签选择器）、tooltip（提示）

### 现象

这些公共组件注入 `<style>` 的灰色边框/描边/聚焦阴影写死 `rgba(...)`，
不随主题模式/基础色/强调色变化（明暗主题下都是同一灰）。

### 根因

组件注入样式时直接写了 `rgba(128,128,128,.35)`、`rgba(24,24,27,.1)`、
`rgba(255,255,255,.25)` 等字面量，绕过了 token 体系（lint 只强制检查 hex，rgba 需人工审计）。

### 修复过程

8 处逐一 token 化（`var(--token, fallback)` 回退链路）：

| 位置 | 原硬编码 | 改为 |
|---|---|---|
| `.cpk-dot` 边框 | `rgba(128,128,128,.35)` | `var(--border)` |
| `.cpk-dot` 内圈高光 | `rgba(255,255,255,.25)` | `color-mix(白 token 25%)` |
| `.cpk-swatch` 描边 | `rgba(128,128,128,.25)` | `var(--border)` |
| `.cpk-input` 聚焦阴影 | `rgba(24,24,27,.12)` | `color-mix(ring 40%)` |
| `.cpk` dark 边框覆盖 | `rgba(128,128,128,.4)` | `var(--border)` |
| group-tree 聚焦阴影 | `rgba(24,24,27,.1)` | `color-mix(ring 40%)` |
| tag-picker 聚焦阴影 | `rgba(24,24,27,.1)` | `color-mix(ring 40%)` |
| `.tp-swatch` 边框 | `rgba(0,0,0,.15)` | `var(--border)` |
| tooltip 深色提示边框 | `rgba(255,255,255,.08)` | `color-mix(白 token 8%)` |

### 验证

全库审计脚本扫描 hex/rgb/rgba/hsl/oklch/color-mix/命名色（JS + CSS + 注入 `<style>` + 内联 style），
确认仅剩合理豁免：通用阴影 `rgba(0,0,0,*)`（tokens.css 自身 `.shadow-*` 工具类同款做法）、
取色器滑块功能性描边、`favicon.svg`/`icons.js`/`chart.umd.js`（lint 既有豁免）、
用户数据驱动的内联色值（标签色/哈希色/取色器预览）、`NAME_HEX` 调色板（映射 `--nova-palette-*`）。

### 防坑指南

- **注入 `<style>` 与内联 `style` 同样受受控组件铁律约束**——新增样式一律消费 token 变量，
  带完整回退链路（`var(--token, var(--fallback, 字面量))`）；
- 阴影/遮罩走 `.shadow-*` 工具类或与 tokens.css 同款 `rgba(0,0,0,*)` 通用着色；
- 提交前跑全库颜色审计（lint 只查 hex，rgba/oklch/color-mix 需正则扫描人工复核）。
