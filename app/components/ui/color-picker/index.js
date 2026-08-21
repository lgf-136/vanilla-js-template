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
 * ------------------------------------------------------------
 * 拆分设计（C5）：color.js 纯色彩数学（无 UI）；本文件为 UI 层——
 * pickerHtml 渲染 / 拖拽取色 / 键盘与全局事件委托 / pickerDialog 弹窗 /
 * 样式注入，并挂载 App.ui.color 与 App.ui.colorPicker 对外命名空间。
 * 对外面与拆分前完全一致（消费方零改动）。
 * ============================================================ */
'use strict';

import {
  FORMAT_MODES,
  NAME_HEX,
  clamp,
  format,
  formatHex,
  formatHsl,
  formatHsv,
  formatRgb,
  hslToRgb,
  hsvToRgb,
  parseColor,
  parseHex,
  resolveColor,
  resolveHex,
  rgbToHsl,
  rgbToHsv,
} from './color.js';

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
    var L = opts.labels || opts; // 文案统一经 labels 传入（红线 17），组件内不设默认文案
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
      '<button type="button" class="cpk-icobtn" data-cpk-copy data-tip="' +
      escAttr(L.copyTip || '') +
      '">' +
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
      '<span class="cpk-hint">' +
      escAttr(L.hint || '') +
      '</span>' +
      '</div>' +
      (opts.showClear === false
        ? ''
        : '<div class="cpk-foot">' +
          '<button type="button" class="cpk-btn cpk-btn-ghost" data-cpk-clear>' +
          escAttr(L.clearLabel || '') +
          '</button>' +
          '<button type="button" class="cpk-btn cpk-btn-primary" data-cpk-apply>' +
          escAttr(L.applyLabel || '') +
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
    var L = opts.labels || opts;

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
          App.ui.toast((L.copiedLabel || '') + ': ' + format(curRgb, mode));
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
    var L = opts.labels || opts;
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
          App.ui.toast(L.copiedLabel || '');
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
    var L = opts.labels || opts;
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
    var L = opts.labels || opts;
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
    var L = opts.labels || opts; // 文案统一经 labels 传入（红线 17）
    var overlay = document.createElement('div');
    overlay.className = 'cpk-overlay';
    overlay.innerHTML =
      '<div class="cpk-dialog">' +
      '<div class="cpk-dialog-head">' +
      '<span class="cpk-dialog-title">' +
      escAttr(L.title || '') +
      '</span>' +
      '<button type="button" class="cpk-icobtn" data-cpk-dlg-close aria-label="' +
      escAttr(L.cancelLabel || '') +
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
      '.cpk-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:var(--overlay-bg-soft)}' +
      '.cpk-dialog{width:min(21rem,calc(100vw-2rem));border-radius:0.75rem;background:var(--popover);color:var(--popover-foreground);box-shadow:0 10px 30px var(--shadow-color-popover);padding:0.875rem}' +
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
      '.cpk-sv-thumb{position:absolute;width:.8125rem;height:.8125rem;border-radius:9999px;border:2px solid var(--nova-white);box-shadow:0 0 0 1px var(--shadow-color-thumb);transform:translate(-50%,-50%);pointer-events:none}' +
      '.cpk-hue{position:relative;height:.875rem;border-radius:9999px;cursor:ew-resize;touch-action:none;background:linear-gradient(to right,var(--nova-palette-red),var(--nova-palette-yellow),var(--nova-palette-green),var(--nova-palette-cyan),var(--nova-palette-blue),var(--nova-palette-fuchsia),var(--nova-palette-red))}' +
      '.cpk-hue-thumb{position:absolute;top:50%;width:.875rem;height:1.125rem;border-radius:9999px;border:2px solid var(--nova-white);box-shadow:0 0 0 1px var(--shadow-color-thumb);transform:translate(-50%,-50%);pointer-events:none}' +
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

// 对外命名空间不变：App.ui.color（色彩数学）/ App.ui.colorPicker（拾色器 UI）
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
