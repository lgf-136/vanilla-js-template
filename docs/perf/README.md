# 性能与安全优化专题（docs/perf/）

> 按轮次归档安全与性能专项审计的修复记录（审计报告 → 修复方案 → 实测收益 → 防坑指南），
> 便于后续回溯与避免重复排查。审计结论与逐项修复详见各文档。

## 分类索引

| 文档 | 覆盖范围 |
|---|---|
| [security/security-optimization-20260822.md](./security/security-optimization-20260822.md) | 2026-08-22 全量安全审计的 8 项修复（限流伪造 / Docker 密钥 / CSP / 请求体限制 / 会话管理 / 错误脱敏 等） |
| [performance/performance-optimization-20260822.md](./performance/performance-optimization-20260822.md) | 2026-08-22 全量性能审计的 7 项修复（gzip / 请求热路径 DB / 远程批量写 / 预编译缓存 / rAF 合并 / 单 stat） |

## 归档约定

- 每份文档包含：问题清单与修复总表（问题 / 严重度 / 提交 / 收益）、逐项根因与修复细节（精确到方法/文件）、实测数据、门禁验证、遗留与建议；
- 修复提交按「每项独立 commit」组织，hash 可在文档与 `git log` 中互相检索；
- 关联的 bug 记录见 `docs/bug/`（如 CSP 构建哈希漂移 BUG-006）；
- 契约级变更（adapter 接口、缓存分层等）同步 `ARCHITECTURE.md`（AGENTS §12）。
