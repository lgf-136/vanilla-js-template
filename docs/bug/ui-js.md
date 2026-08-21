# Bug 记录：JS 运行时引用错误（ui-js）

> 覆盖：组件内未定义标识符、跨文件引用缺失、加载机制与模块格式不匹配等运行时错误。
> 相关规范：AGENTS.md §1.13（统一转义）、§13（bug 必查必记）。
> 注：2026-08 公共组件已迁入 `app/components/ui/<comp>/index.js` 子目录，文中旧的单文件路径（如 `group-tree.js`）均指其迁移前前身。

---

## BUG-001: 分组新建/重命名弹窗点击即抛 escAttr is not defined

- 类型：ui-js
- 严重度：中（分组管理核心路径不可用）
- 发现时间：2026-08-21
- 修复提交：见分支 perf/global-optimization-202608211452（escAttr 别名补齐）
- 涉及文件：app/components/ui/group-tree.js
- 涉及组件：App.ui.groupTree（openDialog / openCreateDialog / doAction 调用链）

### 现象
分组/标签树右键菜单可弹出，但点击「新建分组」「重命名」等打开对话框的项时立即报
`ReferenceError: escAttr is not defined`（group-tree.js openDialog 内），对话框无法出现。

### 根因
A4「组件去硬编码文案」为 openDialog 的关闭按钮引入 `escAttr(opts.closeLabel || '')`，
但 group-tree.js 历史上只有私有 `esc()`（A1 后为 `var esc = App.escape.escHtml`），
从未有过 `escAttr`——使用了一个不存在的标识符。该路径仅在打开对话框时触发，
静态门禁（lint 的禁用模式/转义收敛检查）与既有测试均覆盖不到。

### 修复过程
在 group-tree.js 的转义别名区补一行 `var escAttr = App.escape.escAttr;`（与 esc 同源）。

### 验证
node --check 通过；Node 桩环境直接调用 openDialog 链路不再抛错；浏览器手测分组新建/重命名弹窗。

### 防坑指南
1. 给共享组件新增模板片段时，先核对该文件已有的转义别名集合（esc/escAttr 是否都存在）；
   两别名并非总是成对出现。
2. 「函数作为值传递」与「非调用形态引用」是拆分/搬移类重构的校验盲区：
   仅匹配 `name(` 形态的闭包检查会漏掉回调传参；应使用任意形态匹配并剥离注释/字符串后复查。
3. 组件改造后应对每个用户可达交互路径做一次真实点击冒烟（尤其对话框类延迟执行路径）。

---

## BUG-002: apihub 拆分后模块实现以经典脚本注入导致 import 语句语法错误

- 类型：ui-js
- 严重度：高（模块整体不可用）
- 发现时间：2026-08-21
- 修复提交：140fabd（实现层改经动态 import()）
- 涉及文件：app/core/app.js（ensureModuleLoaded/registerModule/loadScript 注释）
- 涉及组件：模块加载器

### 现象
进入 API Hub 报 `Uncaught SyntaxError: Cannot use import statement outside a module`（index.js:19）。

### 根因
`module.config.js` 的 `loadRoot` 字段从未被消费（registerModule 归一化时丢弃），
实现层实际走 `loadScript()` 经典 `<script>` 注入；ESM 多文件重构后的 index.js 含
import/export，被当经典脚本解析即语法错误。ADR-002 本就规定实现层走动态 import()。

### 修复过程
registerModule 保留 loadRoot；ensureModuleLoaded 根实现优先 `meta.loadRoot()`、
兜底动态 `import(moduleDir+meta.load)`，子模块实现同步改为 import()；
修正 loadScript 的失实注释；同步 ARCHITECTURE.md 2.3。

### 验证
just check 全绿（含 dist 构建产物全文件语法校验）；浏览器手测各模块懒加载。

### 防坑指南
1. 判断「某字段是否为活契约」要看消费点而非定义/校验点（loadRoot 曾只被 registry 校验）。
2. 模块内部多文件组织一律用原生 ESM（import/export），不要再引入经典脚本互相引用的全局约定。
3. 改动加载器后必须回归全部模块的首次进入路径，而非仅改动目标模块。

---

## BUG-003: apihub 拆分后深链选择器跨域引用缺失（applyHashSelection is not defined）

- 类型：ui-js
- 严重度：中（深链选中失效且阻断首屏渲染完成）
- 发现时间：2026-08-21
- 修复提交：a5b2381（setHashSelector 装配期注入）
- 涉及文件：app/modules/apihub/hub-store.js、index.js
- 涉及组件：apihub load() → 深链选择链路

### 现象
页面头部渲染后控制台报 `applyHashSelection is not defined`，列表不渲染。

### 根因
拆分生成器的自动导入只覆盖映射表内符号；手写进 index.js 的 applyHashSelection 被
store 域的 load() 调用却不可见。且该函数依赖 builder 域 selectRoute，直接搬入 store
会形成 store→builder→store 循环依赖。

### 修复过程
沿用 hub-view 的装配期注入模式：store 增加 hashSelector 槽位与 setHashSelector(fn)，
load() 在原时序点改为「有注入才调用」；index.js 装配区 setHashSelector(applyHashSelection)。

### 验证
just check 全绿；浏览器手测深链 #/apihub?r=<key> 自动选中。

### 防坑指南
1. 拆分/搬移重构后，除映射表内符号外，必须对手写文件的符号做一次反向引用审计
   （grep 手写函数名在其他切片中的出现）。
2. 跨域回调用「装配期注入」解耦（参照 registerPainters/setHashSelector），
   不要为图省事把函数搬进低层造成循环依赖。
