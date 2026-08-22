/* ============================================================
 * chat-events-input.js — chats 模块·事件域·输入类监听(副作用)
 * ------------------------------------------------------------
 * input(搜索/下拉搜索/API Key/滑块数值/输入框自动增高)、keydown
 * (Enter 发送 / Shift+Enter 换行 / Esc 关闭浮层)、paste(图片 →
 * dataURL,长文本 → pasted-<ts>.txt)、change(隐藏 file input)、
 * 自绘滑块拖动(mousedown/mousemove/mouseup)。
 * 本文件是副作用模块,必须被 chat-events.js 显式导入。
 * ============================================================ */
'use strict';

import { state } from './chat-store.js';
import { rerenderLeft } from './chat-view.js';
import { closePopover } from './chat-popover.js';
import { providerDropdownHtml, modelDropdownHtml } from './chat-composer.js';
import { addImageFiles, addFileFiles, addPastedText, setParam } from './chat-actions.js';
import { sendCurrent } from './chat-stream.js';

/* ============================================================
 * input 委托
 * ============================================================ */
document.addEventListener('input', function (e) {
  var t = e.target;
  if (!t || !t.getAttribute) return;
  var action = t.getAttribute('data-ch-act');
  if (action === 'search') {
    state.view.search = t.value;
    rerenderLeft();
    return;
  }
  if (action === 'provider-search' || action === 'model-search') {
    // 记录搜索词后重绘浮层内容
    if (action === 'provider-search') state.view.providerSearch = t.value;
    else state.view.modelSearch = t.value;
    var pop = t.closest('[data-ch-pop]');
    if (pop) {
      var actBtn = pop.getAttribute('data-ch-for');
      if (actBtn) {
        var btn = document.querySelector('[data-ch-act="' + actBtn + '"]');
        if (btn) {
          var html = action === 'provider-search' ? providerDropdownHtml() : modelDropdownHtml();
          pop.innerHTML = html;
          var inp = pop.querySelector('[data-ch-act="' + action + '"]');
          if (inp) {
            inp.focus();
            try {
              inp.setSelectionRange(inp.value.length, inp.value.length);
            } catch (err) {
              /* noop */
            }
          }
        }
      }
    }
    return;
  }
  if (action === 'api-key') {
    // 实时保存在 secret 里(防抖交给 persistConfig)
    var pid = t.getAttribute('data-id') || '';
    var v = String(t.value || '').trim();
    state.secrets.providerKeys = state.secrets.providerKeys || {};
    if (v) state.secrets.providerKeys[pid] = v;
    else delete state.secrets.providerKeys[pid];
    return;
  }
  if (action === 'maxtokens-input') {
    // 输入态不做换算,回车/应用时生效
    return;
  }
  if (action === 'slider-num') {
    var key = t.getAttribute('data-key') || '';
    var v = parseFloat(t.value);
    if (isFinite(v)) setParam(key, v);
    return;
  }
  if (action === 'prompt-input') {
    return;
  }
  // 输入框自动增高(最大 6 行)
  if (t.hasAttribute('data-ch-input')) {
    state.view.composer = t.value;
    autoGrow(t);
  }
});

/* ============================================================
 * keydown 委托(发送 / Esc 关闭浮层)
 * ============================================================ */
document.addEventListener('keydown', function (e) {
  var t = e.target;
  if (t && t.hasAttribute('data-ch-input')) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCurrent();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      // 允许默认换行
      return;
    }
  }
  if (e.key === 'Escape') {
    closePopover();
    App.ui.closeDialog();
    App.ui.contextMenu.close();
  }
});

/* ============================================================
 * paste 委托(图片 → dataURL;长文本 → pasted-<ts>.txt)
 * ============================================================ */
document.addEventListener('paste', function (e) {
  var t = e.target;
  if (!t || !t.hasAttribute || !t.hasAttribute('data-ch-input')) return;
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  var images = [];
  var text = '';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.type && item.type.indexOf('image/') === 0) {
      var file = item.getAsFile();
      if (file) images.push(file);
    } else if (item.type === 'text/plain') {
      item.getAsString(function (s) {
        text += s;
      });
    }
  }
  if (images.length) {
    e.preventDefault();
    addImageFiles(images);
    return;
  }
  // 纯文本超 4000 字符 → 自动生成 pasted-<ts>.txt
  if (text && text.length > 4000) {
    e.preventDefault();
    addPastedText(text);
  }
});

/* ============================================================
 * change 委托(隐藏 file input)
 * ============================================================ */
document.addEventListener('change', function (e) {
  var t = e.target;
  if (!t || !t.hasAttribute || !t.hasAttribute('data-ch-file')) return;
  var kind = t.getAttribute('data-ch-file');
  if (kind === 'image') addImageFiles(t.files);
  else if (kind === 'file') addFileFiles(t.files);
  t.value = '';
});

/* ============================================================
 * 滑块拖动(自绘 range)
 * ============================================================ */
var drag = null;
document.addEventListener('mousedown', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var slider = t.closest('[data-ch-slider]');
  if (!slider) return;
  e.preventDefault();
  drag = {
    el: slider,
    key: slider.getAttribute('data-ch-slider'),
    min: parseFloat(slider.getAttribute('data-min')) || 0,
    max: parseFloat(slider.getAttribute('data-max')) || 1,
    step: parseFloat(slider.getAttribute('data-step')) || 0.01,
  };
  updateSlider(drag, e.clientX);
});
document.addEventListener('mousemove', function (e) {
  if (drag) updateSlider(drag, e.clientX);
});
document.addEventListener('mouseup', function () {
  drag = null;
});
function updateSlider(d, clientX) {
  var rect = d.el.getBoundingClientRect();
  var ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
  var raw = d.min + ratio * (d.max - d.min);
  var stepped = Math.round(raw / d.step) * d.step;
  var value = Math.min(d.max, Math.max(d.min, Math.round(stepped * 10000) / 10000));
  var pct = ((value - d.min) / (d.max - d.min)) * 100;
  var fill = d.el.querySelector('.ch-slider-fill');
  var thumb = d.el.querySelector('.ch-slider-thumb');
  var num = d.el.parentNode && d.el.parentNode.querySelector('.ch-slider-num');
  if (fill) fill.style.width = pct + '%';
  if (thumb) thumb.style.left = pct + '%';
  if (num) num.value = String(Math.round(value * 100) / 100);
  setParam(d.key, value);
}

/* ---------- 输入框自动增高 ---------- */
function autoGrow(ta) {
  ta.style.height = 'auto';
  var max = 6 * 22; // 6 行
  var h = Math.min(ta.scrollHeight + 2, max);
  ta.style.height = h + 'px';
}
