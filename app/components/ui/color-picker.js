/* ============================================================
 * color-picker.js — 公共色彩工具 + 圆形拾色器(零依赖)
 * ------------------------------------------------------------
 * App.ui.color       色彩数学(纯函数,Node 可测):
 *                     parse / hex↔rgb↔hsl↔hsv / format 多格式
 * App.ui.colorPicker 类 shadcn 圆形拾色器(下拉/弹窗内嵌均可):
 *                     - 内置调色板(accent + zinc/amber/blue/... 18 色)
 *                     - SV 方 + Hue 条实时取色(指针拖动,实时预览)
 *                     - 实时显示当前鼠标位置的多种色值(hex/rgb/hsl/hsv)
 *                     - 按 C 复制当前色值,Shift 切换显示格式(默认十六进制)
 *                     - 十六进制输入框 + 清除
 * 样式随本文件注入(<style data-color-picker-style>),无需额外 CSS。
 * 依赖:App.ui.toast(复制反馈,缺省时静默)。
 * ============================================================ */
(function () {
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

  /** rgb(0-255) → hsl {h:0-360, s:0-100, l:0-100} */
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

  /** hsl → rgb(0-255) */
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

  /** rgb(0-255) → hsv {h:0-360, s:0-100, v:0-100} */
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

  /** hsv → rgb(0-255) */
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

  function iconSvg(name, cls) {
    try {
      return App.icon.iconSvg(name, { class: cls || 'size-3.5' });
    } catch (e) {
      return '';
    }
  }

  /** 统一转义（shared/escape.js，红线 13） */
  var escAttr = App.escape.escAttr;

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        /* 静默 */
      });
    }
  }

  /* ---------- 圆形拾色器 ---------- */
  var CPK_SEQ = 0;

  /** 生成拾色器 HTML(放入 [data-dropdown-menu] 或弹窗 body 均可) */
  function pickerHtml(current, opts) {
    opts = opts || {};
    CPK_SEQ++;
    var id = 'cpk-' + CPK_SEQ;
    var rgb = parseColor(current || '');
    if (!rgb) rgb = parseColor(resolveColor('accent'));
    var hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    var swatches = Object.keys(NAME_HEX).map(function (name) {
      var sel = String(current || '').trim() === name;
      return (
        '<button type="button" class="cpk-swatch' +
        (sel ? ' is-on' : '') +
        '" data-cpk-swatch="' +
        name +
        '" style="background:' +
        resolveColor(name) +
        '" data-tip="' +
        name +
        '" aria-label="' +
        name +
        '"></button>'
      );
    });
    return (
      '<div class="cpk" data-color-picker id="' +
      id +
      '">' +
      '<div class="cpk-preview">' +
      '<span class="cpk-dot" data-cpk-dot style="background:' +
      formatHex(rgb) +
      '"></span>' +
      '<input type="text" class="cpk-input" data-cpk-input value="' +
      escAttr(formatHex(rgb)) +
      '" spellcheck="false" />' +
      '<button type="button" class="cpk-icobtn" data-cpk-copy data-tip="复制 (C)">' +
      iconSvg('copy') +
      '</button>' +
      '</div>' +
      '<div class="cpk-presets">' +
      swatches.join('') +
      '</div>' +
      '<div class="cpk-pickers">' +
      '<div class="cpk-sv" data-cpk-sv style="background:' +
      hslToCss(hsv.h) +
      '"><span class="cpk-sv-thumb" data-cpk-svthumb style="left:' +
      hsv.s +
      '%;top:' +
      (100 - hsv.v) +
      '%"></span></div>' +
      '<div class="cpk-hue" data-cpk-hue><span class="cpk-hue-thumb" data-cpk-huethumb style="left:' +
      (hsv.h / 360) * 100 +
      '%"></span></div>' +
      '</div>' +
      '<div class="cpk-values">' +
      '<span class="cpk-value" data-cpk-value>' +
      escAttr(formatHex(rgb)) +
      '</span>' +
      '<span class="cpk-hint">C 复制 · Shift 切换格式</span>' +
      '</div>' +
      (opts.showClear === false
        ? ''
        : '<div class="cpk-foot">' +
          '<button type="button" class="cpk-btn cpk-btn-ghost" data-cpk-clear>' +
          escAttr(opts.clearLabel || '清除') +
          '</button>' +
          '<button type="button" class="cpk-btn cpk-btn-primary" data-cpk-apply>' +
          escAttr(opts.applyLabel || '应用') +
          '</button>' +
          '</div>')
    );
  }

  /** 由色相生成 SV 方底色(hsl → css) */
  function hslToCss(h) {
    return 'hsl(' + h + ', 100%, 50%)';
  }

  function pickerEl(el) {
    return el && el.closest ? el.closest('[data-color-picker]') : null;
  }

  /** 关闭所在 [data-dropdown](不依赖调用方模块) */
  function closeDropdown(el) {
    var root = el && el.closest ? el.closest('[data-dropdown]') : null;
    if (!root) return;
    var menu = root.querySelector('[data-dropdown-menu]');
    var trig = root.querySelector('[data-dropdown-trigger]');
    if (menu) menu.classList.remove('open');
    if (trig) trig.removeAttribute('aria-expanded');
  }

  function applyPick(scope, value, opts) {
    if (opts.onPick) opts.onPick(value);
    closeDropdown(scope);
  }

  /** 指针拖拽取色(SV 方 / Hue 条共用) */
  function startDrag(e, scope, opts, hsv) {
    var sv = scope.querySelector('[data-cpk-sv]');
    var hue = scope.querySelector('[data-cpk-hue]');
    var svThumb = scope.querySelector('[data-cpk-svthumb]');
    var hueThumb = scope.querySelector('[data-cpk-huethumb]');
    var dot = scope.querySelector('[data-cpk-dot]');
    var input = scope.querySelector('[data-cpk-input]');
    var valueEl = scope.querySelector('[data-cpk-value]');
    var mode = (scope._cpkMode = scope._cpkMode || 'hex');
    var dragging = e.target.closest('[data-cpk-sv]') ? 'sv' : 'hue';

    function applyPos(ev) {
      var rect = sv.getBoundingClientRect();
      var s = clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);
      var v = clamp(100 - ((ev.clientY - rect.top) / rect.height) * 100, 0, 100);
      if (dragging === 'hue') {
        var hrect = hue.getBoundingClientRect();
        hsv.h = clamp(((ev.clientX - hrect.left) / hrect.width) * 360, 0, 360);
      } else {
        hsv.s = s;
        hsv.v = v;
      }
      var rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      var hex = formatHex(rgb);
      sv.style.background = hslToCss(hsv.h);
      if (svThumb) svThumb.style.left = hsv.s + '%';
      if (svThumb) svThumb.style.top = 100 - hsv.v + '%';
      if (hueThumb) hueThumb.style.left = (hsv.h / 360) * 100 + '%';
      if (dot) dot.style.background = hex;
      if (input) input.value = hex;
      if (valueEl) valueEl.textContent = format(rgb, mode);
      if (opts.onLive) opts.onLive(hex, rgb, mode);
    }

    function onMove(ev) {
      applyPos(ev);
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      var rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
      if (opts.onLive) opts.onLive(formatHex(rgb), rgb, mode);
    }
    applyPos(e);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  /* ---------- 全局事件委托(作用域 [data-color-picker]) ---------- */
  function handleClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var scope = pickerEl(t);
    if (!scope) return;
    var opts = scope._cpkOpts || {};

    var swatch = t.closest('[data-cpk-swatch]');
    if (swatch) {
      var name = swatch.getAttribute('data-cpk-swatch');
      var rgb = parseColor(name);
      var hex = rgb ? formatHex(rgb) : '';
      var dot = scope.querySelector('[data-cpk-dot]');
      var input = scope.querySelector('[data-cpk-input]');
      var valueEl = scope.querySelector('[data-cpk-value]');
      var sv = scope.querySelector('[data-cpk-sv]');
      var svThumb = scope.querySelector('[data-cpk-svthumb]');
      var hueThumb = scope.querySelector('[data-cpk-huethumb]');
      scope.querySelectorAll('[data-cpk-swatch]').forEach(function (el) {
        el.classList.toggle('is-on', el === swatch);
      });
      if (dot) dot.style.background = name === 'accent' ? resolveColor('accent') : hex;
      if (input) input.value = hex;
      if (valueEl) valueEl.textContent = hex;
      if (sv && rgb) {
        var hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        sv.style.background = hslToCss(hsv.h);
        if (svThumb) {
          svThumb.style.left = hsv.s + '%';
          svThumb.style.top = 100 - hsv.v + '%';
        }
        if (hueThumb) hueThumb.style.left = (hsv.h / 360) * 100 + '%';
      }
      if (opts.onLive) opts.onLive(hex, rgb, 'hex');
      applyPick(scope, name, opts);
      return;
    }
    if (t.closest('[data-cpk-copy]')) {
      var mode = scope._cpkMode || 'hex';
      var cur = scope.querySelector('[data-cpk-input]').value;
      var curRgb = parseColor(cur);
      if (curRgb) {
        copyText(format(curRgb, mode));
        try {
          App.ui.toast((opts.copiedLabel || '已复制') + ': ' + format(curRgb, mode));
        } catch (e2) {
          /* 无 toast 静默 */
        }
      }
      return;
    }
    if (t.closest('[data-cpk-clear]')) {
      if (opts.onClear) opts.onClear();
      closeDropdown(scope);
      return;
    }
    if (t.closest('[data-cpk-apply]')) {
      var val = scope.querySelector('[data-cpk-input]').value;
      var vrgb = parseColor(val);
      if (vrgb) applyPick(scope, formatHex(vrgb), opts);
      else if (opts.onPick) applyPick(scope, val, opts);
      return;
    }
  }

  function handleKeydown(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var scope = pickerEl(t);
    if (!scope) return;
    var opts = scope._cpkOpts || {};
    if (e.key === 'Enter' && t.hasAttribute && t.hasAttribute('data-cpk-input')) {
      var val = t.value;
      var rgb = parseColor(val);
      if (rgb) {
        var dot = scope.querySelector('[data-cpk-dot]');
        if (dot) dot.style.background = formatHex(rgb);
        applyPick(scope, formatHex(rgb), opts);
      }
      return;
    }
    if (e.key === 'c' || e.key === 'C') {
      var cur = scope.querySelector('[data-cpk-input]').value;
      var curRgb = parseColor(cur);
      if (curRgb) {
        copyText(format(curRgb, scope._cpkMode || 'hex'));
        try {
          App.ui.toast(opts.copiedLabel || '已复制');
        } catch (e2) {
          /* 静默 */
        }
      }
      return;
    }
    if (e.key === 'Shift') {
      if (e.repeat) return;
      var modes = FORMAT_MODES;
      var idx = modes.indexOf(scope._cpkMode || 'hex');
      scope._cpkMode = modes[(idx + 1) % modes.length];
      var cur2 = scope.querySelector('[data-cpk-input]').value;
      var curRgb2 = parseColor(cur2);
      var valueEl = scope.querySelector('[data-cpk-value]');
      if (curRgb2 && valueEl) valueEl.textContent = format(curRgb2, scope._cpkMode);
    }
  }

  function handlePointerDown(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var scope = pickerEl(t);
    if (!scope) return;
    var opts = scope._cpkOpts || {};
    if (t.closest('[data-cpk-sv]') || t.closest('[data-cpk-hue]')) {
      e.preventDefault();
      var cur = scope.querySelector('[data-cpk-input]').value;
      var rgb = parseColor(cur) || parseColor(resolveColor('accent'));
      var hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      startDrag(e, scope, opts, hsv);
    }
  }

  function handleInput(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    if (!t.hasAttribute('data-cpk-input')) return;
    var scope = pickerEl(t);
    if (!scope) return;
    var opts = scope._cpkOpts || {};
    var rgb = parseColor(t.value);
    var dot = scope.querySelector('[data-cpk-dot]');
    var valueEl = scope.querySelector('[data-cpk-value]');
    if (rgb) {
      if (dot) dot.style.background = formatHex(rgb);
      if (valueEl) valueEl.textContent = format(rgb, scope._cpkMode || 'hex');
      if (opts.onLive) opts.onLive(formatHex(rgb), rgb, scope._cpkMode || 'hex');
    }
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('input', handleInput);
  }

  /** 打开拾色器弹窗(组件通用;value 可为调色板名或 hex) */
  function pickerDialog(value, opts) {
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'cpk-overlay';
    overlay.innerHTML =
      '<div class="cpk-dialog">' +
      '<div class="cpk-dialog-head">' +
      '<span class="cpk-dialog-title">' +
      escAttr(opts.title || '颜色') +
      '</span>' +
      '<button type="button" class="cpk-icobtn" data-cpk-dlg-close aria-label="' +
      escAttr(opts.cancelLabel || '关闭') +
      '">' +
      iconSvg('x') +
      '</button>' +
      '</div>' +
      '<div class="cpk-dialog-body">' +
      pickerHtml(value, opts) +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var scope = overlay.querySelector('[data-color-picker]');
    scope._cpkOpts = opts;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-cpk-dlg-close]')) overlay.remove();
    });
    return overlay;
  }

  function injectStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    var style = document.createElement('style');
    style.setAttribute('data-color-picker-style', '');
    style.textContent =
      '.cpk-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}' +
      '.cpk-dialog{width:min(21rem,calc(100vw-2rem));border-radius:0.75rem;background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px rgba(0,0,0,.18);padding:0.875rem}' +
      '.cpk-dialog-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.625rem}' +
      '.cpk-dialog-title{font-size:.8125rem;font-weight:600}' +
      '.cpk{display:flex;flex-direction:column;gap:.5rem;width:15rem;max-width:calc(100vw - 2rem)}' +
      '.cpk-preview{display:flex;align-items:center;gap:.375rem}' +
      '.cpk-dot{width:1.5rem;height:1.5rem;border-radius:9999px;flex-shrink:0;border:1px solid var(--border);box-shadow:inset 0 0 0 1px color-mix(in oklab, var(--nova-white) 25%, transparent)}' +
      '.cpk-input{flex:1;min-width:0;height:1.75rem;border-radius:.4375rem;border:1px solid var(--border);background:var(--background);color:inherit;padding:0 .5rem;font-size:.75rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;outline:none}' +
      '.cpk-input:focus{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent)}' +
      '.cpk-icobtn{display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;border-radius:.4375rem;border:0;background:transparent;color:var(--muted-foreground);cursor:pointer}' +
      '.cpk-icobtn:hover{background:var(--accent);color:inherit}' +
      '.cpk-presets{display:grid;grid-template-columns:repeat(10,1fr);gap:.3125rem}' +
      '.cpk-swatch{width:100%;aspect-ratio:1;border-radius:9999px;border:0;cursor:pointer;padding:0;outline:1px solid var(--border);outline-offset:1px;transition:transform .1s}' +
      '.cpk-swatch:hover{transform:scale(1.15);outline-color:var(--ring)}' +
      '.cpk-swatch.is-on{outline:2px solid var(--ring);outline-offset:1px}' +
      '.cpk-pickers{display:flex;flex-direction:column;gap:.5rem}' +
      '.cpk-sv{position:relative;height:8.5rem;border-radius:.5rem;cursor:crosshair;touch-action:none;background-image:linear-gradient(to top,var(--nova-black),transparent),linear-gradient(to right,var(--nova-white),transparent);background-blend-mode:multiply,screen}' +
      '.cpk-sv-thumb{position:absolute;width:.8125rem;height:.8125rem;border-radius:9999px;border:2px solid var(--nova-white);box-shadow:0 0 0 1px rgba(0,0,0,.45);transform:translate(-50%,-50%);pointer-events:none}' +
      '.cpk-hue{position:relative;height:.875rem;border-radius:9999px;cursor:ew-resize;touch-action:none;background:linear-gradient(to right,var(--nova-palette-red),var(--nova-palette-yellow),var(--nova-palette-green),var(--nova-palette-cyan),var(--nova-palette-blue),var(--nova-palette-fuchsia),var(--nova-palette-red))}' +
      '.cpk-hue-thumb{position:absolute;top:50%;width:.875rem;height:1.125rem;border-radius:9999px;border:2px solid var(--nova-white);box-shadow:0 0 0 1px rgba(0,0,0,.45);transform:translate(-50%,-50%);pointer-events:none}' +
      '.cpk-values{display:flex;align-items:center;justify-content:space-between;gap:.5rem}' +
      '.cpk-value{font-size:.6875rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--foreground)}' +
      '.cpk-hint{font-size:.625rem;color:var(--muted-foreground);white-space:nowrap}' +
      '.cpk-foot{display:flex;justify-content:flex-end;gap:.375rem}' +
      '.cpk-btn{height:1.75rem;padding:0 .75rem;border-radius:.4375rem;font-size:.75rem;font-weight:500;border:1px solid var(--border);background:var(--background);color:inherit;cursor:pointer}' +
      '.cpk-btn-primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}' +
      '.cpk-btn-ghost{border-color:transparent;color:var(--muted-foreground);background:transparent}' +
      '.cpk-btn:hover{opacity:.85}' +
      '.dark .cpk-dot,.dark .cpk-input{border-color:var(--border)}';
    document.head.appendChild(style);
  }
  injectStyles();

  window.App = window.App || {};
  App.ui = App.ui || {};
  App.ui.color = {
    clamp: clamp,
    parseHex: parseHex,
    parseColor: parseColor,
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    rgbToHsv: rgbToHsv,
    hsvToRgb: hsvToRgb,
    format: format,
    formatHex: formatHex,
    formatRgb: formatRgb,
    formatHsl: formatHsl,
    formatHsv: formatHsv,
    FORMAT_MODES: FORMAT_MODES,
    NAME_HEX: NAME_HEX,
    resolveColor: resolveColor,
    resolveHex: resolveHex,
  };
  App.ui.colorPicker = {
    pickerHtml: pickerHtml,
    pickerDialog: pickerDialog,
  };
})();
