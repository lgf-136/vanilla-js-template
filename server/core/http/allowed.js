/* ============================================================
 * allowed.js — 静态资源白名单(纯逻辑,Node / Deno 共用)
 * ------------------------------------------------------------
 * 静态服务器只应暴露前端公开资源(index.html / app / assets)。
 * 仓库根目录还包含 server/、.env*、sqlite.db、部署配置、文档等
 * 敏感或非站点文件,若不加白名单会随静态服务一并暴露
 * (例如 server/.secret-key 加密密钥、sqlite.db 数据库文件、.env)。
 * 本模块只做路径判断,不依赖 fs/path,可被 Node 与 Deno 共用。
 * ============================================================ */
'use strict';

const ALLOWED_PREFIXES = ['/index.html', '/app/', '/public/', '/shared/'];

/** 判定请求路径是否为可对外提供的公开静态资源 */
function isPublicAsset(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return false;
  if (pathname === '/') return true; // → index.html
  // 纵深防御:拒绝空字节与反斜杠,避免不同平台的路径语义差异
  if (pathname.indexOf('\0') !== -1 || pathname.indexOf('\\') !== -1) return false;
  // 拒绝 . / .. 片段:白名单前缀匹配前先阻断目录穿越(如 /app/../server/...),
  // 否则 path.resolve 归一化后会重新落入根目录内,绕过前缀限制。
  if (
    pathname.split('/').some(function (s) {
      return s === '.' || s === '..';
    })
  )
    return false;
  return ALLOWED_PREFIXES.some(function (p) {
    return pathname === p || pathname.indexOf(p) === 0;
  });
}

module.exports = { isPublicAsset };
