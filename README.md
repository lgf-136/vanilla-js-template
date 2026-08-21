# One API

> 纯 JavaScript、零第三方依赖的模块化管理后台。

架构真源见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)，协作规则见 [`AGENTS.md`](./AGENTS.md)。

## 核心特性

- **零第三方依赖**：`package.json` 的 `dependencies` 与 `devDependencies` 始终为空。
- **完整模板 Shell**：响应式侧边栏、顶栏、移动端抽屉、拖拽调宽、工作空间切换、用户配置文件与主题设置面板。
- **完整业务页面**：Dashboard、Tasks 数据表格、Apps 集成网格、Chats 会话、Docs 四个子页面、API Hub 三栏请求工作区、Settings 五个子页面。
- **三语言**：简体中文、繁体中文、English；模块语言包随模块懒加载。
- **主题系统**：系统 / 浅色 / 深色、8 套风格、色板、字体、圆角、菜单与侧边栏设置，保留模板的 Nova 设计系统和本地样式资源。
- **工作空间与配置文件**：工作空间数据按 `workspace_id` 隔离，配置文件可保存外观、通知和显示设置。
- **服务端鉴权与持久化**：单密码登录、会话令牌哈希存储、SQLite/Turso/D1 适配器、API Hub 配置与历史记录。
- **四平台入口**：Node 本地服务、Cloudflare、Vercel、Deno 适配器，业务 API 统一从 `server/app.js` 汇总。

## 技术栈

| 层 | 实现 |
|---|---|
| 前端 | 原生 JavaScript、Hash 路由、动态模块加载、模板 CSS |
| UI | `app/components/ui/` 公共渲染函数与 SVG 图标集 |
| 后端 | Node 原生 HTTP + 标准 `Request` / `Response` 语义 |
| 数据库 | Node `node:sqlite`、Cloudflare D1、Turso HTTP |
| 校验 | `node --check`、自定义 lint、`node:test` |
| 构建 | Zero-Build 复制、静态资源指纹与零依赖词法压缩 |

## 快速开始

环境要求：Node.js ≥ 22.5（推荐 ≥ 23.4，`node:sqlite` 免 flag）。

```bash
# 安装步骤为空：仓库没有第三方依赖
npm run dev
```

服务默认监听 `0.0.0.0:${PORT:-3000}`。服务器模式必须配置 `AUTH_PASSWORD` 才能登录：

```bash
AUTH_PASSWORD=admin123 npm run dev
```

也可以把配置写入本地 `.env`；`.env` 不应提交到仓库。生产环境请通过部署平台的环境变量界面配置密钥，不要写入源码。

## 目录结构

```text
app/
  core/                  引导、鉴权、路由内核与交互；app//settings//i18n/ 为目录模块
                         （index.js 装配 + 业务域文件，见 ARCHITECTURE.md 2.3.3）
  components/
    layout/              Shell 布局渲染（shell/：sidebar/header/sheet + index 装配）
    ui/                  公共组件，一组件一文件夹（<comp>/index.js 入口；
                         超限组件按职责拆分，kit 核心在 core/ 按控件族分文件）
  modules/               dashboard/tasks/apps/chats/docs/apihub/settings
                         （apihub/settings 内部按业务域/设置项拆分多文件）
  styles/                模板设计系统、token、关键样式与工具类
  fonts/                 模板本地字体资源目录
  lib/                   单文件前端库
server/
  app.js                 API 运行时汇总入口
  core/                  API、鉴权、安全、HTTP 与日志
  db/                    schema、作用域与 SQLite/Turso/D1 适配器
  modules/               auth、settings、apihub 路由与服务
                         （薄路由 + service；apihub 纯逻辑拆分 hub-shared/hub-config）
  adapters/              Node、Vercel、Cloudflare、Deno 入口
shared/                   前后端共享常量、校验与 HTML 转义 helper（escape.js 运行时）
scripts/                  开发、构建、lint、测试、提交信息校验与预算检查
public/                   公开静态资源
```

仓库中不保留迁移包装目录：模板前端不放在 `app/template/`，模板后端不放在 `server/template/`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动 Node + SQLite 本地服务 |
| `npm test` | 运行全部 Node 测试 |
| `npm run lint` | 语法、禁用模式、颜色与 Tab 检查 |
| `npm run i18n:check` | 校验模块三语言 key 集合一致 |
| `npm run deps:check` | 校验无第三方依赖 |
| `npm run build` | 生成 `dist/` 静态产物 |
| `npm run build:budget` | 校验首屏和模块懒加载文件 gzip 预算 |
| `npm run db:migrate` | 执行数据库迁移 |
| `npm run db:reset` | 重建本地数据库 |
| `npm run db:seed` | 写入演示数据（settings:profile / account / notifications，写入 `ws-default` 工作空间；`settings:profile` 为敏感键，整值经 AES-GCM 加密后落库） |

## 环境变量

| 变量 | 说明 |
|---|---|
| `PORT` | Node 服务端口，默认 `3000` |
| `AUTH_PASSWORD` | 登录密码；服务器模式必填，不落库 |
| `ENCRYPTION_KEY` | AES-256-GCM 主密钥，64 位 hex；生产环境必填 |
| `DB_DRIVER` | `sqlite`、`turso` 或 `d1`，未设置时按运行环境选择 |
| `SQLITE_PATH` | SQLite 文件路径，默认 `sqlite.db` |
| `DATABASE_URL` | Turso/libSQL HTTP 数据库地址 |
| `DATABASE_AUTH_TOKEN` | Turso/libSQL Bearer Token |
| `D1_ACCOUNT_ID` / `D1_DATABASE_ID` / `D1_API_TOKEN` | 本地调用 D1 REST API 时使用 |

敏感值由部署平台的环境变量管理。应用设置中的邮箱、API Key、Token 和凭证字段通过 `server/core/security/` 加密后才会写入数据库；会话令牌只保存 SHA-256 哈希。

## API 约定

除登录接口外，API 默认需要 `x-auth-token`：

- `POST /api/auth/login`：登录并签发会话令牌
- `GET /api/auth/verify`：校验当前会话
- `POST /api/auth/logout`：注销当前会话
- `GET|PUT|DELETE /api/settings`：按工作空间读写设置
- `GET /api/hub/state`：读取 API Hub 路由、配置与历史
- `PUT /api/hub/config`：保存 API Hub 配置
- `PUT /api/hub/history`：保存请求运行历史

## 部署

- Cloudflare：`npm run build` 后使用 `wrangler.toml` 与 `server/adapters/cloudflare.entry.js`
- Vercel：使用 `vercel.json`、`api/server.js` 与 `server/adapters/vercel.entry.js`
- Deno：使用 `server/adapters/deno.entry.mjs`
- Docker：使用 `Dockerfile` 启动 Node 适配器

部署前请配置 `AUTH_PASSWORD`、`ENCRYPTION_KEY` 以及对应数据库驱动所需的连接变量。

## 语言与模块约定

业务模块放在 `app/modules/<id>/`，模块清单由 `app/modules/registry.js` 登记，根视图、样式和语言包按需加载。新增或调整文案后运行 `npm run i18n:check`；新增数据库查询必须参数化并遵循 `server/db/schema.js`（唯一建表来源，`CREATE TABLE IF NOT EXISTS` 幂等）与适配器参数绑定约定。
