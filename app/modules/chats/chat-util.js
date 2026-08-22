/* ============================================================
 * chat-util.js — chats 模块·工具域(转义/图标/时间/文件/maxTokens)
 * ------------------------------------------------------------
 * 纯工具函数,供 store/left/center/right/dialogs 共享:
 *   - esc / escAttr:shared/escape.js 收敛转发(红线 13)
 *   - icon:App.icon.iconSvg + lucide 数据未内置的内联 SVG(风格一致)
 *   - fmtRelative / fmtDateTime:相对时间与 yyyy-mm-dd hh:mm:ss
 *   - 文件附件:文本类扩展名判定 / 大小格式化 / dataURL 读取
 *   - parseMaxTokens / formatMaxTokens:组合框换算(k/M/小数)
 * 不依赖其它模块文件。
 * ============================================================ */
'use strict';

export var esc = App.escape.escHtml;
export var escAttr = App.escape.escAttr;

/** lucide 未内置图标的内联 SVG(沿用 lucide 24x24 风格,currentColor) */
var EXTRA_ICONS = {
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  stop: '<rect width="16" height="16" x="4" y="4" rx="2"/>',
  'panel-right': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  'panel-left-close': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 9-3 3 3 3"/>',
  server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  bookmarkCheck: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="m9 10 2 2 4-4"/>',
  sparkle: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  shieldCheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  squarePlus: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  'message-square-plus': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/>',
  thumbUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  thumbDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>',
  chevronsDownUp: '<path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  link2: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  boxes: '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/>',
  cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
};

/** 图标渲染:优先 App.icon.iconSvg,缺失时用内联 SVG 兜底 */
export function icon(name, cls) {
  var svg = App.icon.iconSvg(name, { class: cls || 'size-4' });
  if (svg) return svg;
  var inner = EXTRA_ICONS[name];
  if (!inner) return '';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
    (cls || '') +
    '">' +
    inner +
    '</svg>'
  );
}

/* ---------- 时间 ---------- */
/** 相对时间:刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期 */
export function fmtRelative(iso, t) {
  if (!iso) return '';
  var ts = Date.parse(iso);
  if (!ts) return '';
  var diff = Date.now() - ts;
  var min = 60 * 1000;
  var hour = 60 * min;
  var day = 24 * hour;
  if (diff < min) return t('chats.time.justNow');
  if (diff < hour) return t('chats.time.minutesAgo', Math.floor(diff / min));
  if (diff < day) return t('chats.time.hoursAgo', Math.floor(diff / hour));
  if (diff < 7 * day) return t('chats.time.daysAgo', Math.floor(diff / day));
  var d = new Date(ts);
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate())
  );
}

/** yyyy-mm-dd hh:mm:ss */
export function fmtDateTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  );
}
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/* ---------- 文件附件 ---------- */
/** 文本类扩展名(读取全文拼入消息) */
var TEXT_EXT = ['txt', 'md', 'json', 'js', 'ts', 'css', 'html', 'xml', 'csv', 'py', 'log'];
export function isTextFile(name) {
  var ext = String(name || '').split('.').pop().toLowerCase();
  return TEXT_EXT.indexOf(ext) !== -1;
}
export function isImageFile(name) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(String(name || ''));
}
/** 大小格式化(B/KB/MB) */
export function fmtSize(bytes) {
  var b = Number(bytes) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}
/** 读取图片为 dataURL(限制 ≤ 2MB,超出按最大边压缩) */
export function fileToImageDataURL(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      // 压缩超大图:最大边 1600px
      var img = new Image();
      img.onload = function () {
        var max = 1600;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale >= 1 && dataUrl.length < 2 * 1024 * 1024) {
          resolve(dataUrl);
          return;
        }
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () {
        resolve(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
/** 读取文本文件全文 */
export function fileToText(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      resolve(String(reader.result || ''));
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/* ---------- maxTokens 组合框换算 ---------- */
/** '1.5k' → 1536;'0.5M' → 524288;数字原样返回 */
export function parseMaxTokens(v) {
  if (typeof v === 'number') return Math.round(v);
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return 0;
  var m = /^(\d+(?:\.\d+)?)\s*([km]?)$/.exec(s);
  if (!m) return 0;
  var n = parseFloat(m[1]);
  if (m[2] === 'k') return Math.round(n * 1024);
  if (m[2] === 'm') return Math.round(n * 1024 * 1024);
  return Math.round(n);
}
/** 8192 → '8k';1536 → '1.5k';<1024 → 原数 */
export function formatMaxTokens(n) {
  var v = Number(n) || 0;
  if (v < 1024) return String(v);
  if (v < 1024 * 1024) {
    var k = v / 1024;
    return (Math.round(k * 10) / 10) + 'k';
  }
  var m = v / 1024 / 1024;
  return (Math.round(m * 100) / 100) + 'M';
}

/** 简单唯一 id */
export function uid(prefix) {
  return (
    (prefix || 'id') +
    '-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 8)
  );
}

/** 通用防抖 */
export function debounce(fn, ms) {
  var timer = null;
  return function () {
    var args = arguments;
    var self = this;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      fn.apply(self, args);
    }, ms);
  };
}
