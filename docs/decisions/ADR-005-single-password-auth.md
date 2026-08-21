# ADR-005: 鉴权用单密码 + 无状态派生令牌

- 状态：已采纳（2026-08 修订：实现方式与本决策存在偏差，见文末「修订」）
- 日期：2025-01

## 背景
项目面向个人/小团队自托管场景（非多用户账号体系），且需适配边缘无状态运行时。

## 决策
- 全局单密码鉴权（请求头 `X-Auth-Password`）；
- 存储侧：PBKDF2（随机盐 + 高迭代）哈希，存于 `app_settings` 键 `settings:auth:password_hash`
  （或环境变量 `AUTH_PASSWORD_HASH` 覆盖，优先级更高）；
- 签发侧：无状态派生令牌 `HMAC(password_hash_secret, expiresAt + nonce)`，
  令牌自携带过期时间戳，服务端校验只需验签 + 判过期，无需 session 存储；
- 会话时长：4/8/12/24 小时、7/14/30/90 天存 localStorage（带过期时间）；
  "直到下次浏览器打开"存 sessionStorage（无固定过期）。

## 理由
- 匹配个人自托管场景，无 session 存储开销；
- 天然适配 Cloudflare/Vercel 边缘无状态运行时。

## 后果
- 首页未鉴权时展示统一的密码设置/输入页（前端路由守卫）；
- 修改密码会更换哈希 → 旧令牌立即失效（需重新登录，属预期行为）。

## 修订（2026-08）
当前实现与本决策的派生令牌/PBKDF2 方案不同，以 `ARCHITECTURE.md` 4.2 节为准：

- 密码侧：登录密码来自环境变量 `AUTH_PASSWORD`，服务端做常量时间比较
  （`server/core/auth/password.js`），不落库、无 PBKDF2 哈希与"首次访问设码"流程；
- 令牌侧：服务端签发随机会话令牌，数据库 `auth_sessions.token_hash` 只存 SHA-256 哈希，
  客户端持明文令牌经 `x-auth-token` 请求头回传（有状态会话，非 HMAC 派生令牌）；
- 本决策中"无状态派生令牌"部分视为被否决的备选方案；`settings:auth:*` 前缀仍为保留键，
  为未来引入服务端密码哈希预留。