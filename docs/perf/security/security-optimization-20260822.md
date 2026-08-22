# 安全优化专题文档（2026-08-22）

> 本文档记录 2026-08-22 全量安全审计后的逐项修复。审计报告结论：**未发现可被直接利用的高危漏洞**（无 SQL 注入、无 XSS 突破点、无 SSRF、无路径穿越、无硬编码凭据入库），问题集中在 **serverless 部署形态与平台一致性**。
>
> 修复分支：`perf/global-security-optimization-202608222009`（已合并至 `ds4f-max`）。
> 审计基线：`just lint` ✅ / `node --test` 76/76 ✅ / `deps-check` ✅（零第三方依赖）。

---

## 一、问题清单与修复总表

| # | 问题 | 严重度 | 修复提交 | 核心收益 |
|---|---|---|---|---|
| M-1 | serverless 下伪造 `x-forwarded-for` 绕过登录限流 | 中 | `19b53f5` | 任意部署形态下限流键不可伪造 |
| M-2 | Dockerfile `COPY . .` 无 `.dockerignore`，敏感文件可能入镜像 | 中 | `223393f` | 密钥/数据库口令不再随镜像分发 |
| L-1 | Deno 静态资源响应缺统一安全头 | 低 | `4e87644` | 跨平台安全头一致（MIME 嗅探/点击劫持） |
| L-2 | CSP 依赖 `script-src 'unsafe-inline'` | 低 | `2d5181d` | 内联脚本改 sha256 哈希固定；顺带修复构建哈希漂移 bug |
| L-3 | `readBody` 超限后继续累积、`request.text()` 无界缓冲 | 低 | `93ff2f9` | 请求体内存占用有界（1MB 上限真正生效） |
| L-4 | README 弱口令示例 `AUTH_PASSWORD=admin123` | 低 | `c66f0b0` | 消除弱口令被照抄进生产配置的风险 |
| L-5 | 会话表无上限、过期会话仅惰性清理 | 低 | `d90c566` | 会话表有界（50 条上限 + 主动清理） |
| L-6 | 数据库适配器错误回显端点 URL 与远端响应体 | 低 | `0f32776` | 错误日志不再泄露库地址/SQL/查询数据 |
| — | 构建压缩破坏 CSP 哈希（顺带发现） | 高 | `2d5181d` | 生产构建后内联脚本不再被 CSP 拦截（见 docs/bug/ui-js.md BUG-006） |

---

## 二、逐项详细记录

### M-1. serverless 下伪造 x-forwarded-for 绕过登录限流

- **提交**：`19b53f5`（fix(security): 修复 serverless 下伪造 x-forwarded-for 绕过登录限流）
- **涉及文件**：`server/core/http/client-ip.js`（新增）、`server/app.js`、`server/adapters/node.entry.js`、`server/modules/auth/routes.js`、`server/modules/apihub/hub-shared.js`、`server/core/http/client-ip.test.js`（新增）

**根因**：所有适配器（含 Node 直连）都经 `makeNodeRequest` 把 Web Request 转成 Node 风格请求，而 `node.entry.js` 的 `toWebRequest` 会丢掉真实 `socket.remoteAddress`；`makeNodeRequest` 于是用客户端可控的 `x-forwarded-for` 原串填充 `socket.remoteAddress`。`clientIp` 优先取 `socket.remoteAddress`、回退取 xff **首值**——首值正是攻击者可任意写入的位置。实测：伪造 IP 池循环 100 次登录失败，`isBlocked()` 恒为 false；真实单 IP 第 8 次即被拦。**任意部署形态下限流键均可被伪造**。

**修复**：
1. `node.entry.js` 仅直连监听时把真实 TCP 对端 IP 挂到 `webReq.__realRemoteAddress`（Vercel 复用 `toWebRequest` 时不注入——其 socket 是内网代理 IP，不可作为客户端 IP）；
2. `makeNodeRequest` 不再用 xff 伪造 `socket.remoteAddress`；
3. 新增共享 `clientIp` 助手（`server/core/http/client-ip.js`），信任链按优先级：
   `Node 直连 socket.remoteAddress → cf-connecting-ip → x-forwarded-for 末位（平台追加的真实 IP）`；
   明确禁止取 xff 首值（客户端可控）。

**验证**：`client-ip.test.js` 7 例覆盖伪造场景（多值 xff、cf 头、socket 优先、占位值回退）；`node --test` 全绿。

**防坑指南**：
- 静态 nonce 无意义；信任代理链时永远取 `x-forwarded-for` **最后一个**值（平台追加的真实 IP），首值由客户端控制；
- Web Request 没有 socket——需要真实 IP 必须在转 Web Request 前捕获并显式传递（`__realRemoteAddress`）；
- Cloudflare 用 `cf-connecting-ip`，其余平台用 xff 末位。

---

### M-2. Dockerfile 无 .dockerignore，敏感文件可能打进镜像

- **提交**：`223393f`（fix(security): 新增 .dockerignore 防止敏感文件被 COPY . . 打进镜像）
- **涉及文件**：`.dockerignore`（新增）、`Dockerfile`（未改，`COPY . .` 保持）

**根因**：`docker build` 的构建上下文是**本地磁盘**而非 git。开发者本地存在环境变量文件（`AUTH_PASSWORD` / `ENCRYPTION_KEY` / `DATABASE_URL`）、自动生成的加密密钥文件、本地 SQLite 数据库时，会被 `COPY . .` 原样复制进镜像层；镜像消费者可间接取得上一手构建者的密钥与数据库口令。

**修复**：新增 `.dockerignore`，排除环境变量文件、密钥文件、本地数据库（`*.sqlite` / `*.db*`）、`node_modules/`、`dist/`、`.git/`、`.github/`、`docs/`、`scripts/`、`*.md` 等。静态资源白名单仅暴露 `/index.html` `/app/` `/public/` `/shared/`（`server/core/http/allowed.js`），排除项不影响运行时。

**验证**：静态白名单确认运行时不需要被排除的目录；`just lint` / 测试全绿。

**防坑指南**：`.dockerignore` 是唯一防线——即使文件被 `.gitignore` 排除，构建上下文来自本地磁盘；新增敏感文件类型时同步补 `.dockerignore`。

---

### L-1. Deno 静态资源响应缺统一安全头

- **提交**：`4e87644`（fix(security): Deno 静态资源响应补统一安全头,消除跨平台不一致）
- **涉及文件**：`server/adapters/deno.entry.mjs`

**根因**：Deno 入口的 `staticResponse` 只设置 `Content-Type` + `Cache-Control`，缺少 `X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY` / `Referrer-Policy: no-referrer`（Node 的 `static.js` 与 API 的 `sendJson` 均有）。

**修复**：合并 `server/core/http/headers.js` 已存在的 `SECURITY_HEADERS`，2 行改动。

**验证**：`node --check` + 全量测试。

---

### L-2. CSP 收紧 + 构建哈希漂移修复（BUG-006）

- **提交**：`2d5181d`（fix(security): CSP 收紧——内联脚本改用 sha256 哈希固定,移除 script-src unsafe-inline）
- **涉及文件**：`index.html`、`scripts/build.js`、`scripts/build.test.js`、`scripts/csp.test.js`（新增）
- **关联 bug 记录**：`docs/bug/ui-js.md` BUG-006

**根因与修复**：
1. `index.html` CSP `script-src 'self' 'unsafe-inline'` → `'self' 'sha256-<PREPAINT 脚本哈希>'`。静态 nonce 无意义（攻击者可读取），静态文件的正确做法是内容哈希；`style-src` 因组件动态注入 `<style>` 保留 `'unsafe-inline'`。一旦发生 XSS，注入的 `<script>`/内联事件处理器将被 CSP 拦截。
2. **顺带发现构建 bug**：`build.js` 用 `split(/\s+/).join(' ')` 压缩 HTML 时折叠了 `<script>` 内部空白，导致 dist 内联脚本哈希与 CSP 声明漂移、生产构建后首帧脚本被拦截（本地开发不经 build 无感，极具迷惑性）。修复为 `compressHtml()` 逐字节保留内联脚本内容。
3. 新增 `scripts/csp.test.js` 自一致性测试 + `build.test.js` dist 哈希回归断言。

**验证**：`node --test`（含 csp.test.js 3 例 + build.test dist 断言）；`node scripts/build.js` 后 dist 内联脚本哈希与 CSP 一致。

**防坑指南**：改 `index.html` 内联脚本必须同步更新 CSP `sha256-`；压缩 HTML 禁止折叠 `<script>` 内部空白；CSP 哈希必须实测 dist 产物。

---

### L-3. 请求体大小限制真正生效

- **提交**：`93ff2f9`（fix(security): 请求体大小限制真正生效——超限即停止消费并释放流）
- **涉及文件**：`server/app.js`、`server/core/http/json.js`、`server/core/http/json.test.js`（新增）

**根因**：`makeNodeRequest` 用 `request.text()` 把整个请求体读进内存，1MB 限制形同虚设（任何平台均可被超大 body 打满内存）；`readBody` 超限后 `data += c` 继续无界累积。

**修复**：
1. `app.js` 新增 `readCappedBody`：流式读取（`request.body.getReader()`），超过 1MB 即 `reader.cancel()` 停止消费并 reject，内存占用有界（兼容各平台原生 Request，不依赖 Buffer）；content-length 预检超限直接拒绝。
2. `readBody`：content-length 预检（超限不消费直接拒绝）、`settled` 标记停止累积、主动 `req.destroy()` 终止底层流。

**验证**：`json.test.js` 5 例（预检/累积超限停止消费/正常解析/非法 JSON）；`node --test` 全绿。

---

### L-4. README 弱口令示例替换

- **提交**：`c66f0b0`（docs(security): 替换 README 弱口令示例,明确强口令要求）
- **涉及文件**：`README.md`

**根因**：`AUTH_PASSWORD=admin123 npm run dev` 可能被照抄进生产配置，弱口令会被在线暴破轻易命中（即使服务端有登录限流也应在源头杜绝）。

**修复**：示例改为占位符 + 强口令建议（≥16 位混合字符）；补充 `AUTH_PASSWORD` 为唯一登录口令、禁止弱口令的说明。`env.example.template` 占位符为空，无需改动。

---

### L-5. 会话管理增强：表有界 + 过期主动清理

- **提交**：`d90c566`（fix(security): 会话管理增强——表有界 + 过期主动清理）
- **涉及文件**：`server/modules/auth/routes.js`、`server/modules/auth/routes.test.js`（新增）

**根因**：`auth_sessions` 每次登录插入一行，过期会话只在令牌被使用时惰性删除——表可无限增长。

**修复**：登录成功后顺带执行（SQL 全部参数化，三适配器位置绑定兼容）：
1. `DELETE FROM auth_sessions WHERE expires_at IS NOT NULL AND expires_at <= ?`（过期清理）；
2. `DELETE ... WHERE token_hash NOT IN (SELECT token_hash FROM auth_sessions ORDER BY created_at DESC LIMIT 50)`（上限裁剪，`MAX_SESSIONS = 50`）。

**验证**：`routes.test.js` 4 例（登录成功三条 SQL 按序、失败 401 无 SQL、同 IP 8 次失败限流 429、非法 expiry 400）。

**注**：本轮后由性能优化 `2d0a286` 将三条写合并为单次 `db.batch` 事务（见性能文档）。

---

### L-6. 数据库适配器错误信息脱敏

- **提交**：`0f32776`（fix(security): 数据库适配器错误信息脱敏——不再回显端点 URL 与远端响应体）
- **涉及文件**：`server/db/adapters/turso.adapter.js`、`server/db/adapters/d1.adapter.js`、`server/db/adapters/turso.adapter.test.js`（新增）

**根因**：适配器错误消息拼接了端点 URL（可能含库地址/凭据）与远端响应体前 300 字符（可能含 SQL 语句或查询数据）；`handleApi` 无顶层 catch，错误经平台入口进入 `log.error` 日志，是主要泄露面。

**修复**：连接失败错误不再拼接 endpoint 与底层 fetch 错误对象；HTTP 错误不回显响应体（消费剩余 body 释放连接），仅保留状态码；响应格式异常不回显 `JSON.stringify(body)`。d1 同理。

**验证**：`turso.adapter.test.js` 3 例——stub fetch 验证错误消息不含端点/响应体/敏感词。

**防坑指南**：日志是敏感信息泄露的主要出口——凡是进日志的错误对象，先问"这条消息里有没有 URL/响应体/凭据"；远端错误只保留状态码与通用提示。

---

## 三、门禁验证（合并后复验）

- ✅ `deps-check`（无第三方依赖）
- ✅ `lint`（语法/禁用模式/转义收敛/颜色/间距/模块边界/行数）
- ✅ `node --test`（本分支提交前 76/76；含 client-ip / json / auth routes / turso 脱敏 / CSP 测试）
- ✅ `i18n-check` / `build-budget` / `commit-msg`

## 四、遗留与建议

| 项 | 状态 | 说明 |
|---|---|---|
| 登录限流多实例共享 | 已知限制 | 内存级限流按进程/isolate 生效；serverless 多实例应叠加平台层限流（CF Rate Limiting / Vercel Edge），见 throttle.js 注释 |
| 会话验证每请求 1 次 PK 查询 | 有意保留 | 加短 TTL 缓存会削弱登出即时性，不建议 |
| CSP `style-src 'unsafe-inline'` | 有意保留 | 组件动态注入 `<style>` 需要；`default-src 'self'` 已阻断外链数据外传 |
| `auth` 路由内联 SQL | 历史实现 | AGENTS §6 约定新增路由遵循 routes 薄 + service 拆分，auth 属存量 |
