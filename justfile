# Freebuff Nova — 开发命令面（与 ARCHITECTURE.md 第 7 节验证命令保持一致）
# 所有命令均为零依赖：直接调用 node，或经 npx 临时调用平台官方 CLI。
# 配方名一律用连字符：just 的配方名不支持冒号（`a:b:` 会被解析为「配方 a 依赖 b」导致语法错误）；
# package.json 的 npm scripts 不受此限制，保留冒号风格。

set shell := ["bash", "-uc"]

# 列出全部命令
default:
    just --list

# ---------- 开发 ----------

# 本地开发服务器（Node 适配器 + SQLite，原生 ESM 不打包）
dev:
    node scripts/dev-server.js

# ---------- 数据库 ----------

# 执行数据库迁移（幂等，记录版本于 app_settings）
db-migrate:
    node scripts/db-migrate.js

# 重建数据库（删除本地 SQLite 后重新迁移 + 种子）
db-reset:
    node scripts/db-reset.js

# 写入演示数据
db-seed:
    node scripts/db-seed.js

# ---------- 校验 ----------

# 代码规范：语法检查（node --check）+ 禁用模式扫描
lint:
    node scripts/lint.js

# 三语言文案 key 一致性校验
i18n-check:
    node scripts/i18n-check.js

# 单元测试（node --test，测试与源码同目录）
test:
    node --test

# 校验 package.json 无第三方依赖
deps-check:
    node scripts/deps-check.js

# 提交前全量门禁：依赖 + lint + 测试 + i18n + 体积预算（对应 AGENTS.md 第 9 节）
check: deps-check lint test i18n-check build-budget

# ---------- 构建 ----------

# 生产构建：指纹化 + 极简压缩（无打包器）
build:
    node scripts/build.js

# 体积预算校验（首屏 js ≤ 40KB / 单模块 ≤ 15KB / 关键 css ≤ 8KB，gzip）
build-budget:
    node scripts/bundle-budget-check.js

# ---------- 部署 ----------

# Cloudflare Pages/Workers（D1）
deploy-cloudflare:
    npx wrangler@3 deploy

# Vercel（Edge Functions + Turso）
deploy-vercel:
    npx vercel@latest --prod

# Deno Deploy（Turso）
deploy-deno:
    npx deployctl@latest deploy --project=vanilla-js-template server/adapters/deno.entry.mjs

# Docker / VPS（镜像默认本地 SQLite 持久卷，可用 DB_DRIVER=turso 切换）
deploy-docker:
    docker compose build
    docker compose up -d
