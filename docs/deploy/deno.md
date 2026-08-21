# Deno Deploy 部署

本项目在 Deno Deploy 的入口是 `server/adapters/deno.entry.js`，使用 `Deno.serve` 接收请求：

- `/api/*` → `server/app.js` 的标准 Fetch handler；
- 其它路径 → 读取静态文件，找不到时回退到 `index.html`；
- 生产数据库使用 Turso/libSQL HTTP 适配器。

## 1. 部署前准备

需要：

- Deno Deploy 项目；
- Deno Deploy Token（CLI/CI 部署时使用）；
- Turso 数据库 URL 和 Token；
- `ENCRYPTION_KEY`；
- `AUTH_PASSWORD`（登录密码，服务器模式必填）。

运行时变量：

| 变量 | 是否必填 | 说明 |
|---|---:|---|
| `NODE_ENV` | 建议 `production` | 生产错误处理和密钥策略使用 |
| `DB_DRIVER` | 建议 `turso` | 明确使用 Turso 适配器 |
| `DATABASE_URL` | 是 | Turso 数据库 URL |
| `DATABASE_AUTH_TOKEN` | 是 | Turso 访问 Token |
| `ENCRYPTION_KEY` | 是 | AES-GCM 信封加密主密钥 |
| `AUTH_PASSWORD` | 是 | 登录密码；服务器模式必填，不落库 |

不要把这些值写入 `deno.entry.js`、仓库文件或部署命令中提交；在 Deno Deploy 项目设置中使用加密环境变量。

## 2. Deno Deploy Dashboard 导入仓库

推荐使用 Deno Deploy 的 Git 集成：

1. 创建或打开 Deno Deploy 项目；
2. 连接 GitHub 仓库与目标分支；
3. 将 entrypoint 设置为 `server/adapters/deno.entry.js`；
4. 确保部署上下文包含 `index.html`、`app/`、`public/`、`shared/`、`server/` 和模块 JSON 语言包；
5. 在项目 Settings → Environment Variables 添加上表中的变量；
6. 发布并查看构建日志。

静态文件不是 JavaScript import 的全部依赖，尤其是 `index.html`、CSS、favicon 和 JSON 语言包，必须确认它们被上传到部署文件系统。部署后先访问根路径和 `/app/locales/en.json` 验证静态文件，再验证 API。

## 3. CLI 部署

仓库的 `justfile` 使用临时 `deployctl`：

将 `DENO_DEPLOY_TOKEN` 放在本地安全环境或 CI Secret 中，然后执行：

```bash
npx deployctl@latest deploy \
  --project=vanilla-js-template \
  --token="$DENO_DEPLOY_TOKEN" \
  server/adapters/deno.entry.js
```

不同版本的 `deployctl` 对静态文件包含规则可能不同。执行部署前查看当前 CLI 帮助：

```bash
npx deployctl@latest deploy --help
```

确认 `index.html`、`app/`、`public/` 和语言包会随部署上传；如果当前 CLI 只上传入口及其代码依赖，应改用 Git 集成或按该版本的 include 选项显式包含这些目录。不要把秘密文件作为部署静态资源上传。

## 4. 数据库迁移

迁移文件位于 `server/db/migrations/`。建议先从安全的本地环境运行一次 Turso migration：

```bash
NODE_ENV=production \
DB_DRIVER=turso \
DATABASE_URL="$DATABASE_URL" \
DATABASE_AUTH_TOKEN="$DATABASE_AUTH_TOKEN" \
node scripts/db-migrate.js
```

Deno Deploy 运行时不能读取仓库本地迁移目录，因此必须在部署前从安全环境显式运行迁移；这样也能避免首次请求触发 schema 初始化。已发布迁移只增不改；禁止在生产环境运行 `node scripts/db-reset.js`。

## 5. GitHub Actions

仓库的 `.github/workflows/deploy-deno.yml` 支持两种触发方式：

- 推送 `v*` tag，例如 `v1.0.0`；
- Actions 页面手动运行，并通过 `ref` 输入指定要部署的分支、tag 或 commit（默认 `main`）。

Workflow 会执行源码检查、静态资源构建，然后调用 `deployctl` 发布 `server/adapters/deno.entry.js`。部署前仍需确认 deployctl 会把 `index.html`、`app/`、`public/` 和语言包纳入部署文件；不同 CLI 版本的静态文件包含规则可能不同。

仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 用途 |
|---|---|
| `DENO_DEPLOY_TOKEN` | Deno Deploy CLI Token |

Turso、`ENCRYPTION_KEY` 和 `AUTH_PASSWORD` 应配置在 Deno Deploy 项目环境中。Workflow 只使用 Deploy Token，不会把运行时数据库凭证写入仓库或日志。

## 6. 本地 Deno 兼容性检查

本地运行入口需要网络、读文件和环境变量权限：

```bash
deno run --allow-net --allow-read --allow-env server/adapters/deno.entry.js
```

当前 resolver、迁移 runner 和 SQLite 适配器不会静态导入 Node builtins；SQLite 的 Node 22 builtin 只会在显式选择 `DB_DRIVER=sqlite` 且运行于 Node 时通过 `process.getBuiltinModule()` 获取。Deno 默认使用 `DB_DRIVER=turso`，不要在 Deno 中切换到 SQLite；如果仍看到 `node:sqlite` 错误，请确认部署使用包含该修复的 ref。

## 7. 验证、域名与回滚

部署后：

```bash
curl -i https://<your-project>.deno.dev/api/auth/status
curl -i https://<your-project>.deno.dev/app/locales/en.json
```

预期：

- `/api/auth/status` 返回 `200` 和 `needsSetup` 布尔值；
- 语言包返回 `200 application/json`；
- 根路径返回 Nova 前端；
- 设置页面显示 `driver: "turso"`。

在 Deno Deploy 项目设置中绑定自定义域名。回滚使用 Deployments 中上一份成功版本；回滚代码不会回滚 Turso schema，数据库迁移必须保持向后兼容。

## 8. 常见问题

- `DENO_DEPLOY_TOKEN` 无权限：重新创建只授予目标项目的 Deploy Token，并确认项目名正确。
- 页面空白或静态文件 404：检查部署是否包含 `index.html`、`app/`、`public/` 和 JSON 语言包。
- `DATABASE_URL / DATABASE_AUTH_TOKEN 未配置`：Deno 项目环境变量未配置或变量作用域不是 Production。
- `ENCRYPTION_KEY is required`：在 Deno Deploy Secret/Environment Variables 中添加后重新部署。
- `node:sqlite` 不可用：这是当前静态 import 与 Deno runtime 的兼容性问题，需要先做代码级适配，不能靠 `DB_DRIVER=turso` 单独解决。
