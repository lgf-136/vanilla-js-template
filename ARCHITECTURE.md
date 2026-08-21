# ARCHITECTURE.md

> 本文档是迁移后项目的架构真源。协作规则见 `AGENTS.md`，使用说明见 `README.md`；发生冲突时以本文件与 `AGENTS.md` 为准。

## 0. 设计目标

1. **零第三方依赖**：`package.json` 的 `dependencies` 与 `devDependencies` 必须为空。
2. **完整复刻模板体验**：迁移自原 One API 模板的 Shell、Dashboard、Tasks、Apps、Chats、Docs、API Hub、Settings、主题、工作空间、配置文件与鉴权行为，文件已提升到当前仓库约定的目录。
3. **渐进式加载**：登录页只加载鉴权核心；登录后加载 Shell 与模块注册表；业务模块的实现、样式和语言包按路由懒加载。
4. **后端逻辑集中**：API 业务逻辑按 `server/modules/<id>/routes.js` 组织（必要时配 `service.js`；现有 `auth` 内联 SQL 属历史实现，逐步拆分），运行时差异只存在于 `server/adapters/`。
5. **安全默认**：登录密码不落库；会话只保存 SHA-256 哈希；敏感设置通过 AES-256-GCM 加密后落库；SQL 全部参数化。

## 1. 目录结构

```text
.
├── index.html                 # PREPAINT + critical.css + bootstrap.js
├── app/
│   ├── core/                  # bootstrap、app/、settings/、i18n/（目录模块）、auth、api、interactions
│   ├── components/
│   │   ├── layout/            # Shell 的布局入口与 shell 渲染器
│   │   └── ui/                # UI class 生成器、图标、头像、工作空间等公共能力
│   ├── styles/                # 模板 tokens、语义 token、关键样式、工具类
│   ├── fonts/                 # 模板本地字体资源目录
│   ├── lib/                   # 单文件前端库（如 Chart.js）
│   └── modules/
│       ├── registry.js        # 模块唯一登记点
│       ├── dashboard/
│       ├── tasks/
│       ├── apps/
│       ├── chats/
│       ├── docs/              # 含 sub/ 下四个文档子路由
│       ├── apihub/
│       └── settings/          # 含五个设置子路由
├── server/
│   ├── app.js                 # Web Request → Node 风格 API handler
│   ├── core/                  # API、鉴权、安全、HTTP、日志、环境
│   ├── db/                    # schema、scope、resolver/migrate、适配器工厂与 adapters/
│   ├── modules/               # auth、settings、apihub 路由与服务
│   ├── adapters/              # Node、Vercel、Cloudflare、Deno 入口
│   └── package.json           # 仅声明 server/ 内部使用 CommonJS
├── api/server.js              # Vercel 函数转接入口
├── shared/                    # 前后端共享常量、校验与 HTML 转义 helper（escape.js 运行时经 /shared/ 提供）
├── scripts/                   # dev、build、lint、test、预算与数据库脚本
└── public/                    # 公开静态资源
```

仓库不使用迁移包装层：前端不得出现 `app/template/`，后端不得出现 `server/template/`。原始模板目录（`.wrangler/html-template/`）在迁移完成后已移除，不参与运行时产物。

## 2. 前端运行时

### 2.1 引导顺序

`index.html` 先执行 PREPAINT 脚本读取 `html-template-*` 本地设置，应用主题、语言、风格、圆角、字体和侧边栏属性，避免首帧闪烁；随后加载 `app/core/bootstrap.js`。

引导顺序固定为：

```text
critical.css
  → escape(shared/escape.js，挂载 App.escape，全站唯一转义实现)
  → logger / i18n / icons-data / icons / api / auth / settings / ui
  → 若未登录：渲染 auth 登录卡片
  → 若已登录：tooltip / search / json-tree / color-picker / group-tree /
                tag-picker / data-table / avatar / shell / app / workspace /
                profile / interactions
  → app/modules/registry.js
  → App.start() → Shell → 当前路由模块
```

完整设计系统由 `bootstrap.js` 在鉴权核心之后加载 `tokens.css`、`semantic-tokens.css` 与 `utilities.css`；模块样式只在模块首次加载时注入。

核心层（AUTH_CORE / APP_CORE 清单）经原生动态 `import()` 按清单顺序串行加载（ADR-002），说明符统一经 `new URL(src, document.baseURI)` 归一化——动态 import 的相对说明符必须带 `./` 前缀，裸路径会直接 TypeError（见 docs/bug/ui-js.md BUG-004）；`deps` 类 UMD 依赖（如 Chart.js）仍走经典 `<script>` 预注入。核心文件因此同样可用 ESM 组织内部结构。

### 2.2 Shell 与滚动契约

`app/components/layout/shell.js` 是模板 Shell 的唯一渲染器，负责侧边栏、顶栏、设置 Sheet、工作空间菜单和用户菜单；业务模块只向 `[data-content-area]` 返回页面 HTML，不直接改 Shell。

- 桌面端使用固定侧边栏 + 顶栏 + 主内容区；
- 移动端由 `app/core/interactions.js` 创建抽屉侧边栏；
- 内容区使用唯一的页面级 `overflow-y-auto` 视口（`[data-slot="scroll-area-viewport"]`）；工作台式模块（apihub、settings）可在模块内部使用独立滚动容器（见 3.5）；
- 所有按钮、下拉、Sheet、Toast 和确认交互由公共 UI/class 生成器与事件委托完成，不使用浏览器默认弹窗或默认下拉视觉。

### 2.3 模块契约与懒加载

模块清单位于 `app/modules/<id>/module.config.js`，实际形状如下：

```js
const manifest = {
  id: 'dashboard',
  title: { 'zh-CN': '仪表盘', 'zh-TW': '儀表板', en: 'Dashboard' },
  icon: 'layout-dashboard',
  order: 1,
  route: '/',
  i18nNamespace: 'dashboard',
  loadRoot: () => import('./index.js'),
  load: 'index.js',
  css: 'module.css',     // 支持字符串或数组：数组按序加载（<link> 插入顺序即层叠优先级），超 500 行的模块样式须按职责拆分（红线 12）
  i18nFile: 'i18n.js',
  children: [],          // 子菜单（docs/settings 有值，其余为空数组）
  deps: ['app/lib/chart.umd.js'], // 可选：模块加载前预注入的脚本依赖（dashboard 使用）
};
```

`app/modules/registry.js` 仅登记各模块的 `module.config.js`。清单加载后由 `App.registerModule()` 建立路由和侧边栏菜单（侧边栏子菜单、路由匹配与导航均读取 `meta.children`，无 `submodules` 字段）；模块实现文件经原生动态 `import()` 懒加载（优先执行清单的 `loadRoot()`，未提供时按 `load` 路径兜底），因此模块内部可用 ESM 按业务域拆分文件（如 apihub 的 `hub-*.js`）；`meta.deps` 中的经典脚本（如 dashboard 的 Chart.js UMD）在实现加载前按序以 `<script>` 预注入。

模块实现调用：

```js
App.defineModule({
  id: 'dashboard',
  render(route, ctx) {
    return '<section>...</section>';
  },
});
```

Docs 和 Settings 的子模块使用 `sub/<id>.js` 并调用 `App.defineModule({ id, sub, render })`。模块之间不 import 其它业务模块，只依赖 `App.ui`、`App.icon`、`App.settings`、`App.i18n` 与 `ctx`。

### 2.3.1 模块内多文件组织（业务域拆分）

实现层支持原生 ESM 后，单个模块不再要求单文件。触发阈值：实现预计超过 300 行（红线 12 警戒区）即按业务域拆分；拆分按职责切割，禁止机械按行数切。

**前端标准分层**（实例：apihub 的 `hub-*.js`；文件前缀可按模块自定，关键是职责分层）：

| 文件 | 职责 |
|---|---|
| `index.js` | 入口装配：defineModule、页面组装、渲染函数注入、初始化；**文件头必须写明本模块的拆分设计** |
| `<prefix>-store.js` | 模块状态 + 数据加载/持久化 + 纯派生工具 |
| `<prefix>-view.js` | 视图控制：renderFull / 局部重绘入口，渲染函数由 index 装配期注入（registerPainters 模式） |
| `<prefix>-actions.js` | 配置/数据变更动作 |
| 业务域文件 | 列表 / 构建器 / 弹窗 / 事件委托等，一个功能域一个文件 |

依赖方向严格单向：`store ← 业务域/actions ← view(注入) ← events ← index`。跨域回调用装配期注入解耦（registerPainters / setHashSelector 模式），禁止为消除循环而把函数搬进低层造成循环依赖。

页面型模块（实例：settings）采用「一设置项一文件」：`sp-common.js`（共享框架：子导航清单与区块布局）+ `sp-<item>.js`（导出 `page<Item>(ctx)`）；新增设置项 = 新建一个 sp 文件 + PAGES 注册一行 + children 补一项，互不影响其他页。

硬性约束：

1. **副作用模块必须被显式导入**：仅注册监听器、无导出被消费的文件（如事件委托），若无人 import 则 ESM 不求值——监听器全部失效且无任何报错。入口必须显式 `import './<id>-events.js'`。
2. **拆分自检四项**：① 符号引用闭包完整——含「函数作为值传递」等非调用形态引用；② 从 index 沿 import 图遍历无孤儿文件（兼容副作用导入形态）；③ 行为零变更——切片与原文对照或既有测试全绿；④ 全部文件 ≤500 行。
3. 手写文件的符号被其他切片调用时，用装配期注入收敛，不要反向 import 造成循环。

服务端对应约定见第 4.2 节（routes 薄 + service IO 编排 + 纯逻辑兄弟文件）。

### 2.3.2 公共 UI 组件目录组织（一组件一文件夹）

`app/components/ui/` 下**一个组件一个文件夹，文件夹内 `index.js` 为入口**；组件经 bootstrap 核心层动态 `import()` 加载，因此内部用原生 ESM 组织，但对外契约与模块不同——**组件不调用 defineModule，而是挂载 `App.ui.<name>` / `App.ui.<family>.<method>` 命名空间**。

三种形态与拆法（按组件内聚选择，不强求一致）：

| 形态 | 实例 | 拆法 |
|---|---|---|
| 工具型（纯逻辑 + UI 薄壳） | color-picker | `color.js` 纯色彩数学 + `index.js` UI 层与命名空间挂载 |
| 容器型（状态 + 视图 + 弹窗/菜单/事件） | data-table / group-tree / tag-picker | `model.js`(状态+单例注册表+纯逻辑) / `render.js` / `dialog.js` / `menu.js` 或 `popover.js` / `events.js` / `index.js` 装配 |
| kit 核心（控件族集合） | ui.js → `core/` | 一控件族一文件：utils / form / dropdown / radio / feedback(toast+dialog+Esc) / context-menu / misc + `index.js` 装配 |

硬性约束：

1. **挂载面稳定铁律**：`App.ui.*` 挂载赋值逐字保留——成员一个不能少/多/改名，注入 `<style>` 内容逐字一致；消费方（其他组件/模块）零改动是验收标准。拆分前后做「挂载键集合 diff」与「桩 DOM 行为轨迹对照」。
2. **单例注册表放最底层文件**（如 INSTANCES/overlay/tagPop 放 model.js）：避免高层装配文件与 events 相互 import 形成循环。
3. **副作用文件必须被入口显式导入**：仅注册 document 监听器的文件（events/feedback/context-menu）若无人 import 则 ESM 不求值、监听器静默失效；多个副作用文件按原求值顺序在 index 显式按序导入（监听器注册顺序回归，harness 第一轮即抓到过）。
4. **跨文件引用一律 import/export**，禁止经典脚本全局变量约定；组件私有状态不放 window。
5. **宿主回调走 create(opts)/pickerHtml(opts) 注入**（受控组件铁律延伸）：组件内不硬编码文案与业务行为。
6. **路径接线三处**：bootstrap 核心清单、bundle-budget 首屏清单、build.test dist 断言；动态 import 说明符必须带 `./` 或经 baseURL 归一化。
7. **拆分自检四项同 2.3.1**：引用闭包含非调用形态、import 图无孤儿、行为零变更、单文件 ≤500 行（理想 ≤250）。

### 2.3.3 核心层目录化（app/core）

内核三件套已目录化，bootstrap 清单指向各自目录的 `index.js`：

| 目录 | 原文件 | 域文件 |
|---|---|---|
| `app/core/app/` | app.js(1295) | state(单例状态锚点) / registry / loaders / nav / shell-ui / render(含 .sp-content 滚动保持) / server-sync / workspaces / profiles / settings-bridge / actions / events + index 装配 |
| `app/core/settings/` | settings.js(954) | storage / defaults / appearance / workspaces / profiles / state(读写聚合) + index |
| `app/core/i18n/` | i18n.js(502) | dicts(纯数据词典) + index(运行时) |

要点：

1. **可变状态收敛**：跨文件共享的可变状态放最底层 state 文件，以 ESM live binding + setter 暴露（如 setSettings / resetOpenSubmenus），其他域经 setter 修改、直接读绑定取值——禁止各域自持副本；
2. **依赖单向**：index ← events/actions/bridge ← server-sync ← render ← … ← state；新增域文件先想清楚落在哪一层；
3. **归属以实际代码为准**：拆分前先测绘再落位（实例：服务端同步 pushSettingsToServer 实测在 app 内核而非 settings）；
4. **App.* 挂载面逐字稳定**：index 装配负责全部挂载，diff 为空是验收标准（App 内核 17 键 / App.settings 44 键 / App.i18n 6 键）；
5. 块注释内不得出现 `xxx-*/` 形态（会提前终止注释导致语法错误）。

### 2.4 路由、设置与国际化

应用使用 Hash 路由，支持 `/`、`/tasks`、`/apps`、`/chats`、`/docs/*`、`/apihub`、`/settings/*`；未知路径由 `App.ui.notFound()` 渲染 404。所有内容事件通过 `document` 委托绑定，重渲染后无需重复注册。

核心词典位于 `app/core/i18n/`（`dicts.js` 纯数据 + `index.js` 运行时）；模块词典由 `i18nFile` 在首次访问时写入 `window.__moduleI18n[id]`。支持 `zh-CN`、`zh-TW`、`en`，运行 `npm run i18n:check` 强制校验 key 集合一致。

设置状态由 `app/core/settings/`（`index.js` 装配，storage/appearance/workspaces/profiles/state 分域）管理并保存到 `html-template-*` 本地键；登录后与服务端 `app_settings` 双向同步。工作空间注册表和当前指针属于 `global` 作用域，其余设置按活跃工作空间隔离。

设置页（`/settings/*`）内保存修改后经 `updateSettings()` → `App.rerenderContent()` 重渲染当前视图，以保证与服务端状态一致；由于设置页是左右两栏独立滚动的工作台布局（见 3.5），`app/core/app/render.js` 的 `rerenderContent()` 会在重渲染前保存 `.sp-content` 的 `scrollTop` 并在重建后恢复，避免切换开关/单选时右栏跳回顶部；左栏导航与右栏内容互不干扰。

## 3. 样式系统

### 3.1 样式分层

`app/styles/tokens.css` 保留迁移模板的完整设计系统（Nova/shadcn 视觉语言、8 套风格、色板、暗色模式和组件规则）；`semantic-tokens.css` 提供迁移层的语义 token；`utilities.css` 保留模板补丁工具类；`critical.css` 只负责首帧基础布局与启动错误显示。

### 3.2 token 消费规则

新增视觉规则必须优先使用模板已有 CSS token 和 utility class。不要在模块中新增硬编码颜色或圆角；颜色/圆角缺失的 token 先补到 `tokens.css` 再消费，`just lint` 强制检查（含 CSS）。间距优先使用 `--spacing` 刻度（`calc(var(--spacing) * N)`），新增代码不得写死 rem/px 间距。新公共 UI 能力必须遵循 `AGENTS.md` 的键盘可达性、暗色模式和滚动约束。

### 3.3 主题状态

主题状态使用 `html.dark` 与 `style-*`、`base-*`、`chart-*`、`menu-*` class 组合，`App.settings.applySettings()` 负责把白名单值应用到根节点。基础色/强调色行右侧各有一个启用开关（`useBase` / `useAccent`）：开关关闭时对应 class 不挂载，表面色回退默认 zinc、主色回退主题模式默认（浅色近黑 / 深色近白），从而保证 dark 模式不被色板选项破坏；开关与色板选择都经 `html-template-*` 本地持久化并双向同步服务端 `app_settings`。强调色规则必须声明为 `:root.chart-*` / `:root.dark.chart-*`（与基础色规则同特异性且位于其后），否则会被 `:root.base-*` 的 `--primary` 压住而永不生效（`menu-color-inverted` 同理）。

### 3.4 模块样式作用域

模块私有样式以模块前缀限定（settings 用 `.sp-*`、apihub 用 `.hub-*` 等），随模块懒加载注入，只影响本模块；需要影响壳层容器时用 `[data-content-area]:has(...)` 限定生效页面（如 apihub、settings 的工作台铺满视口）。

### 3.5 滚动

页面级滚动只由壳层 `[data-slot="scroll-area-viewport"]` 承担；工作台式多栏布局（apihub、settings）允许在模块内部使用独立 `overflow-y: auto` 容器（左右栏各自独立滚动），禁止引入第二个页面级滚动视口（`html`/`body`/`#app` 不滚动）。

### 3.6 反留白铁律（信息展示类组件）

涉及卡片、列表项等信息展示组件必须遵守：

- 默认内边距使用 `--spacing-3`（`calc(var(--spacing) * 3)`）；
- 数值类信息必须配图标（`App.icon.iconSvg(...)`）；
- 空状态必须有图标 + 引导文案，禁止只有一行灰字。

### 3.7 受控组件铁律（主题面板全量控制）

所有组件（含 canvas 图表等非 DOM 渲染）必须由主题设置面板全量控制，逐项对应：

| 面板选项 | 控制方式 |
|---|---|
| 主题模式（跟随系统/浅/深） | `html.dark` + `prefers-color-scheme`，表面/文字/边框 token 双套定义 |
| 基础色（neutral…taupe）+ 启用开关 | `base-*` 类定义表面色 token；开关关闭时移除该类，回退默认 zinc 表面 |
| 强调色（zinc…yellow）+ 启用开关 | `chart-*` 类定义 `--primary / --primary-foreground / --ring / --sidebar-primary / --chart-1..5`；开关关闭时回退主题模式默认主色 |
| 风格（nova/vega/maia/lyra/mira/luma/sera/rhea） | `style-*` 类 + `[data-slot=*]` 组件规则（按钮/卡片/输入框等皮肤；全库按钮须带 `data-slot="button"` 才命中） |
| 正文字体 / 标题字体 | `--font-sans-base` / `--font-heading-base` |
| 圆角 | `--radius`（DOM 组件与 canvas 图表都须消费） |
| 菜单颜色 / 外观 / 强调 | `menu-*` 类（如 `menu-color-inverted`，须声明为 `:root.menu-*` 才生效） |

硬性要求（不可协商）：

1. **颜色禁止硬编码**（hex / rgb / hsl / oklch / 命名色，含注入 `<style>` 与内联 `style`），一律经 token 变量引用；唯一豁免是**用户显式指定的色值**（标签色、取色器实时预览、上下文菜单 hash 色等），且此类值来自数据字段或 `--nova-palette-*`，不写死在组件代码里。
2. **完整回退链路**：每个 token 消费处必须提供 fallback，顺序为「强调色 → 基础色 → 主题模式默认 → 兜底字面量」。例：`var(--primary, var(--chart-1, oklch(62% .04 285)))`、`var(--font-heading-base, inherit)`、`border-radius: var(--radius, 0.5rem)`、`border-color: color-mix(in oklab, var(--border) 60%, transparent)`。
3. **阴影/遮罩**为通用着色：遮罩背景统一消费 `--overlay-bg` / `--overlay-bg-soft`，阴影颜色统一消费 semantic-tokens.css 的 `--shadow-color-*` 阶梯（几何形状由使用处按需定义），DOM 组件可叠加 tokens.css 的 `.shadow-*` 工具类；组件内禁止写死 rgba/rgb 颜色（`just lint` 强制扫描函数颜色）。
4. **canvas 图表**不消费 DOM 规则，必须在初始化及 `app:themechange` 时经 `getComputedStyle(document.documentElement)` 读取同一 token（dashboard 的 `cssVar('--primary')`、`cssVar('--chart-2')`、`radiusPx()` 即此模式）并重建。
5. 新组件须在 light/dark 两套主题、全部 8 套风格与不同圆角取值下自测，无固定配色残留；`just lint` 强制检查颜色字面量（含 CSS 与注入样式）。

## 4. 后端架构

### 4.1 统一入口

`server/app.js` 提供统一的 `handleRequest(request, env)` 与 `createApp()`。Node 适配器把 `node:http` 请求转换为 Web `Request`，核心 handler 再将 Node 风格响应转换为 Web `Response`；业务路由不依赖具体平台。

- `server/adapters/node.entry.js`：本地开发与 Docker，静态资源 + API；
- `server/adapters/vercel.entry.js`：Vercel 函数响应转接；
- `server/adapters/cloudflare.entry.js`：Workers Assets 与 API 的入口；
- `server/adapters/deno.entry.mjs`：Deno.serve 与动态静态资源入口。

`server/package.json` 将后端 `.js` 文件限定为 CommonJS，避免根目录的 ESM 默认规则改变现有模板服务端实现。平台适配器只负责请求/响应和静态资源边界，路由与业务逻辑集中在 `server/core/` 与 `server/modules/`。

### 4.2 API 路由与鉴权

`server/core/api.js` 汇总 `auth`、`settings` 和 `apihub` 路由，并为所有非登录接口执行会话门禁。路由文件只负责参数读取、状态码和调用 service；API Hub 的公开路由、Bearer、全局密码与 API Key 策略由 `server/modules/apihub/service.js` 统一计算（纯逻辑拆分在同目录 `hub-shared.js` 常量与请求/路径工具、`hub-config.js` 配置规范化与生效策略，service 保留依赖注入的 IO 编排）。（现有 `auth` 路由仍内联少量 SQL，属历史实现；新增路由按 routes 薄 + service 拆分约定编写。）

核心管理接口中只有 `POST /api/auth/login` 公开（它是换取会话令牌的入口）；API Hub 路由可按配置设为公开 / Bearer / 全局密码 / API Key 策略（由 `server/modules/apihub/service.js` 计算，同样绕过默认会话门禁），其余管理接口默认需要 `x-auth-token`。登录密码来自 `AUTH_PASSWORD`，不会写入数据库。服务端生成随机会话令牌，数据库只写入 `auth_sessions.token_hash`、过期时间和选项；客户端按 `localStorage` 或 `sessionStorage` 保存令牌。

**服务端模块内多文件组织**（与前端 2.3.1 对应，防止单大文件回潮）：

- `routes.js` 薄路由：只做参数校验、状态码映射与调用 service，不写 SQL、不碰加解密；
- `service.js` 工厂（`createXxxService(deps)`）收拢依赖注入的 IO 编排（db / encrypt / decrypt 闭包）；
- 无 IO 纯逻辑（常量 / 校验 / 清洗 / 策略计算）外移同目录兄弟文件供 service 与测试直接复用（实例：apihub 的 `hub-shared.js` / `hub-config.js`），文件间 require 关系保持单向；
- 错误约定：service 抛出带 `status` / `code` 的 Error，routes 统一捕获映射为 JSON 响应；
- 对外导出面保持稳定：core/api 与测试只消费工厂与既定导出，拆分不改动任何调用方；
- 拆分自检同 2.3.1 第 2 条（引用闭包含非调用形态、无孤儿、行为零变更、单文件 ≤500 行）。

### 4.3 数据库与工作空间

`server/db/index.js` 根据 `DB_DRIVER` 加载适配器：

| 驱动 | 文件 | 场景 |
|---|---|---|
| `sqlite` | `server/db/adapters/sqlite.adapter.js` | Node ≥ 22.5（推荐 ≥ 23.4）本地开发与 Docker |
| `turso` | `server/db/adapters/turso.adapter.js` | Vercel、Deno 或远程部署 |
| `d1` | `server/db/adapters/d1.adapter.js` | Cloudflare D1 或 D1 REST |

所有适配器提供 `query(sql, params)`、`get(sql, params)`、`run(sql, params)` 与 `initSchema(schema)`。schema 位于 `server/db/schema.js`（唯一事实来源，`CREATE TABLE IF NOT EXISTS` 幂等），所有值使用参数绑定；业务 SQL 不允许字符串拼接参数。命令行脚本（`db:migrate` / `db:reset` / `db:seed`）经 `server/db/resolver.js`（`{ driver, db }` 薄封装）与 `server/db/migrate.js`（幂等 `ensureMigrated`）使用同一入口。

`app_settings` 使用 `(workspace_id, key)` 复合主键。`server/db/scope.js` 规定只有 `settings:workspaces` 和 `settings:activeWorkspace` 写入 `global`，其余设置按当前工作空间写入。API Hub 的 `apihub_config`、`apihub_history`、`apihub_logs` 也包含工作空间字段。

### 4.4 敏感数据

`server/core/security/` 提供敏感键判断和 AES-256-GCM 封装。敏感值在 `app_settings` 或 API Hub secrets 写入前加密（存储格式 `enc:v1:<iv_b64url>:<tag_b64url>:<ct_b64url>`，见 `server/core/security/core.js`）；读取时只在已鉴权响应中解密。`ENCRYPTION_KEY` 是 64 位 hex 的 32 字节主密钥；本地未配置时可生成 `server/core/.secret-key`，生产环境必须显式配置并安全保管。敏感字段完整清单见 4.6 节。

### 4.5 日志与静态资源

`server/core/logging/logger.js` 提供服务端日志；API Hub 对请求历史和访问日志进行工作空间隔离、保留期和数量限制。`server/core/http/static.js` 只允许 `/`、`/index.html`、`/app/`、`/public/` 与 `/shared/`，并阻断目录穿越、数据库、环境文件和服务端源码暴露；公开资源提供 MIME、安全头、ETag 和缓存策略。

### 4.6 敏感字段清单

以下字段属敏感字段，落库前必须经 `server/core/security/index.js` 的 `encrypt` 封装（`TEXT` 列存 `enc:v1:` 密文），读取时由路由层 `decrypt` 后才返回：

- 用户信息：邮箱、姓名、用户名、性别、年龄、电话、地址；
- 凭证类：API Key、Token、secret、credential；
- 需要落库的数据库连接凭证等。

新增涉及敏感字段的表/接口前，先确认加密方案，不确定就询问，禁止自行明文实现。

### 4.7 缓存分层

- API JSON 响应统一 `Cache-Control: no-store`（`server/core/http/json.js`），避免会话数据被中间层缓存；
- 静态资源按路径类型设置缓存策略（`server/core/http/static.js` 的 `cacheControl`，含 ETag 协商）；
- 只读 `GET` 接口如需自定义缓存，须在路由层显式设置并说明理由，避免每次击穿到 DB；
- API Hub 历史与访问日志有数量上限和保留期限制。

## 5. 构建与体积预算

`npm run build` 执行 `scripts/build.js`：清理并复制 `index.html`、`app/`、`public/`、`shared/` 到 `dist/`（`shared/escape.js` 是运行时 HTML 转义 helper，随静态资源一并发布；其余共享常量仅供测试引用），删除测试文件，对 JS/CSS 做零依赖安全压缩，并保持动态脚本路径不变。

`npm run build:budget` 的阈值为：

| 指标 | 阈值 |
|---|---|
| 首屏 JS（gzip） | ≤ 40KB |
| 单个懒加载模块文件（gzip） | ≤ 15KB |
| 首屏关键 CSS（gzip） | ≤ 8KB |

模块报告同时显示一个模块的资源总量；失败判断按每个独立懒加载文件的最大 gzip 值执行，因为实现 JS、语言包和 CSS 是浏览器分别请求的独立 chunk。

## 6. 部署矩阵

| 平台 | 入口 | 静态资源 | 数据库 |
|---|---|---|---|
| Node / Docker | `server/adapters/node.entry.js` | Node 白名单静态服务 | SQLite 或 Turso |
| Vercel | `api/server.js` → `server/adapters/vercel.entry.js` | `dist/` + Vercel rewrite | Turso |
| Cloudflare | `server/adapters/cloudflare.entry.js` + `wrangler.toml` | Workers Assets `dist/` | D1 |
| Deno | `server/adapters/deno.entry.mjs` | Deno 动态静态服务 | Turso |

部署 CLI 不写入依赖字段；按 `justfile` 中的 `npx <cli>@version` 命令临时调用。部署前运行 `npm run build`，生产密钥通过平台环境变量设置。

## 7. 验证命令

```bash
npm run deps:check
npm run lint
npm test
npm run i18n:check
npm run build
npm run build:budget
npm run db:migrate   # 幂等迁移（schema.js 自动建表）
npm run db:seed      # 写入演示设置数据（本地 SQLite）
```

所有迁移后的前端与后端文件必须通过这些检查；不要用忽略规则掩盖语法错误、禁用浏览器默认控件或依赖体积问题。

## 8. Commit Message 规范

遵循 Conventional Commits：

```text
<type>(<scope>): <简短描述>

- <逐文件说明改动，精确到新增/修改了哪个方法或组件>
- <一次提交只做一件语义完整的事>
```

- `type` ∈ `feat|fix|refactor|perf|style|docs|test|build|ci|chore`；
- 正文必须逐文件列出改动，禁止"优化了某模块"这类无法回溯的粗粒度描述；
- 示例：`fix(settings): 设置页左右两栏独立滚动并收紧布局`，正文逐文件说明 `module.css` 与 `app.js` 的具体改动。