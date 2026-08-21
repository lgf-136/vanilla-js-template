/**
 * shared/constants.js
 * 前后端共享常量（跨模块复用先"毕业"到这里，禁止模块之间互相 import）。
 */

/** 支持的语言（与 app/core/i18n/（dicts.js）、各模块 i18n.js 三语言对象一一对应） */
export const LANGUAGE_CODES = ['zh-CN', 'zh-TW', 'en'];

/**
 * 会话鉴权请求头（见 ARCHITECTURE.md 4.2 节）。
 * 注意:x-auth-password 只是 API Hub 的 global-password 兜底鉴权模式,
 * 会话门禁一律使用 x-auth-token。
 */
export const AUTH_HEADER = 'x-auth-token';

/**
 * 会话时长选项（见 ARCHITECTURE.md 4.3 节 8+1 布局）：
 * 第一行小时级 4/8/12/24h，第二行天级 7/14/30/90d，末行"直到下次浏览器打开"。
 * hours/days 省略或 untilBrowserClose 为 true 表示 sessionStorage 会话。
 */
export const SESSION_DURATIONS = [
  { id: '4h', hours: 4 },
  { id: '8h', hours: 8 },
  { id: '12h', hours: 12 },
  { id: '24h', hours: 24 },
  { id: '7d', days: 7 },
  { id: '14d', days: 14 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: 'session', untilBrowserClose: true },
];

/** 持久化会话的存储介质选择 */
export function durationIsSessionOnly(durationId) {
  const d = SESSION_DURATIONS.find((x) => x.id === durationId);
  return Boolean(d && d.untilBrowserClose);
}

/** SESSION_DURATIONS 里的小时/天时长（毫秒），untilBrowserClose 返回 null */
export function durationToMs(durationId) {
  const d = SESSION_DURATIONS.find((x) => x.id === durationId);
  if (!d || d.untilBrowserClose) return null;
  return (d.hours || 0) * 60 * 60 * 1000 + (d.days || 0) * 24 * 60 * 60 * 1000;
}

/**
 * app_settings 全局配置 key 清单（命名域 domain:subject[:field]，见 ARCHITECTURE.md 4.5 节）。
 * 全局配置一律走 app_settings，不为全局配置新建专用表。
 */
export const SETTING_KEYS = {
  /** 用户资料（敏感，AES-GCM 加密落库，见 4.6 节） */
  PROFILE: 'settings:profile',
  /** 主题（system/light/dark）与语言 */
  DISPLAY: 'settings:display',
  /** 保留键：预留给未来服务端管理密码哈希；当前实现使用 AUTH_PASSWORD 环境变量（见 ADR-005 修订） */
  PASSWORD_HASH: 'settings:auth:password_hash',
  /** 默认会话时长 */
  SESSION_DEFAULT: 'settings:auth:session_default',
  /** 迁移版本记录（迁移运行器写入） */
  MIGRATIONS_VERSION: 'settings:migrations:version',
  /** 第三方账号凭证（加密，示例 key，见 4.5 节） */
  ACCOUNTS_WEBDAV: 'accounts:webdav',
  ACCOUNTS_LLM_OPENAI: 'accounts:llm:openai',
};

/** 用户资料字段（敏感字段清单，见 ARCHITECTURE.md 4.6 节：邮箱/姓名/性别/年龄/地址/电话/用户名） */
export const PROFILE_FIELDS = ['username', 'name', 'gender', 'age', 'email', 'phone', 'address'];/** 数据库驱动名 */
export const DB_DRIVERS = ['sqlite', 'd1', 'turso'];
