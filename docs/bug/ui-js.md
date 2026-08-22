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

---

## BUG-004: bootstrap 核心层改动态 import() 后裸说明符启动失败

- 类型：ui-js
- 严重度：高（应用完全无法启动）
- 发现时间：2026-08-21
- 修复提交：见分支（loadScripts 经 new URL(baseURI) 归一化）
- 涉及文件：app/core/bootstrap.js（loadScripts）
- 涉及组件：核心加载器

### 现象
`TypeError: Failed to resolve module specifier 'shared/escape.js'`，boot failed。

### 根因
动态 `import()` 的说明符解析遵循 ESM 规则：不带 `./`、`../`、`/` 前缀的路径是
bare specifier（需 import map），而 AUTH_CORE/APP_CORE 清单沿用 `<script src>`
时代的根相对写法（如 'shared/escape.js'）——经典注入可用，import() 直接 TypeError。

### 修复过程
loadScripts 单点归一化：`import(new URL(src, document.baseURI).href)`，
对任意清单条目格式稳健；不逐条改清单，避免未来再犯。

### 验证
node --check 通过；浏览器刷新后 boot 正常。

### 防坑指南
1. `<script src>` 与 `import()` 的路径解析规则不同：迁移加载机制时，
   所有说明符必须经 `new URL(src, document.baseURI)` 归一化或显式带 `./`。
2. node --check 只验证语法不解析说明符，e2e 不经过浏览器引导——
   加载器改动必须真实浏览器刷新验证一次。


---

## BUG-005: tag-picker 完成按钮悬空调用已移除的 App.ui.closeDropdowns

- 类型：ui-js
- 严重度：低（静默 no-op，不抛错但逻辑残留）
- 发现时间：2026-08-22（前端挂载面 harness 首跑捕获）
- 修复提交：1a9dd39（test(ui) M4）
- 涉及文件：app/components/ui/tag-picker/events.js（done 分支）
- 涉及组件：App.ui.tagPicker（多选下拉「完成」按钮）

### 现象
点击多选下拉「完成」按钮时，代码尝试调用 `App.ui.closeDropdowns`，
但该挂载键早已随旧 ui.js ESM 拆分移除，调用恒为 no-op。

### 根因
ui.js 拆分时 `closeDropdowns` 未被保留在 App.ui 挂载面，tag-picker
的 done 分支沿用旧挂载键调用，且用 `App.ui.closeDropdowns ? ... : null`
的防御写法掩盖了悬空引用；真正关闭下拉的 DOM 操作紧随其后，导致
残留代码长期无感存在。

### 修复过程
删除 done 分支对 `App.ui.closeDropdowns` 的悬空调用（try/catch + 三目
全部移除），仅保留紧随其后的 DOM 关闭逻辑（`menu.classList.remove('open')`
+ `aria-expanded` 清理），行为不变、代码收敛。

### 验证
新增 scripts/mount-surface.test.js「App.ui 消费面」用例：扫描 app/ 全部
源码，任何 `App.ui.<key>` 必须命中已挂载键，此后再出现悬空调用即 CI 失败。
`just test` 52/52 通过。

### 防坑指南
1. 组件/模块拆分后必须跑一次「挂载面消费面」静态扫描（harness 已固化），
   防止旧挂载键的残留调用长期潜伏。
2. 防御式调用（`X ? X() : null`）会掩盖悬空引用，删除旧 API 时
   应全局搜索调用点，而不是依赖运行时静默。

---

## BUG-006: build.js 压缩 HTML 折叠内联脚本空白,导致 CSP sha256 哈希漂移

- 类型：ui-js
- 严重度：高（生产构建后首帧内联脚本被 CSP 拦截,主题/语言首帧应用失效）
- 发现时间：2026-08-22
- 修复提交：`2d5181d`（fix(security): CSP 收紧——内联脚本改用 sha256 哈希固定,移除 script-src unsafe-inline）
- 涉及文件：`scripts/build.js`、`index.html`
- 涉及组件：PREPAINT 首帧内联脚本

### 现象

给 CSP 的 `script-src` 加上 PREPAINT 内联脚本的 `sha256-` 哈希后,本地预览正常,
但 `node scripts/build.js` 产出的 `dist/index.html` 中,内联脚本实际哈希与 CSP
声明不一致——生产环境内联脚本被 CSP 拦截,主题/语言首帧应用静默失效。

### 根因

`scripts/build.js` 压缩 HTML 时执行 `fingerprintedHtml.split(/\s+/).join(' ')`,
把**所有**空白折叠为单空格——包括 `<script>` 块内部的换行与缩进。CSP 哈希是
按内联脚本的逐字节内容计算的,任何空白折叠都会改变哈希,而 CSP 声明里还是
源文件的哈希,二者漂移。

### 修复过程

1. `scripts/build.js` 新增 `compressHtml()`:用正则 `<script>[\s\S]*?<\/script>`
   切出内联脚本块,**逐字节保留**其内容,只对标签间空白压缩与换行;
2. `index.html` CSP: `script-src 'self' 'unsafe-inline'` → `'self' 'sha256-...'`
   （style-src 因组件动态注入 `<style>` 保留 `'unsafe-inline'`;静态 nonce 可被
   攻击者读取、无防护意义,静态文件正确做法是内容哈希）;
3. 新增 `scripts/csp.test.js` 自一致性测试（源 index.html:内联脚本哈希 == CSP 声明）;
4. `scripts/build.test.js` 增加 dist 产物断言:dist 内联脚本哈希必须在 dist CSP 中。

### 验证

`node --test`(76/76) 通过,含 csp.test.js 3 例与 build.test.js 的 dist 哈希回归断言;
`node scripts/build.js` 后 dist/index.html 内联脚本哈希与 CSP 声明一致。

### 防坑指南

- **任何对 `index.html` 内联脚本的修改必须同步更新 CSP 中的 `sha256-` 值**——
  否则生产构建后首帧脚本被拦截,本地开发(不经 build)却一切正常,极具迷惑性;
- **压缩/转译 HTML 时禁止折叠 `<script>` 内部空白**——哈希按字节计算;
- 给静态文件加 CSP 哈希后,务必跑一次真实 build 并在 dist 产物上验证哈希一致性
  （源文件通过不代表产物通过）。

## BUG-007: chats 模块事件域引用了不存在/未导出的下拉渲染函数,模块加载即抛 SyntaxError

- 类型：ui-js（JS 运行时引用错误 / 模块格式不匹配）
- 严重度：高
- 发现时间：2026-08-22
- 修复提交：（待提交）（feat(chats): 拆分超大文件并修复缺失导出）
- 涉及文件：
  - `app/modules/chats/chat-events.js`（修复前 import 清单）
  - `app/modules/chats/chat-composer.js`（补 `thinkingDropdownHtml` + 导出下拉函数）
  - `app/modules/chats/chat-right.js`（补导出下拉函数）
- 涉及组件：chats 模块事件域 / 输入框 / 右栏（无 App.ui 公共组件）

### 现象
`#/chats` 模块懒加载时,动态 `import('./index.js')` 求值 `chat-events.js`
即抛 `SyntaxError: The requested module ... does not provide an export named
'...'`,整个聊天模块白屏且控制台无其他线索;本地开发(不经过 build)同样触发,
因为问题出在源码 import 图上,与构建无关。

### 根因
拆分前的 `chat-events.js` 从兄弟文件 import 了**不存在或未导出**的名字:
1. `import { ..., thinkingDropdownHtml, ... } from './chat-composer.js'` ——
   `thinkingDropdownHtml` 在任何文件都不存在(输入框只有 `thinkingBtnHtml`
   分段控件,顶栏按钮 `data-ch-act="thinking-dd"` 需要下拉却无对应渲染函数);
2. `providerDropdownHtml / modelDropdownHtml / mcpDropdownHtml` 在
   `chat-composer.js` 中是普通函数,未 `export`;
3. `skillDropdownHtml / promptDropdownHtml / rightProviderDropdownHtml /
   maxTokensDropdownHtml` 在 `chat-right.js` 中同样是未导出的普通函数。
ESM 静态 import 的命名在**链接期**校验,缺任一导出即整棵 import 图求值失败;
因为模块是懒加载,错误只在首次访问 `#/chats` 时出现。

### 修复过程
1. `chat-composer.js`:新增 `export function thinkingDropdownHtml()`,渲染
   THINK_LEVELS(none/low/medium/high/max)下拉项(`data-ch-act="set-thinking"`,
   当前档打勾);把 `providerDropdownHtml / modelDropdownHtml / mcpDropdownHtml`
   补 `export`;
2. `chat-right.js`:把 `skillDropdownHtml / promptDropdownHtml /
   rightProviderDropdownHtml / maxTokensDropdownHtml` 补 `export`(拆分后经
   `chat-right.js` re-export 保持 `chat-events` 引用面不变);
3. 全部拆分完成后用 Node 模拟浏览器全局(`App`/`document` 桩)动态
   `import('./app/modules/chats/index.js')` 验证整棵 import 图链接成功,
   并确认 document 监听器注册齐全(click/contextmenu/input/keydown/paste/
   change/mousedown/mousemove/mouseup)。

### 验证
- `node --test`（134/134）通过;
- `node` 桩环境动态 import 模块入口成功,`App.defineModule` 被调用;
- `npm run lint` / `i18n:check` / `deps:check` / `build` / `build:budget` 全绿;
- 会话 CRUD / 配置+密钥加密落库的 API 冒烟测试通过。

### 防坑指南
- **懒加载 ESM 模块的 import 命名在链接期校验**——新增/重命名渲染函数时,
  如果其他文件 import 了它,必须同步导出;用 `node --check` 只能查语法,
  查不到链接错误,必须在桩环境下动态 `import()` 入口验证;
- 输入框/右栏「下拉浮层」类渲染函数(供事件域 openDd 复用)必须 `export`,
  不要在文件内留"仅本文件用"的非导出函数却被事件域引用;
- 拆分超大文件时,先 grep 出该文件的全部外部 import 名,再对照目标文件的
  export 清单做 diff,避免拆分过程中悄悄丢掉导出。
