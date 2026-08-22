# 性能优化专题文档（2026-08-22）

> 本文档记录 2026-08-22 全量性能审计后的逐项修复。审计方式：源码全量审查 + 运行时实测（请求模拟计数 DB 操作、gzip 压缩率实测、构建体积实测）。
>
> 修复分支：`perf/global-performance-optimization-202608222030`（已合并至 `ds4f-max`）。
> 审计基线：`just lint` ✅ / `node --test` 76/76 ✅ / build-budget 全部达标。
> 总体结论：架构层性能设计良好（懒加载、WAL、索引、ETag、TTL 缓存、分页），瓶颈集中在**自托管 Node 静态传输**与**远程 DB（Turso/D1）往返次数**。

---

## 一、问题清单与修复总表

| # | 问题 | 严重度 | 修复提交 | 实测收益 |
|---|---|---|---|---|
| H-1 | Node/Docker 静态资源无 HTTP 压缩 | 高 | `f73ad90` | tokens.css 381KB→39KB（-90%），全站 1.8MB→~500KB |
| H-2 | 每 API 请求 4~8 次 DB 操作（4 次纯浪费） | 高 | `8878231` | 代理热路径 DB 操作 **8→0 次/请求** |
| H-3 | 远程 DB N+1 写入（循环逐条 INSERT） | 高 | `2d0a286` | saveHistory 51 次往返→1 次、profile 保存 10~20 往返→1 次 |
| M-1 | SQLite 每次查询重新 prepare | 中 | `1a5ec05` | 热路径同一 SQL 只编译一次 |
| M-2 | data-table 交互全量重建（选择 O(n²)） | 中 | `a91f255` | 连点 N 行合并为每帧 1 次重建 |
| M-3 | 静态服务每次请求双 fs.stat | 中 | `72361d4` | 普通文件请求单次 stat |
| L-1~L-5 | 清理降频 / 登录批量 / 设置页重渲染等 | 低 | `1278f60` | 见第四节结项说明 |

> 前置相关提交：`5d3a437`（M6，loadAll 2s TTL 缓存）为本轮 H-2 缓存设计的基础。

---

## 二、逐项详细记录

### H-1. Node 静态服务补 gzip 压缩（首屏传输 -72%）

- **提交**：`f73ad90`（perf(static): Node 静态服务补 gzip 压缩,首屏传输 -72%）
- **涉及文件**：`server/core/http/static.js`、`server/core/http/static.test.js`（新增）

**实测基线**：

| 文件 | 原始 | gzip | 压缩率 |
|---|---|---|---|
| `dist/app/styles/tokens.css` | 380KB | 38KB | **-90%** |
| `dist/app/lib/chart.umd.js` | 204KB | 70KB | -66% |
| dist 全站 | 1.8MB | ~500KB | ~-72% |

**根因**：`static.js` 只返回 `Content-Type` + `Cache-Control` + ETag，不处理 `Accept-Encoding`，也不读预压缩文件。Vercel/CF/Deno 平台自带压缩，唯独**自托管 Node/Docker 形态缺失**；首屏关键 CSS（`tokens.css` 380KB）在慢网络下多传 340KB。

**修复**：
1. 命中 `Accept-Encoding: gzip` + 可压缩 MIME（`text/*` / `application/javascript` / `json` / `xml` / `svg`）+ 体积 ≥512B 时 `gzipSync` 返回，带 `Content-Encoding: gzip` 与 `Vary: Accept-Encoding`；
2. 压缩结果按 `path:size:mtime` 内存缓存（上限 64 项，dev 改文件自动失效），首次压缩后零 CPU；
3. 字体（woff2）/图片本身已压缩，跳过。

**验证**：`static.test.js` 5 例（判定矩阵 + gzip 往返一致性 + ETag/缓存策略）；端到端实测——CSS+gzip 200 / CE:gzip / 39822 字节解压还原 381283 字节；304 条件缓存、敏感路径 404、目录→index.html 均正确。

**防坑指南**：
- 压缩响应必须带 `Vary: Accept-Encoding`，否则中间缓存可能把 gzip 响应错发给不支持 gzip 的客户端；
- 弱 ETag（`W/`）不保证字节一致，与 gzip 混用是安全的（允许不同表示）；若用强 ETag 则须按编码区分；
- 内存缓存 key 必须含 size+mtime，否则 dev 改文件会返回过期压缩体。

---

### H-2. 请求热路径 DB 操作 8→0 次（日志异步批量 + 缓存复用）

- **提交**：`8878231`（perf(apihub): 请求热路径 DB 操作 8→0 次——日志异步批量 + 缓存复用）
- **涉及文件**：`server/modules/apihub/service.js`、`server/modules/apihub/hub-logs.js`（新增）、`server/modules/apihub/hub-logs.test.js`（新增）、`server/modules/apihub/hub-shared.js`

**实测基线（修复前，请求模拟 + 计数 db 桩）**：

| 请求类型 | DB 操作数 | 明细 |
|---|---|---|
| GET /api/settings（带会话） | 4 | 2× activeWorkspace + 1× config + 1× 会话 PK |
| 代理/未命中路由（网关主场景） | 8 | 迁移检查 + 2× activeWorkspace + config + 会话 + INSERT 日志 + DELETE 清理 + loadLogs SELECT |

**浪费点**：① 单请求内 `resolveWorkspace` 查同一行 2~3 次；② `appendLog` 返回的 `loadLogs()` 结果被 `api.js` 直接丢弃（纯浪费 2 次操作）；③ 每次写日志都跑全量清理 DELETE。远程 DB（Turso/D1）下每次 DB 操作 = 1 次 HTTP 往返 → 每个代理请求 6~8 次网络往返。

**修复**：
1. `appendLog` 不再返回 `loadLogs`（调用方无人消费）；
2. `loadAll` 的 2s TTL 缓存并入 `ws`（activeWorkspace），`appendLog` / `loadLogs` 直接复用，不再每请求重复查同一行；
3. **日志异步批量**（拆分至 `hub-logs.js` 写入器）：内存队列，满 20 条立即落库、否则最多滞留 500ms（`unref` 定时器）；清理 DELETE 降频为每 100 条一次；进程退出最多丢 500ms 日志（可接受）；
4. 红线 12：service.js 超 500 行，按职责拆出 `hub-logs.js`，`normalizeLogEntry` 上移 `hub-shared.js`（纯函数）。

**实测收益（修复后）**：冷启动 3 次 DB 操作；**热路径 0 次/请求**（日志仅入队）；批量落库摊销为每 20 条日志一批。

**验证**：`hub-logs.test.js` 4 例（满批批量落库 / 超阈值降频清理 / loadLogs 先刷盘 / 无效条目忽略）。

**防坑指南**：
- 异步批量日志要保证 `loadLogs` 读取前先 `flushLogs`，否则管理端读不到最新日志（已实现）；
- 队列必须原子 drain（`const batch = logQueue; logQueue = []`），避免并发 flush 双写；
- 定时器 `unref()`，否则会阻止 Node 进程退出。

---

### H-3. 远程 DB 批量写入（adapter batch + 调用方合并）

- **提交**：`2d0a286`（perf(db): 远程数据库批量写入——saveHistory/putSettings/login 一次往返）
- **涉及文件**：`server/db/adapters/sqlite.adapter.js`、`server/db/adapters/turso.adapter.js`、`server/db/adapters/d1.adapter.js`、`server/modules/apihub/service.js`、`server/modules/apihub/hub-logs.js`、`server/modules/settings/service.js`、`server/modules/auth/routes.js`（+ 4 个测试文件）

**根因**：Turso/D1 下每次 `db.run` = 1 次 HTTP 往返；而 `saveHistory`（DELETE + ≤50 INSERT 循环）、`putSettings`（N 个 key 循环）、login（3 次连续写）都是逐条写。实测最差：**保存 API Hub 历史最多 51 次往返**。turso 的 `pipeline()` 本支持单次 HTTP 传多条 stmt，却从未被使用。

**修复**：
1. 三适配器新增 `batch(statements)`：
   - sqlite：`BEGIN`/`COMMIT` 事务包裹，失败整体 `ROLLBACK`（实测验证）；
   - turso：复用 `pipeline()` 单次 HTTP 传多条 stmt（往返 1 次）；
   - d1 binding：原生 `binding.batch()`；d1 REST：顺序逐条（REST 不支持多语句参数绑定，语义一致）。
2. 调用方合并为单次 `db.batch`：`saveHistory`、`putSettings`、auth login（INSERT + 2 DELETE）、`hub-logs` flushLogs（N 条 INSERT，有 batch 时）、旧版 `settings:hub:*` 迁移循环。

**实测收益**：远程 DB 保存操作往返次数降为 1（51→1、10~20→1、3→1）；sqlite 批量写带事务原子性（新增收益）。

**验证**：sqlite 内存库实测——批量成功原子提交、失败整体回滚（`sqlite.adapter.test.js` 3 例）；auth/settings/apihub 测试桩补齐 batch 接口，`node --test` 88/88。

**防坑指南**：
- `batch` 是「全有或全无」语义（sqlite 事务 / turso pipeline 原子性由服务端保证）——调用方不得假设部分成功；
- D1 REST 不支持多语句参数绑定，REST 模式 batch 顺序逐条（与 binding 模式原子性不同，文档已注明）。

---

### M-1. SQLite 预编译语句缓存

- **提交**：`1a5ec05`（perf(db): SQLite 预编译语句缓存——热路径同一 SQL 只 prepare 一次）
- **涉及文件**：`server/db/adapters/sqlite.adapter.js`、`server/db/adapters/sqlite.adapter.test.js`（新增）

**根因**：`query/get/run/batch` 每次都 `db.prepare(sql)`，热路径（会话、activeWorkspace、config）高 QPS 下反复词法解析+编译；`node:sqlite` 不缓存 statement。

**修复**：adapter 内 `Map<sql, StatementSync>` 缓存（上限 128，满则清空；项目 SQL 集合有限，热路径命中率极高；prepare 是同步的，缓存安全）。

**验证**：`sqlite.adapter.test.js` monkeypatch `prepare` 计数——同一 INSERT 3 次 run 只编译 1 次；批量事务回滚；参数规范化。

---

### M-2. data-table 交互重绘 rAF 合并

- **提交**：`a91f255`（perf(data-table): 交互重绘 rAF 合并——连点 N 行不再 N 次全量重建）
- **涉及文件**：`app/components/ui/data-table/render.js`

**根因**：`rerender(inst)` 每次状态变更都 `root.innerHTML = render(...)` 全量重建（toolbar+thead+tbody+pagination+bulkBar）；勾选 N 行触发 N 次全量重建（O(n²)）。

**修复**：`rerender` 经 `requestAnimationFrame` 合并——同一帧内多次状态变更只重绘一次（`pendingRerenders` Set 去重）；无 rAF 环境回退同步。帧末渲染语义不变（最终 DOM 一致）。

**验证**：`node --check` + lint + 全量测试 + 挂载面 harness 4/4。

**设计取舍**：保留整表渲染而非 tbody 分区更新——toolbar 过滤计数依赖 `filteredRows`（含搜索），分区更新有计数/重置按钮漂移风险，不在本轮引入。

---

### M-3. 静态服务去掉双 fs.stat

- **提交**：`72361d4`（perf(static): 去掉双 fs.stat——普通文件请求只 stat 一次）
- **涉及文件**：`server/core/http/static.js`

**根因**：原实现每次请求 stat 两次（先判目录、再取真实文件 mtime/size）。

**修复**：单次 stat，仅目录命中时才二次 stat 取 index.html；逻辑抽为 `send404` / `serveFile`。

**验证**：端到端（真实 http server）——gzip 39822→解压 381283、304 条件缓存、敏感路径 404、根路径→index.html 全部正确。

---

## 三、L 系列结项说明（`1278f60`）

| 项 | 状态 | 说明 |
|---|---|---|
| L-1 清理 DELETE 降频 | ✅ 已覆盖 | H-2 的 `hub-logs.js` 每 100 条执行一次（`LOG_CLEANUP_EVERY`） |
| L-5 登录 3 次写合并 | ✅ 已覆盖 | H-3 的 login 单次 `db.batch` |
| L-2 设置页全量重渲染 | 有意保留 | `settings-bridge.js` 已做精准局部刷新（顶栏/侧边栏/图表/Sheet）；`rerenderContent` 仅 `/settings` 页且低频（change 事件，非 input），是双向同步一致性的设计使然 |
| L-3 会话验证 PK 查询 | 有意保留 | 加短 TTL 缓存会削弱登出即时性，不建议（见安全文档第四节） |
| L-4 chart.umd.js 204KB | 有意保留 | 已懒加载隔离（仅 dashboard）；裁剪 Chart.js 子集风险高收益有限 |

同步：`ARCHITECTURE.md` 4.2/4.3/4.5/4.7 已更新（`batch` 接口、hub-logs 写入器、gzip、loadAll TTL 含 ws）。

---

## 四、门禁验证（合并后复验）

- ✅ `deps-check` / `lint` / `i18n-check` / `build-budget`
- ✅ `node --test` **88/88**（基线 76 → 88，新增 static / hub-logs / sqlite-adapter 12 例）
- ✅ 端到端验证：gzip 39822→解压 381283、304 条件缓存、敏感路径 404；登录批量事务 → 会话 → settings/hub/state → 登出 → 401 全链路正确
- ✅ sqlite batch 事务回滚实测

## 五、遗留与建议

| 项 | 说明 |
|---|---|
| 代理热路径剩余开销 | 每请求仍有一次会话 PK 查询（鉴权必需）+ 日志批量落库摊销（每 20 条一批）；如需进一步降为零可引入会话短缓存，但不建议（登出即时性） |
| 静态 gzip CPU | 首次压缩后命中内存缓存，零 CPU；超大流量下可改 build 预生成 `.gz` 文件直读（零 CPU） |
| data-table 分区更新 | 若后续表格数据量显著增长（千行级），可考虑 tbody 局部更新 + 行级 dataset 定位（当前页大小 10 无必要） |
| Chart.js 裁剪 | dashboard 图表体积可再降，属可选优化 |
