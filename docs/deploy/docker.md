# Docker / VPS 部署

本项目的 Docker 入口是 `server/adapters/node.entry.js`，容器内同时提供：

- Node HTTP 静态资源服务；
- `/api/*` API；
- 启动时自动执行数据库迁移；
- Node 22 内置 SQLite 适配器。

当前 `Dockerfile` 的实际默认值是：

```text
NODE_ENV=production
PORT=8080
DB_DRIVER=sqlite
DB_PATH=/data/app.sqlite
```

因此 Docker 镜像默认使用 `/data/app.sqlite`，不是 Turso。若要使用 Turso，必须显式覆盖 `DB_DRIVER` 和 Turso 变量。

## 1. 部署前准备

需要：

- Docker Engine 24+ 或兼容的 Docker 主机；
- 一个持久化 Docker volume 或 VPS 磁盘目录；
- `ENCRYPTION_KEY`；
- 可选的 `AUTH_PASSWORD_HASH`。

生产安全要求：

- 不要把 `.env`、数据库文件或密钥复制进镜像；
- 密钥通过 `docker run -e`、外部 `--env-file` 或 VPS Secret 管理注入；
- `ENCRYPTION_KEY` 必须配置，否则生产环境敏感字段加密会失败；
- 不要将原始管理密码作为环境变量提交，使用页面首次设置或 PBKDF2 哈希。

## 2. 构建镜像

在仓库根目录执行：

```bash
docker build --pull -t vanilla-js-template:latest .
```

镜像不需要 `npm install`，因为 `package.json` 的 `dependencies` 和 `devDependencies` 都为空。生产构建前可以先在本地运行：

```bash
node scripts/lint.js
node scripts/i18n-check.js
node --test
node scripts/build.js
```

## 3. 使用持久化 SQLite 运行

创建数据卷并启动容器：

```bash
docker volume create vanilla-js-template-data

docker run -d \
  --name vanilla-js-template \
  --restart unless-stopped \
  -p 8080:8080 \
  -v vanilla-js-template-data:/data \
  -e NODE_ENV=production \
  -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  -e AUTH_PASSWORD_HASH="$AUTH_PASSWORD_HASH" \
  vanilla-js-template:latest
```

`DB_DRIVER=sqlite`、`DB_PATH=/data/app.sqlite` 和 `PORT=8080` 已由镜像设置，不需要重复传入。首次启动时容器会自动迁移数据库；重建容器时只要保留 `vanilla-js-template-data`，数据就不会丢失。

也可以绑定 VPS 目录：

```bash
mkdir -p /srv/vanilla-js-template/data
docker run -d \
  --name vanilla-js-template \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /srv/vanilla-js-template/data:/data \
  -e NODE_ENV=production \
  -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  vanilla-js-template:latest
```

## 4. 使用 Turso 运行

如果容器需要无状态部署或多副本，将数据库切换到 Turso：

```bash
docker run -d \
  --name vanilla-js-template \
  --restart unless-stopped \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e DB_DRIVER=turso \
  -e TURSO_DATABASE_URL="$TURSO_DATABASE_URL" \
  -e TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" \
  -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  -e AUTH_PASSWORD_HASH="$AUTH_PASSWORD_HASH" \
  vanilla-js-template:latest
```

使用 Turso 时仍建议从安全环境预先执行迁移：

```bash
NODE_ENV=production \
DB_DRIVER=turso \
TURSO_DATABASE_URL="$TURSO_DATABASE_URL" \
TURSO_AUTH_TOKEN="$TURSO_AUTH_TOKEN" \
node scripts/db-migrate.js
```

## 5. 验证与反向代理

容器启动后检查：

```bash
curl -i http://127.0.0.1:8080/api/auth/status
curl -i http://127.0.0.1:8080/
```

`/api/auth/status` 应返回 HTTP `200` 和 `needsSetup`，根路径应返回前端 HTML。项目当前没有 `/api/health` 路由，不要用它作为健康检查地址；如需编排系统健康检查，可使用 `/api/auth/status`。

对外提供服务时，建议在 Caddy/Nginx/云负载均衡器后使用 HTTPS，并将请求转发到容器的 `8080` 端口。不要把 SQLite 的 `/data` 目录直接暴露为静态文件。

## 6. 数据库迁移、备份与升级

迁移由容器启动时自动执行，也可以在运行中的容器中手动执行：

```bash
docker exec vanilla-js-template node scripts/db-migrate.js
```

SQLite 备份示例：

```bash
docker run --rm \
  -v vanilla-js-template-data:/data \
  -v "$PWD/backups:/backup" \
  alpine:latest \
  sh -c 'cp /data/app.sqlite /backup/app.sqlite.$(date +%Y%m%d%H%M%S)'
```

备份前先暂停写入或停止应用，避免复制到不一致的数据库状态。新增迁移只增不改，禁止在生产执行 `db:reset` 或删除数据卷。

升级流程：

1. 构建带版本标签的新镜像；
2. 停止旧容器但保留数据卷；
3. 使用新镜像启动同名容器；
4. 检查 API、前端和数据库迁移状态；
5. 出现问题时回到上一镜像标签，不删除数据卷。

## 7. GHCR 与 GitHub Actions

`.github/workflows/docker-publish.yml` 支持两种触发方式：

- 推送 `v*` tag，例如 `v1.0.0`；
- Actions 页面手动运行，并通过 `ref` 输入指定要发布的分支、tag 或 commit（默认 `main`）。

Workflow 会先执行源码检查，然后使用 GitHub Actions 内置的 `GITHUB_TOKEN` 登录 GHCR，再构建并推送镜像。它需要仓库级 `packages: write` 权限，不需要额外创建 GHCR 密码。镜像会生成 `latest`、tag（tag 触发时）和 commit SHA 标签。

拉取示例：

```bash
docker pull ghcr.io/<owner>/vanilla-js-template:v1.0.0
docker tag ghcr.io/<owner>/vanilla-js-template:v1.0.0 vanilla-js-template:current
```

运行时的 `ENCRYPTION_KEY`、Turso Token 和密码哈希不应写入镜像标签、Dockerfile、workflow 或 GHCR。

## 8. Docker Compose 说明与常见问题

当前仓库有 `just deploy-docker` 命令，但没有提交 `docker-compose.yml`。因此默认使用上面的 `docker build` + `docker run` 命令；不要直接执行 `just deploy-docker`，除非你已在本地安全地补充 Compose 编排文件。

常见问题：

- 容器启动后数据消失：没有挂载 `/data` volume；
- `ENCRYPTION_KEY is required`：生产环境未注入加密主密钥；
- 端口无法访问：确认映射为 `-p 8080:8080`，并检查 VPS 防火墙/反向代理；
- Turso 驱动报缺少变量：同时配置 `DB_DRIVER=turso`、`TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`；
- 静态资源 404：确认请求经过 Node 入口，且镜像内包含 `index.html`、`app/` 和 `public/`；
- 迁移失败：查看 `docker logs vanilla-js-template`，修复配置后重启，不要删除生产数据卷。
