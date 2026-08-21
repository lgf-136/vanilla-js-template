# Bug 记录：数据表格公共组件（ui-table）

> 覆盖：`App.ui.dataTable`（app/components/ui/data-table.js）及其前身 tasks 表格。
> 组件特性：受控（全量消费 token）、可拓展（配置化接入），详见 ARCHITECTURE.md 2.3。
> 注：2026-08 组件已迁入 `app/components/ui/data-table/index.js` 子目录，文中旧路径 `data-table.js` 指其迁移前前身。

---

## BUG-001: 表头排序无法回到初始顺序（只能刷新页面）

- 类型：ui-table
- 严重度：中（功能缺失）
- 发现时间：2026-08-20
- 修复提交：`950a203`（feat(tasks): 表头排序增加默认选项, 新增过滤控制下拉并补齐遗漏翻译）
- 涉及文件：`app/modules/tasks/index.js`（当时表格还在模块内，后迁移进公共组件）
- 涉及组件：数据表格表头排序菜单

### 现象

点击表头排序后，菜单只有 `升序 | 降序 | 隐藏`——**回不到初始（未排序）状态**，
只能刷新页面恢复。

### 根因

排序菜单缺少"清空排序"项，状态一旦被设置就没有 UI 入口重置。

### 修复过程

排序菜单扩展为 **`默认 | 升序 | 降序 | 隐藏`**：
- 「默认」（`rotate-ccw` 图标）点击清空该列排序，回到初始顺序；
- 四个菜单项带**选中勾**（未排序勾"默认"、升/降序勾对应项），与其它下拉一致；
- Asc/Desc/Hide 文案一并接入 i18n（此前硬编码英文）。

### 验证

预览手测：升序 → 降序 → 默认 来回切换正常；选中勾状态正确；`just test`(7/7) 通过。

### 防坑指南

- 任何可设置/可切换的排序、筛选、显隐状态，**必须提供回到默认值的 UI 入口**；
- 菜单类 UI 的当前态要可视化（选中勾），否则用户不知道当前处于什么状态。

---

## BUG-002: 行选择被"选中即回弹"（label 合成 click 双触发）

- 类型：ui-table
- 严重度：高（交互无法使用）
- 发现时间：2026-08-20
- 修复提交：`9c2e83d`（feat(ui): 提取通用数据表格公共组件）
- 涉及文件：`app/components/ui/data-table.js`（组件提取时修正）
- 涉及组件：`App.ui.dataTable` 行选择（`data-dt-check` / `data-dt-check-all`）

### 现象

用 `<label>` 包裹隐藏 `<input type="checkbox">` 实现行选择时，点击后**选中状态立即回弹**
（选中不上）。组件提取前的原 tasks 实现存在同样的隐患。

### 根因

浏览器会把 label 的点击**转发为 input 的合成 click**，事件委托收到两次 click，
第一次切换选中、第二次又切回去——出现"点击无效果/回弹"。

### 修复过程

组件改为"**受控同步**"模式：点击后不依赖事件计数，而是以 `input.checked` 的真实状态为准
同步内部选中集合（读 DOM 状态作为唯一事实来源），杜绝双触发导致的回弹。

### 验证

Node 桩环境渲染 + 预览手测：勾选/取消/全选/半选（indeterminate）全部稳定；
`just test`(7/7) 通过。

### 防坑指南

- **`label` + 隐藏 `input` 的组合必须防合成 click 双触发**——以 `input.checked` 同步状态，
  不要在 click 处理器里做"翻转"类逻辑；
- 全选/半选状态（indeterminate）必须用 `input.indeterminate` 属性而非 class 模拟。

---

## BUG-003: 表格右上角「视图」「过滤」按钮不可见（工具类缺失）

- 类型：ui-css（机制）/ ui-table（表现）
- 严重度：高（按钮永久隐藏）
- 发现时间：2026-08-20
- 修复提交：`9897a54`（fix(ui): 补齐缺失的 Tailwind 工具类）
- 涉及文件：`app/styles/utilities.css`（修复）；`app/components/ui/data-table.js`（表现点）
- 涉及组件：`App.ui.dataTable` 工具栏右侧 `ms-auto hidden lg:flex` 容器内的视图/过滤按钮

### 现象

数据表格右上角「视图」（列显隐）、「过滤」（过滤器显隐）按钮不显示——
组件渲染与事件都有，按钮被 CSS 隐藏。

### 根因

`lg:flex` 工具类未编译进预构建产物（详见 **ui-css BUG-001**），
`hidden lg:flex` 容器永远 `display:none`。

### 修复过程

`utilities.css` 补齐 `lg:flex`（及全库另 10 个缺失类），见 ui-css BUG-001。

### 验证

预览手测：lg 屏以上显示视图/过滤按钮，点击弹出列显隐/过滤器显隐菜单；
审计脚本确认无其它缺失类。

### 防坑指南

同 ui-css BUG-001：新增 UI 用了工具类必须核对编译产物；
数据表格工具栏按钮（视图/过滤）依赖 `lg:flex`，改动 utilities.css 时勿删。
