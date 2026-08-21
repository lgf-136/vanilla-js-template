# AGENTS.md

> 面向所有在本仓库工作的 AI 编码助手与人类开发者的操作规则。架构原理见 `ARCHITECTURE.md`（有冲突以该文件为准），本文件只讲"怎么做、别做什么"。

---

## 核心思想

- 以第一性原理思考问题。理解需求背后的真实目标，而不是直接套用已有模式或技术方案。
- 优先解决本质问题，避免为假设中的未来需求提前设计复杂系统。
- 在保证长期可维护性的前提下，选择当前最简单、可靠、清晰的实现方案。

## 代码质量原则

- 保持模块职责明确，避免一个模块承担过多职责。
- 优先使用成熟、稳定、维护良好的第三方库，而不是重复造轮子。
- 使用项目已有依赖解决问题之前，不要随意新增依赖。
- 在引入新方案前，先检查已有代码、依赖、文档和能力。

## 简洁与设计原则

- 遵循 KISS（Keep It Simple, Stupid）原则：优先选择简单直接的实现，避免不必要的复杂度。
- 遵循 DRY（Don't Repeat Yourself）原则：避免重复逻辑，但不要为了消除少量重复而创建过度抽象。
- 遵循 SOLID 思想：保持职责清晰、降低模块耦合，提高代码可维护性和扩展能力。
- 避免为了“看起来更优雅”而增加实际复杂度。

## 工程决策原则

- 优先选择长期可维护的方案，而不是只能临时运行的解决方案。
- 代码应该服务于业务目标，而不是为了展示技术复杂度。
- 如果简单方案已经满足需求，不要主动升级为复杂方案。

## 架构原则

- 不要为了保持向后兼容而长期保留废弃方案。优先删除过时代码，而不是增加兼容层、fallback 或临时迁移逻辑。
- 不要进行未经验证的架构设计。避免提前引入抽象、配置和间接层。
- 从最小可工作的版本开始，逐步演进系统。每次修改都应该建立在已有可运行系统之上。
- 永远不要用未来可能需要的复杂性，牺牲当前产品的可用性。




## 1. 硬性红线（不可协商，违反即视为错误提交）

> **元规则**：遇到无法满足红线的场景，停下来询问，禁止自行变通绕过。

1. **禁止安装任何第三方运行时依赖**。`package.json` 的 `dependencies` / `devDependencies` 必须始终为 `{}`。平台部署 CLI（`wrangler` `vercel` `deno` `docker`）作为外部工具通过 `npx <cli>@版本`（如 `npx wrangler@3`；也可用 `@latest`，见 `justfile` 的 `deploy-*` 目标）临时调用，不写入依赖字段。同理，**禁止从 CDN 加载任何脚本/样式/字体**（`<script src="https://...">` 等外链同样视为第三方运行时代码）。
2. **禁止使用浏览器内置弹窗/控件默认视觉**：`window.alert()` `window.confirm()` `window.prompt()`、原生 `<dialog>`/`<select>` 默认样式一律禁止，必须使用 `app/components/ui/` 的自研组件（`App.ui.*` 函数式渲染：`buttonClass` `dropdownContentClass` `toast` `radio` 等，见 `ARCHITECTURE.md` 2.3）。
3. **禁止硬编码颜色/圆角/间距字面量**。颜色与圆角一律通过 `app/styles/tokens.css` 定义的 CSS 变量消费，新增视觉样式前先检查 token 是否已存在，缺失则先在 `tokens.css` 补充（hex 字面量由 `just lint` 强制检查；rgb/hsl/oklch/命名色靠评审把关）；间距优先使用 `--spacing` 刻度（`calc(var(--spacing) * N)`），新增代码不得写死 rem/px 间距。
4. **禁止跨模块直接 import**。`app/modules/<A>` 不得 import `app/modules/<B>` 内部任何文件。确需复用，先把代码"上移"到 `app/components/ui`（组件/渲染函数）或 `shared/`（纯函数/常量），再各自引用（`just lint` 自动扫描违规）。
5. **页面级滚动只由壳层承担**：`html`/`body`/`#app` 不滚动，唯一的页面级滚动视口是壳层 `[data-slot="scroll-area-viewport"]`（`overflow-y: auto`）。业务模块如需工作台式多栏布局（如 apihub、settings），可在模块内部使用独立 `overflow-y: auto` 容器，但不得引入第二个页面级滚动视口。
6. **新增业务模块禁止修改壳层文件**（`app/components/layout/*`、`app/core/app.js`、`app/core/bootstrap.js`）。唯一允许改动的登记点是 `app/modules/registry.js` 新增一行。
7. **SQL 一律参数化，禁止字符串拼接拼 SQL**（参数统一经适配器绑定，见 `ARCHITECTURE.md` 4.3）。
8. **敏感字段禁止明文入库**（清单见 `ARCHITECTURE.md` 4.6 节：用户信息、API Key、Token、需要落库的数据库凭证等）。新增涉及敏感字段的表/接口前，先确认加密/哈希方案，不确定就询问而不是自行明文实现。
9. **禁止引入 ORM 或查询构建器依赖**，保持 SQL-first。
10. **建表 SQL 单一来源、只增不改**：`server/db/schema.js` 是唯一事实来源，新表只追加 `CREATE TABLE IF NOT EXISTS`（幂等）；旧结构迁移在适配器 `migrateAppSettings` / `migrateAuthSessions` 中幂等执行，不得修改已合并的迁移逻辑。
11. **组件必须是受控、可拓展且受主题设置面板全量控制（铁律，不可违反）**：任何新增/修改组件必须提供清晰的配置/数据/状态接入点，禁止只适配单一页面或复制业务实现；默认视觉统一为 **shadcn base UI + nova style + zinc color** 变体，移植参考项目时禁止照搬其组件样式。颜色一律经 token 变量引用并带完整回退链路，**禁止硬编码颜色**（唯一豁免：用户显式指定的色值，且走数据字段或 `--nova-palette-*`）；阴影/遮罩一律走 `.shadow-*` 工具类或 `--shadow-color-*` / `--overlay-bg*` token 阶梯；canvas 图表等非 DOM 渲染消费同一 token 并监听 `app:themechange` 重建。完整细则（主题面板选项对照表、回退链路示例、自测矩阵）见 `ARCHITECTURE.md` 3.7。
12. **单文件行数硬性上限 500 行，超限必须拆分**。理想区间 100–250 行；300 行起进入警戒区，应开始规划拆分。组件保持 100–250 行，页面级实现不超过 300 行，测试文件可放宽至 500 行。拆分必须按业务职责（UI / 业务逻辑 / 数据处理 / 类型定义）进行，禁止机械按行数切割；出现多职责混杂、嵌套过深、逻辑重复、难以测试或改动互相影响时，即使未超行数也应拆分。例外（可适当放宽）：自动生成的代码、类型声明文件（`.d.ts`）、静态配置/数据文件、数据库迁移脚本。行数由 `just lint` 自动统计；存量超标文件在 `scripts/lint.js` 的 `LEGACY_OVERSIZED` 清单挂账，只许减少不许增加，拆分后即从清单移除。
13. **动态内容拼入 HTML 必须经统一转义函数**。本项目以 HTML 字符串渲染 UI，任何用户数据/外部数据（DB 值、接口响应、URL 参数等）插入模板前必须过转义 helper；唯一实现收敛在 `shared/escape.js`（浏览器经 `App.escape.escHtml / escAttr` 消费，由 `just lint` 强制禁止私有副本）；HTML 属性值必须转义并加引号，`innerHTML` 只允许接收受控模板。
14. **真实凭证禁止入仓**：`.env` 只放本地开发占位值；token / 密码 / 私钥不得出现在源码、种子与演示数据、文档中；客户端存储（localStorage / sessionStorage）禁止存放明文敏感信息。
15. **破坏性操作必须有界**：SQL 的 `DELETE` / `UPDATE` 必须带 WHERE 且经主键/唯一键限定；禁止 DROP 已发布的表/列（结构演进一律走第 10 条的追加式迁移）；批量删除类业务操作必须经 `ui-confirm` 二次确认。
16. **新增路由默认必须经过会话门禁**：公开路由需显式标注并说明理由（见第 6 节），未标注理由的匿名可达路由视为越权漏洞。
17. **用户可见文案一律走 i18n 三语言**（en / zh-CN / zh-TW），禁止在组件中硬编码文案（流程见第 7 节）。

---

## 2. 新增一个"模块"（侧边栏一级菜单）标准流程

1. 新建 `app/modules/<id>/`，包含 `module.config.js` `index.js` `module.css` `i18n.js`（子模块另建 `sub/`）；
2. `module.config.js` 按 `ARCHITECTURE.md` 2.3 节的 `ModuleManifest` 形状导出清单（id / icon / order / i18nNamespace / loadRoot / load / css / i18nFile / children / 可选 deps）；
3. 在 `app/modules/registry.js` 补一行 `import()` 登记；
4. 新建 `server/modules/<id>/routes.js`（必要时配 `service.js`），在 `server/core/api.js` 的路由汇总处登记（同样只加一行，不改其它模块路由）；
5. 若需要新表：在 `server/db/schema.js` 追加 `CREATE TABLE IF NOT EXISTS`，表名遵循 `[module]_[entity]`；
6. 在 `i18n.js` 补齐三语言（`en` / `zh-CN` / `zh-TW` 三个对象），跑 `just i18n-check` 确认三语言 key 对齐；
7. 补单元测试（源码同目录 `*.test.js`），跑 `just test`；
8. 跑 `just lint` 与 `just build-budget` 确认不超体积预算；
9. 提交前对照第 9 节"提交前自检清单"。

> **大模块多文件组织（防止单大文件回潮，前端 + 服务端同步）**：
> 实现预计超过 300 行（红线 12 警戒区）时，按业务域拆分为多文件，禁止堆在单个 index.js / routes.js 里。
> - **前端**：`index.js` 只做装配（defineModule、页面组装、渲染注入、初始化），**文件头必须写明本模块拆分设计**；
>   业务域一域一文件（状态 store / 动作 actions / 视图控制 view / 事件委托 events；页面型模块一设置项一文件）；
>   依赖方向严格单向，跨域回调用装配期注入解耦；副作用模块（仅注册监听器、无导出）必须被入口显式导入，
>   否则 ESM 不求值、监听器全部静默失效。
> - **服务端**：routes 薄（参数校验 + 状态码映射）；service 工厂收拢 IO 编排（db/encrypt/decrypt）；
>   无 IO 纯逻辑外移同目录兄弟文件；错误由 service 抛带 status/code 的 Error、routes 统一映射。
> - **拆分自检四项**：① 符号引用闭包完整（含「函数作为值传递」等非调用形态）；
>   ② 从入口沿 import/require 图遍历无孤儿文件；③ 行为零变更（切片对照或测试全绿）；④ 全部文件 ≤500 行。
> 分层模板、实例与完整约束见 `ARCHITECTURE.md` 2.3.1 与 4.2。

## 3. 新增一个"子模块"（二级菜单）标准流程

同上，实现文件放 `app/modules/<parent>/sub/<id>.js`（调用 `App.defineModule({ id, sub, render })`），`module.config.js` 中父模块的 `children` 数组补一项；子模块纯前端渲染，无独立后端路由；子模块与同级其它子模块之间同样禁止相互 import。

## 4. 新增/复用 UI 组件规范

- 先搜索 `app/components/ui/` 是否已有可复用组件，**禁止在模块私有目录重复造已存在的基础组件**（按钮、卡片、弹窗、输入框、下拉、Tabs 等）；
- 只有明确"仅本模块使用、不具备通用性"的组件才放在模块的 `components/` 目录；
- 新建公共组件必须：沿用 `App.ui` 函数式渲染（返回 HTML 字符串，不使用 Shadow DOM）、只消费 token 变量（不硬编码视觉数值）、支持键盘可达性（Tab/Enter/Esc）、在 light/dark 两套主题下自测；
- 新建/修改组件必须是**受控且可拓展组件**（见 `ARCHITECTURE.md` 3.7 铁律）：默认视觉以 **shadcn base UI + nova style + zinc color** 为基线，并全量响应主题面板所有选项（主题模式、基础色、强调色、风格、字体、圆角、菜单外观）；移植参考项目时不得直接复制其组件样式，必须改造为本项目统一 UI；默认视觉只允许来自 token 变量，禁止自带固定配色；颜色必须引用基础色/强调色驱动变量并带完整回退值（`var(--token, fallback)`），明暗两套主题、全部 8 套风格与不同圆角下自测无固定配色残留；
- 涉及信息展示类组件（卡片、列表项等）必须遵循 `ARCHITECTURE.md` 3.6 节"反留白铁律"：默认使用 `--spacing-3`、数值类信息配图标、空状态必须有图标+引导文案。

> **组件文件夹组织与拆分（防止单大文件回潮）**：
> 公共组件一律「一组件一文件夹」，文件夹内 `index.js` 为入口（bootstrap 经动态 import() 按序加载，
> 说明符须带 `./` 或经 baseURL 归一化）。实现预计超过 300 行（警戒区）时按形态拆分：
> - **工具型**：纯逻辑伴生文件（如 color-picker/color.js 色彩数学）+ index.js UI 层；
> - **容器型**：model(状态+单例注册表) / render / dialog / menu·popover / events / index；
> - **kit 核心**：一控件族一文件（ui/core/：utils/form/dropdown/radio/feedback/context-menu/misc）。
> 铁律：① `App.ui.*` 挂载面逐字稳定，拆分前后做挂载键 diff 与行为轨迹对照，消费方零改动；
> ② 单例注册表放最底层文件防循环；③ 副作用文件（仅注册监听器）必须被入口显式导入并按原顺序排列；
> ④ 路径接线三处同步：bootstrap 清单 / bundle-budget 首屏清单 / build.test dist 断言；
> ⑤ 拆分自检四项同 §2 引用块。分层细则见 `ARCHITECTURE.md` 2.3.2。

## 5. 数据库变更规范

- 新表命名：`[module]_[entity]`，子模块专属表：`[module]_[submodule]_[entity]`；
- 全局配置一律走 `app_settings`，key 命名 `domain:subject[:field]`（如 `settings:profile`、`accounts:webdav`），**不要为全局配置新建专用表**；
- 涉及敏感字段：确认 `schema.js` 中字段类型为 `TEXT`（存放密文，格式 `enc:v1:<iv>:<tag>:<ct>`，见 `ARCHITECTURE.md` 4.4），读写必须显式调用 `server/core/security/index.js` 的 `encrypt` / `decrypt` 封装，**不允许绕过封装直接读写敏感字段**；
- `schema.js` 只追加不修改（`CREATE TABLE IF NOT EXISTS` 幂等），旧结构迁移逻辑（`migrateAppSettings` / `migrateAuthSessions`）不得改动已合并行为。

## 6. API 路由新增规范

- 路由放在对应模块的 `routes.js`，业务逻辑放 `service.js`，**路由函数本身不写 SQL / 不写加解密逻辑**，只做参数校验 + 调用 service（现有 `auth` 路由内联 SQL 属历史实现，新增路由遵循此约定）；
- 所有需要鉴权的路由默认经过 `server/core/api.js` 的会话门禁（`x-auth-token`）校验，公开路由需显式标注并说明理由；
- 只读 `GET` 接口需要考虑是否设置 `Cache-Control`（见 `ARCHITECTURE.md` 4.7 节缓存分层），避免每次都击穿到 DB。

## 7. i18n 新增文案流程

1. 在对应模块 `i18n.js` 的 `window.__moduleI18n['<id>']` 中新增 key（命名空间 `<module>.<scope>.<name>`）；
2. 同步补齐 `en` / `zh-CN` / `zh-TW` 三个语言对象的同一 key；
3. 跑 `just i18n-check`，确认三语言 key 集合完全一致，缺一个都视为失败（脚本已覆盖模块 `i18n.js`）；
4. 壳层通用文案（按钮、通用提示等）改 `app/core/i18n.js`，命名空间 `sidebar.*` / `settings.*` 等。

## 8. 性能与体积自检

- 新增依赖大量代码前，先跑一次 `just build-budget`，确认当前基线；改动后再跑一次对比增量；
- 单个懒加载模块文件 ≤ 15KB（gzip，阈值以 `ARCHITECTURE.md` 第 5 节为准），若超出，优先考虑：拆更小的子路由懒加载、复用公共组件而非复制代码、检查是否有未裁剪的调试代码；
- 禁止为图方便引入整份第三方图标库/字体文件到仓库，图标走 `app/components/ui` 内已有的 SVG 图标集，新增图标需精简 SVG（去冗余属性）。

## 9. 提交前自检清单（每次提交前逐项确认）

> 前 5 项可用 `just check` 一键执行（依赖 + lint + 测试 + i18n + 体积预算）。

- [ ] `just deps-check` 通过（无第三方依赖）
- [ ] `just lint` 通过（无禁用模式：`window.alert` 等）
- [ ] `just test` 通过
- [ ] `just i18n-check` 通过
- [ ] `just build-budget` 通过（未超体积预算）
- [ ] 涉及新模块/子模块：`registry.js` 已登记，且未触碰壳层文件
- [ ] 涉及敏感字段：已走加解密封装，未明文入库
- [ ] 涉及 SQL：已参数化（无字符串拼接）
- [ ] 涉及 UI：未使用 `window.alert/confirm/prompt`，样式全部走 token
- [ ] 涉及 UI 组件：已核对"受控组件铁律"（见 ARCHITECTURE.md 3.7）——颜色无硬编码（除用户指定色值）、token 消费均带回退值、主题面板各选项（强调色/基础色/风格/字体/圆角/明暗）切换均有可见响应
- [ ] 涉及信息卡片类 UI：已核对"反留白铁律"
- [ ] 涉及动态渲染：外部数据已经统一转义函数处理（无 XSS 面）
- [ ] 安全：无真实凭证入仓；SQL 删改带 WHERE 边界；批量删除经 `ui-confirm`；新路由默认过会话门禁
- [ ] 文案：用户可见文案全部进 i18n 三语言
- [ ] Commit message 符合 Conventional Commits 且正文逐文件说明改动（见第 10 节）
- [ ] 涉及 bug 修复：已查过 `docs/bug/` 既有记录、并按第 13 节写入对应类型文档

## 10. Commit Message 规范

格式与完整示例见 `ARCHITECTURE.md` 第 8 节，此处仅重申硬性要求：

- Header：`<type>(<scope>): <简短描述>`，`type` ∈ `feat|fix|refactor|perf|style|docs|test|build|ci|chore`；
- **正文必须逐文件列出改动**，且精确到"新增/修改了哪个方法或组件"，禁止只写"优化了笔记模块"这类无法回溯的粗粒度描述；
- 一次提交只做一件语义完整的事，禁止把无关模块的改动混在同一个 commit。

## 11. Code Review Checklist（评审者/评审 Agent 使用）

- [ ] 是否有跨模块直接 import？（应重构到 `shared/` 或 `components/ui`）
- [ ] 是否有硬编码视觉数值 / 原生浏览器弹窗？
- [ ] 组件是否受主题面板全量控制（受控组件铁律）？颜色是否有硬编码（唯一豁免：用户显式指定的色值）？token 消费是否都带回退值、形成完整回退链路？canvas 图表是否消费同一 token 并监听 `app:themechange` 重建？
- [ ] 新表/新字段命名是否符合规范？敏感字段是否走加密？
- [ ] SQL 是否参数化？是否有 N+1 查询可以合并？
- [ ] 动态 HTML 是否统一转义？有无真实凭证入仓或客户端明文敏感信息？
- [ ] DELETE/UPDATE 是否有界？公开路由是否显式标注理由？
- [ ] 是否更新了三语言文案？
- [ ] 是否需要同步更新 `ARCHITECTURE.md`（见第 12 节判断标准）？
- [ ] Commit message 是否逐文件说明到方法/组件级别？
- [ ] 涉及 bug 修复：是否查过 `docs/bug/` 既有记录？是否按第 13 节记录了 `docs/bug/ui-*.md`？

## 12. 何时必须同步更新 `ARCHITECTURE.md` / `README.md`

以下变更**必须**在同一 PR 内同步更新 `ARCHITECTURE.md` 对应章节，否则视为文档漂移、评审不通过：

- 新增/更换数据库适配器或自动选型逻辑；
- 调整鉴权机制（令牌格式、会话时长选项、传输方式）；
- 新增部署平台或调整某平台默认数据库；
- 调整目录结构约定、模块注册契约（`ModuleManifest` 形状）——含新增/变更契约字段（如 `children`、`deps`）；
- 调整体积/性能预算数值；
- 新增/变更 `shared/` 常量或校验（`shared/` 是前后端共享约定的预留目录，变动须同步 `ARCHITECTURE.md`）；
- 新增/变更主题面板选项或 token 契约（色板、启用开关、风格、字体、圆角、菜单外观等）——含选择器特异性/回退链路规则调整。

`README.md` 需要同步更新的情形：新增/变更环境变量、新增部署平台、新增语言、常用命令（justfile）增删。

## 13. Bug 记录与查询规范（遇到 bug 必查、修复后必记）

- **遇到 bug 先查 `docs/bug/`**：按类型（`ui-layout` / `ui-theme` / `ui-css` / `ui-table` / `ui-i18n` 等）翻阅既有记录，命中同根因时直接套用其"防坑指南"，禁止重复排查、重复踩坑；
- **修复后必记录**：任何 bug 修复（含顺带修复）必须在本 PR 内写入 `docs/bug/ui-<类型>.md`（无对应类型则新建，并在 `docs/bug/README.md` 索引补一行）；
- 记录内容必须包含：现象、根因、涉及文件与组件、修复过程（精确到方法/选择器/属性）、修复提交 hash、验证方式、防坑指南——信息越详细越好，方便后续回溯；格式模板见 `docs/bug/README.md`；
- 新增/变更 `docs/bug/` 分类或模板时，同步更新 `docs/bug/README.md`；
- 修复涉及主题面板/token 契约等契约级变更时，同时按第 12 节判断是否同步 `ARCHITECTURE.md`。
