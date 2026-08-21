# Cloudflare Workers + D1 部署

本项目在 Cloudflare 的后端入口是 `server/adapters/cloudflare.entry.js`，D1 绑定名固定为 `DB`，数据库名与 `wrangler.toml` 中的 `database_name` 保持一致（当前为 `vanilla-js-template`）。前端生产静态文件由 `node scripts/build.js` 生成到 `dist/`。

> **静态资源已由 Workers Assets 提供**：`wrangler.toml` 的 `ASSETS` binding 指向构建产物 `dist/`，入口会把静态文件交给 Assets，并将未命中的前端路由回退到 `index.html`。每次部署前必须先运行 `node scripts/build.js`。

## 1. 部署前准备

需要：

- Cloudflare 账号和 Account ID；
- Wrangler（通过 `npx` 临时调用，不写入项目依赖）；
- 一个 D1 数据库；
- `ENCRYPTION_KEY` Secret；
- `AUTH_PASSWORD` Secret（登录密码，服务器模式必填）；
- 生产环境的 `database_id`。

安全要求：

- `database_id` 不是密码，可以写入 `wrangler.toml`；
- API Token、`ENCRYPTION_KEY`、`AUTH_PASSWORD` 不得写入仓库；
- 登录密码经 `AUTH_PASSWORD` 环境变量/Secret 注入，服务端做常量时间比较（见 `server/core/auth/password.js`），不会落库；
- 生产环境必须配置 `ENCRYPTION_KEY`，否则用户资料等敏感字段无法加密。

## 2. 检查并配置 `wrangler.toml`

当前配置的关键部分应类似：

```toml
name = "vanilla-js-template"
main = "server/adapters/cloudflare.entry.js"
compatibility_date = "2025-01-01"

[assets]
directory = "./dist"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "vanilla-js-template"
database_id = "替换为真实的 database_id"
migrations_dir = "server/db/migrations"
```

迁移文件实际位于 `server/db/migrations/`，当前仓库的 `wrangler.toml` 已通过 `migrations_dir` 注册该目录。执行 Wrangler migration 前仍需把 `database_id` 替换为真实的 D1 数据库 ID。

Cloudflare Workers 与 Pages 的静态托管入口不同：

- **独立 Workers（当前 `wrangler deploy`）**：使用 `ASSETS` binding 提供 `dist/`，入口负责 `/api/*` 和 SPA fallback；
- **Pages Git 集成**：也可以把构建输出目录设置为 `dist`，但要确保 `/api/*` 由 Pages Functions/Worker 入口转发到 `server/adapters/cloudflare.entry.js`，不要同时维护第二套 API 入口。

## 3. Cloudflare Dashboard 导入 Git 仓库

不同账户的菜单名称可能略有差异，推荐在 **Workers & Pages** 中使用 Git 集成：

1. 打开 **Workers & Pages** → **Create application**。
2. 选择从 Git 仓库导入，授权并选择本仓库及目标分支。
3. 构建配置使用：
   - Framework preset：Other / None；
   - Build command：`node scripts/build.js`；
   - Static output directory：`dist`；
   - Node.js：22 或项目要求的兼容版本。
4. 在 Worker/Pages Functions 的 Settings → Variables and Secrets 添加：
   - `ENCRYPTION_KEY`，类型选择 Secret；
   - `AUTH_PASSWORD`，必填，类型选择 Secret。
5. 确认 D1 绑定名称为 `DB`，并指向 `wrangler.toml` 中的数据库。
6. 首次发布前完成一次远程 D1 migration（见下一节）。
7. 发布后确认前端静态资源和 `/api/auth/status` 都由同一域名提供。

如果 Dashboard 无法识别 `server/adapters/cloudflare.entry.js` 或 `wrangler.toml`，不要在控制台另建一套不同的 API 入口；改用 CLI/GitHub Actions，并先完成静态资源映射配置。

## 4. CLI 部署

登录并创建 D1：

```bash
npx wrangler@latest login
npx wrangler@latest d1 create vanilla-js-template
```

把命令返回的 `database_id` 写入 `wrangler.toml`，然后构建并执行迁移：

```bash
node scripts/build.js
npx wrangler@latest d1 migrations list vanilla-js-template --remote --config wrangler.toml
npx wrangler@latest d1 migrations apply vanilla-js-template --remote --config wrangler.toml
npx wrangler@latest deploy --config wrangler.toml
```

设置 Secret：

```bash
printf '%s' "$ENCRYPTION_KEY" | npx wrangler@latest secret put ENCRYPTION_KEY --config wrangler.toml
printf '%s' "$AUTH_PASSWORD" | npx wrangler@latest secret put AUTH_PASSWORD --config wrangler.toml
```

变量值应来自本地安全环境或 CI Secret；不要把命令输出、Token 或密钥提交到仓库。

## 5. 数据库迁移

迁移文件是 `server/db/migrations/*.sql`，版本只增不改。发布迁移前检查：

```bash
npx wrangler@latest d1 migrations list vanilla-js-template --remote --config wrangler.toml
npx wrangler@latest d1 migrations apply vanilla-js-template --remote --config wrangler.toml
```

Cloudflare Worker 运行时无法读取仓库本地迁移目录，生产 schema 由 GitHub Actions/CLI 在发布前显式执行 D1 migration；Node 本地入口仍保留启动时的幂等迁移检查。新增数据库变更必须创建下一个序号的迁移文件，禁止修改已经发布的 SQL。

## 6. GitHub Actions

仓库的 `.github/workflows/deploy-cloudflare.yml` 支持两种触发方式：

- 推送 `v*` tag，例如 `v1.0.0`；
- Actions 页面手动运行，并通过 `ref` 输入指定要部署的分支、tag 或 commit（默认 `main`）。

Workflow 会按顺序执行源码检查、Node 22 构建、远程 D1 migration 和 Wrangler deploy。首次发布前仍需创建 D1 数据库、把真实 `database_id` 写入 `wrangler.toml`，并确保 `migrations_dir` 指向 `server/db/migrations`。

在仓库 Settings → Secrets and variables → Actions 中添加：

| Secret | 用途 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Wrangler 发布和 D1 migration 权限 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

Token 只通过 GitHub Actions Secret 注入，不要写入 workflow、`wrangler.toml` 或日志。D1 数据库创建不由 workflow 自动完成。

## 7. 验证

项目当前没有 `/api/health` 路由，请使用公开的鉴权状态接口，并确认根路径和一个嵌套路由都能返回前端：

```bash
curl -i https://<your-domain>/api/auth/status
curl -i https://<your-domain>/
curl -i https://<your-domain>/notes/list
```

应返回 HTTP `200` 和类似 JSON：

```json
{"needsSetup":true}
```

然后：

1. 打开前端页面；
2. 使用 `AUTH_PASSWORD` 登录；
3. 创建一条笔记和一个标签；
4. 刷新页面并确认数据仍在 D1；
5. 在设置 → 数据库中确认 `driver` 为 `d1`。

## 8. 自定义域名、回滚与常见问题

在 Worker/Pages → Settings → Domains & Routes 中绑定自定义域名。回滚时：

1. 查看 Deployments/Workers 日志；
2. 确认失败版本是否已经执行了数据库 migration；
3. 回滚到上一版本；
4. 不要删除 D1 数据库，也不要通过破坏性 SQL 回滚已经发布的迁移。

常见问题：

- `D1 binding not available`：检查绑定名称是否严格为 `DB`，以及部署入口是否收到 D1 环境。
- `D1 database not found`：检查 `database_id`、数据库名和 Account ID。
- `ENCRYPTION_KEY is required`：在 Secret 中配置，不能只写在 `[vars]` 或提交到仓库。
- 根路径或 `/notes/list` 返回 `Not found`：先运行 `node scripts/build.js`，确认 `wrangler.toml` 的 `ASSETS` binding 指向 `./dist`，再重新部署。
- Wrangler 找不到迁移：确认 `migrations_dir = "server/db/migrations"` 已配置，并使用与当前 Wrangler 版本匹配的 migration 命令。
- `node:*` 模块兼容性错误：当前 resolver、迁移 runner 和 SQLite 适配器不会静态导入 Node builtins；确认部署使用包含该修复的 ref，并保持 Cloudflare 使用 D1。不要把 `DB_DRIVER=sqlite` 用于 Workers。
