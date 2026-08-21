# Vercel 部署

本项目在 Vercel 的函数入口是 `api/server.js`，它转发到 `server/adapters/vercel.entry.js`，业务请求最终统一进入 `server/app.js` 的标准 `Request → Response` handler。`vercel.json` 已配置：

- 构建命令：`node scripts/build.js`；
- 静态输出目录：`dist`；
- `/api/*` → `/api/server`；
- 其它前端路径 → `/index.html`。

生产数据库按架构默认使用 Turso/libSQL HTTP 适配器，不需要安装 `@libsql/client`。

## 1. 部署前准备

需要：

- Vercel 账号和目标 Project；
- Turso 数据库；
- `DATABASE_URL`；
- `DATABASE_AUTH_TOKEN`；
- `ENCRYPTION_KEY`；
- `AUTH_PASSWORD`（登录密码，服务器模式必填）。

生产环境必须配置 `ENCRYPTION_KEY`。所有 Token、数据库凭证和加密主密钥都应通过 Vercel Environment Variables 保存，不要写入 `vercel.json`、源码或仓库中的 `.env` 文件。

## 2. Vercel Dashboard 导入 Git 仓库

1. 打开 Vercel Dashboard → **Add New…** → **Project**。
2. 导入本仓库并选择目标 Git 分支。
3. 构建设置使用：
   - Framework Preset：Other；
   - Build Command：`node scripts/build.js`；
   - Output Directory：`dist`；
   - Install Command：保持默认即可；项目没有第三方依赖。
4. 在 Project Settings → Environment Variables 中分别为 Production、Preview、Development 添加所需变量：

| 变量 | 生产环境 | 说明 |
|---|---:|---|
| `ENCRYPTION_KEY` | 必填 | AES-GCM 信封加密主密钥，必须是 Secret |
| `AUTH_PASSWORD` | 必填 | 登录密码；服务器模式必填，不落库 |
| `DB_DRIVER` | 建议 `turso` | 显式指定 Turso 驱动，避免平台自动选型差异 |
| `DATABASE_URL` | 必填 | Turso 数据库 URL |
| `DATABASE_AUTH_TOKEN` | 必填 | Turso 访问 Token |
5. 保存后执行第一次部署。

`vercel.json` 已负责 API 和 SPA rewrite，不要再创建第二套 `/api` 函数入口。若修改 rewrite，请同时验证 `/api/auth/status` 和 `/notes`。

## 3. Turso 数据库与迁移

先在 Turso 控制台创建数据库，取得 URL 和 Token。迁移文件位于 `server/db/migrations/`，当前仓库的迁移 runner 使用 Turso HTTP 适配器执行参数化 SQL。

建议在部署前从安全的本地环境显式执行一次迁移：

```bash
NODE_ENV=production \
DB_DRIVER=turso \
DATABASE_URL="$DATABASE_URL" \
DATABASE_AUTH_TOKEN="$DATABASE_AUTH_TOKEN" \
node scripts/db-migrate.js
```

如果本地 shell 不支持上述多行写法，可使用 PowerShell 或 CI Secret 等价设置环境变量后运行同一个脚本。迁移文件只增不改；不要在生产数据库上执行 `db:reset`。

应用启动时仍会执行幂等迁移检查，但预先执行迁移可以避免首次请求与数据库初始化竞争，也能更早发现凭证或 schema 问题。

## 4. CLI 部署

使用临时 CLI，不写入项目依赖：

```bash
npx vercel@latest login
npx vercel@latest link
node scripts/build.js
npx vercel@latest --prod
```

首次 `link` 时选择正确的 Team 和 Project。若使用 CI Token：

```bash
npx vercel@latest --prod --token "$VERCEL_TOKEN" --yes
```

不要把 Token 直接写进命令历史或提交到仓库；优先使用 Vercel Dashboard 或 CI Secret 注入。

## 5. GitHub Actions

仓库的 `.github/workflows/deploy-vercel.yml` 支持两种触发方式：

- 推送 `v*` tag，例如 `v1.0.0`；
- Actions 页面手动运行，并通过 `ref` 输入指定要部署的分支、tag 或 commit（默认 `main`）。

Workflow 会依次执行源码检查、静态资源构建、生成临时 Vercel 项目链接、拉取 Production 配置、构建 Vercel 输出并进行 `--prebuilt` 发布。临时生成的 `.vercel/project.json` 只存在于 CI 工作目录，不会提交到仓库。

仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 用途 |
|---|---|
| `VERCEL_TOKEN` | Vercel CLI 访问 Token |
| `VERCEL_ORG_ID` | Team/组织 ID，供 CI 生成项目链接 |
| `VERCEL_PROJECT_ID` | Project ID，供 CI 生成项目链接 |

Vercel 项目自己的运行时变量（Turso、`ENCRYPTION_KEY`、`AUTH_PASSWORD`）应在 Vercel Project Settings 中配置，而不是只配置在 GitHub Actions。部署 workflow 不会打印数据库凭证。

## 6. 验证

部署后先验证公开接口：

```bash
curl -i https://<your-project>.vercel.app/api/auth/status
```

预期 HTTP `200`，响应类似：

```json
{"needsSetup":true}
```

然后验证：

1. 根路径能加载 Nova 前端；
2. `/notes`、`/notes/list` 刷新后仍由 SPA fallback 提供页面；
3. 使用 `AUTH_PASSWORD` 登录；
4. 创建笔记后刷新页面，确认数据来自 Turso；
5. 设置 → 数据库中显示 `driver: "turso"`。

## 7. 自定义域名、环境与回滚

- Production、Preview、Development 的变量是分开的，至少要为 Production 配齐生产数据库和 `ENCRYPTION_KEY`；
- 绑定自定义域名：Project Settings → Domains；
- 回滚：Vercel Deployments → 选择上一份成功部署 → Promote to Production；
- 回滚代码不会自动回滚数据库 schema。迁移必须向后兼容，禁止删除生产表或修改已发布迁移。

## 8. 常见问题

- `DATABASE_URL / DATABASE_AUTH_TOKEN 未配置`：检查变量是否添加到了当前部署环境，并确认 `DB_DRIVER=turso`。
- `/api/*` 返回前端 HTML：检查 `vercel.json` 的 `/api/(.*)` rewrite 和 `api/server.js` 是否存在。
- 根路径正常、嵌套路由刷新 404：确认 SPA rewrite 仍为 `/((?!api/).*)` 到 `/index.html` 的配置。
- `ENCRYPTION_KEY is required in production`：在 Vercel Production 环境配置 Secret 后重新部署。
- 迁移未执行：从安全环境运行 `node scripts/db-migrate.js`，检查 Turso Token 权限和数据库 URL。
- `node:sqlite` 构建错误：确认 Vercel 使用 Node 22；生产选用 Turso 时不要删除运行时的 Node 兼容配置，静态导入仍需要构建器支持 Node 内置模块。
