/* ============================================================
 * color.js — 色彩数学与调色板（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 纯转换与解析：hex/rgb/hsl/hsv 互转、调色板名册、主题 token 取色。
 * 无 UI 依赖；App.ui.color 命名空间由 index.js 挂载（对外面不变）。
 * ============================================================ */
'use strict';

  /* ---------- 色彩数学(纯函数) ---------- */
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  /** 解析 #rgb / #rrggbb / #rrggbbaa → {r,g,b};失败返回 null */
  function parseHex(hex) {
    if (typeof hex !== 'string') return null;
    var s = hex.trim().replace(/^#/, '');
    var m;
    if (/^[0-9a-fA-F]{3}$/.test(s)) m = s;
    else if (/^[0-9a-fA-F]{6}$/.test(s)) m = s;
    else if (/^[0-9a-fA-F]{8}$/.test(s)) m = s.slice(0, 6);
    else return null;
    var full =
      m.length === 3
        ? m
            .split('')
            .map(function (c) {
              return c + c;
            })
            .join('')
        : m;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  /** rgb 0-255 转 hsl {h:0-360, s:0-100, l:0-100} */
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var h = 0;
    var s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      h *= 360;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  /** hsl 转 rgb 0-255 */
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r1 = 0;
    var g1 = 0;
    var b1 = 0;
    if (h < 60) {
      r1 = c;
      g1 = x;
    } else if (h < 120) {
      r1 = x;
      g1 = c;
    } else if (h < 180) {
      g1 = c;
      b1 = x;
    } else if (h < 240) {
      g1 = x;
      b1 = c;
    } else if (h < 300) {
      r1 = x;
      b1 = c;
    } else {
      r1 = c;
      b1 = x;
    }
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  }

  /** rgb 0-255 转 hsv {h:0-360, s:0-100, v:0-100} */
  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      h *= 360;
    }
    return { h: Math.round(h), s: Math.round(max === 0 ? 0 : (d / max) * 100), v: Math.round(max * 100) };
  }

  /** hsv 转 rgb 0-255 */
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    v = clamp(v, 0, 100) / 100;
    var c = v * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = v - c;
    var r1 = 0;
    var g1 = 0;
    var b1 = 0;
    if (h < 60) {
      r1 = c;
      g1 = x;
    } else if (h < 120) {
      r1 = x;
      g1 = c;
    } else if (h < 180) {
      g1 = c;
      b1 = x;
    } else if (h < 240) {
      g1 = x;
      b1 = c;
    } else if (h < 300) {
      r1 = x;
      b1 = c;
    } else {
      r1 = c;
      b1 = x;
    }
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  }

  /** 任意输入 → {r,g,b};支持 #hex / rgb() / 调色板名 / 空(返回 null) */
  function parseColor(v) {
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (!s) return null;
    var hex = parseHex(s);
    if (hex) return hex;
    var m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
    if (m) {
      return {
        r: clamp(parseInt(m[1], 10), 0, 255),
        g: clamp(parseInt(m[2], 10), 0, 255),
        b: clamp(parseInt(m[3], 10), 0, 255),
      };
    }
    var name = s.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAME_HEX, name)) return parseColor(resolveColor(name));
    return null;
  }

  function toHex(n) {
    var h = n.toString(16);
    return h.length === 1 ? '0' + h : h;
  }
  function formatHex(rgb) {
    return '#' + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
  }
  function formatRgb(rgb) {
    return 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')';
  }
  function formatHsl(rgb) {
    var h = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return 'hsl(' + h.h + ', ' + h.s + '%, ' + h.l + '%)';
  }
  function formatHsv(rgb) {
    var h = rgbToHsv(rgb.r, rgb.g, rgb.b);
    return 'hsv(' + h.h + ', ' + h.s + '%, ' + h.v + '%)';
  }
  function format(rgb, mode) {
    if (mode === 'rgb') return formatRgb(rgb);
    if (mode === 'hsl') return formatHsl(rgb);
    if (mode === 'hsv') return formatHsv(rgb);
    return formatHex(rgb);
  }
  var FORMAT_MODES = ['hex', 'rgb', 'hsl', 'hsv'];

  /** 内置调色板(用户指定 18 色 + 强调色) */
  var NAME_HEX = {
    accent: '--nova-palette-accent', // 占位,渲染/取色时解析为当前主题 --primary
    zinc: '--nova-palette-zinc',
    amber: '--nova-palette-amber',
    blue: '--nova-palette-blue',
    cyan: '--nova-palette-cyan',
    emerald: '--nova-palette-emerald',
    fuchsia: '--nova-palette-fuchsia',
    green: '--nova-palette-green',
    indigo: '--nova-palette-indigo',
    lime: '--nova-palette-lime',
    orange: '--nova-palette-orange',
    pink: '--nova-palette-pink',
    purple: '--nova-palette-purple',
    red: '--nova-palette-red',
    rose: '--nova-palette-rose',
    sky: '--nova-palette-sky',
    teal: '--nova-palette-teal',
    violet: '--nova-palette-violet',
    yellow: '--nova-palette-yellow',
  };

  /** 调色板名 → 实际可用的 CSS color(accent 跟随主题) */
  function cssTokenValue(token) {
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        var value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
        if (value) return value;
      }
    } catch (e) {
      /* 无 DOM 环境回退为 CSS token */
    }
    return 'var(' + token + ')';
  }

  function resolveColor(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (/^#|^rgba?\(/i.test(s)) return s;
    if (s === 'accent') {
      try {
        var pv = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
        if (pv) return pv;
      } catch (e) {
        /* 无 DOM 环境回退 */
      }
      return cssTokenValue(NAME_HEX.accent);
    }
    if (Object.prototype.hasOwnProperty.call(NAME_HEX, s)) return cssTokenValue(NAME_HEX[s]);
    return '';
  }

  /** 调色板名 → 主题色 hex(accent 读取 --primary,无则占位色) */
  function resolveHex(v) {
    var c = resolveColor(v);
    if (/^#/.test(c)) return c;
    if (/^rgba?\(/i.test(c)) {
      var rgb = parseColor(c);
      return rgb ? formatHex(rgb) : cssTokenValue(NAME_HEX.accent);
    }
    return cssTokenValue(NAME_HEX.accent);
  }

module.exports = {
  clamp,
  parseHex,
  parseColor,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,
  format,
  formatHex,
  formatRgb,
  formatHsl,
  formatHsv,
  FORMAT_MODES,
  NAME_HEX,
  resolveColor,
  resolveHex,
};
