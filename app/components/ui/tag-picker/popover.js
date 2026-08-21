/* ============================================================
 * popover.js — 新建/重命名标签锚定 Popover（自 index.js 拆出，红线 12）
 * ------------------------------------------------------------
 * 职责（拆分设计总览见 index.js 头注）：
 *   - openTagDialog：Chrome 添加联系人风格的锚定 Popover（无全屏
 *     遮罩），承载新建/重命名表单；宿主模块经实例方法
 *     openCreateDialog(anchorEl) 与 events.js 的菜单动作进入
 *   - tagFormHtml：表单 HTML（名称输入 + 19 色板 + 自定义颜色入口，
 *     自定义色复用 App.ui.colorPicker 圆形拾色器）
 *   - positionTagPop：锚点下方右对齐定位、空间不足向上翻转
 *   - toast：错误提示安全封装（无 toast 环境静默）
 * tagPop 为本文件私有单例（全组件唯一一份）；Popover 外点关闭与
 * Esc 关闭（连带 menu.js 的右键浮层）的 document 监听在此注册。
 * 确定按钮经 model.js 的 validateName 校验后回调 onCreate/onRename。
 * ============================================================ */
'use strict';

import {
  PALETTE,
  esc,
  escAttr,
  escapeHtml,
  ic,
  parseColorSafe,
  resolveColor,
  validateName,
} from './model.js';
import { hideCtx } from './menu.js';

  /* ---------- 标签新建/重命名:锚定 Popover(Chrome 添加联系人风格,无全屏遮罩) ---------- */
  var tagPop = null;
  /** 标签表单 HTML(名称 + 色板 + 自定义颜色 + 底部按钮) */
  function tagFormHtml(inst, isNew, curName, curColor, picked) {
    var L = inst.labels();
    return (
      '<div class="tp-pop-head">' +
      '<span class="tp-dialog-title">' +
      esc(isNew ? L.newTag || '' : L.rename || '') +
      '</span>' +
      '<button type="button" class="tp-dlg-x" data-tp-dlg-close aria-label="">' +
      ic('x') +
      '</button>' +
      '</div>' +
      (isNew && (L.newTagDesc || '')
        ? '<div class="tp-dialog-desc">' + esc(L.newTagDesc) + '</div>'
        : '') +
      '<div class="tp-dialog-body">' +
      '<div class="tp-field"><label>' +
      esc(L.name || '') +
      '</label>' +
      '<input type="text" class="tp-input" data-tp-name placeholder="' +
      escAttr(L.tagNamePlaceholder || '') +
      '" value="' +
      escAttr(curName) +
      '" maxlength="40" autocomplete="off" /></div>' +
      '<div class="tp-field"><label>' +
      esc(L.color || '') +
      '</label>' +
      '<div class="tp-swatches" data-tp-swatches>' +
      PALETTE.map(function (name) {
        return (
          '<button type="button" class="tp-swatch tp-swatch-lg' +
          (picked === name ? ' is-on' : '') +
          '" data-tp-palette="' +
          name +
          '" data-tip="' +
          name +
          '" style="background:' +
          resolveColor(name) +
          '" aria-label=""></button>'
        );
      }).join('') +
      '<span class="tp-swatch-custom" data-tp-custom-color style="--sw:' +
      (picked && PALETTE.indexOf(picked) === -1 ? resolveColor(picked) : '') +
      '">' +
      ic('palette') +
      '</span>' +
      '</div>' +
      (picked && PALETTE.indexOf(picked) === -1
        ? '<div class="tp-field" data-tp-custom-row><label>' +
          esc(L.customColor || '') +
          '</label><input type="text" class="tp-input" data-tp-hex placeholder="&#35;ff0000" value="' +
          escAttr(picked) +
          '" spellcheck="false" /></div>'
        : '') +
      '</div>' +
      '<div class="tp-dialog-foot">' +
      '<button type="button" class="tp-btn" data-tp-dlg-close>' +
      esc(L.cancel || '') +
      '</button>' +
      '<button type="button" class="tp-btn tp-btn-primary" data-tp-dlg-ok>' +
      esc(L.save || '') +
      '</button>' +
      '</div>'
    );
  }
  /** 定位 Popover:锚点下方右对齐,空间不足向上翻转;无锚点居中 */
  function positionTagPop(pop, anchorEl) {
    var w = pop.offsetWidth || 320;
    var h = pop.offsetHeight || 220;
    var left, top;
    if (anchorEl && anchorEl.getBoundingClientRect) {
      var rect = anchorEl.getBoundingClientRect();
      left = rect.left;
      top = rect.bottom + 4;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 4);
    } else {
      left = Math.max(8, (window.innerWidth - w) / 2);
      top = Math.max(8, (window.innerHeight - h) / 2);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function closeTagPop() {
    if (tagPop && tagPop.parentNode) tagPop.parentNode.removeChild(tagPop);
    tagPop = null;
  }

  function openTagDialog(inst, tag, anchorEl) {
    var L = inst.labels();
    var isNew = !tag;
    var curName = tag ? tag.name : '';
    var curColor = tag ? tag.color || '' : '';
    var picked = curColor || '';
    closeTagPop();
    tagPop = document.createElement('div');
    tagPop.className = 'tp-pop';
    tagPop.setAttribute('data-tp-pop', '');
    tagPop.innerHTML = tagFormHtml(inst, isNew, curName, curColor, picked);
    document.body.appendChild(tagPop);
    positionTagPop(tagPop, anchorEl);
    // 自定义颜色按钮 → 圆形拾色器弹窗
    tagPop.querySelector('[data-tp-custom-color]').addEventListener('click', function () {
      App.ui.colorPicker.pickerDialog(
        picked,
        function (val) {
          picked = val || '';
          var row = tagPop.querySelector('[data-tp-custom-row]');
          if (!row) {
            var body = tagPop.querySelector('.tp-dialog-body');
            var div = document.createElement('div');
            div.className = 'tp-field';
            div.setAttribute('data-tp-custom-row', '');
            div.innerHTML =
              '<label>' +
              escapeHtml(L.customColor || '') +
              '</label><input type="text" class="tp-input" data-tp-hex value="' +
              escAttr(val || '') +
              '" spellcheck="false" />';
            body.appendChild(div);
          } else {
            var hex = row.querySelector('[data-tp-hex]');
            if (hex) hex.value = val || '';
          }
          var sw = tagPop.querySelector('[data-tp-custom-color]');
          if (sw) sw.style.setProperty('--sw', App.ui.color.resolveColor(val));
        },
        {
          title: L.color || '',
          cancelLabel: L.cancel || '',
          applyLabel: L.save || '',
          copiedLabel: L.copied || '',
          clearLabel: L.clear || '',
          copyTip: L.copyTip || '',
          hint: L.pickerHint || '',
          labels: L,
        }
      );
    });
    // 色板点击
    tagPop.addEventListener('click', function (e) {
      var sw = e.target.closest ? e.target.closest('[data-tp-palette]') : null;
      if (!sw) return;
      picked = sw.getAttribute('data-tp-palette');
      tagPop.querySelectorAll('[data-tp-palette]').forEach(function (el) {
        el.classList.toggle('is-on', el === sw);
      });
      var row = tagPop.querySelector('[data-tp-custom-row]');
      if (row) row.parentNode.removeChild(row);
    });
    // hex 输入
    tagPop.addEventListener('input', function (e) {
      var hex = e.target;
      if (!hex || !hex.hasAttribute || !hex.hasAttribute('data-tp-hex')) return;
      picked = hex.value.trim();
    });
    // 确定:校验 → 回调
    tagPop.querySelector('[data-tp-dlg-ok]').addEventListener('click', function () {
      var name = tagPop.querySelector('[data-tp-name]').value.trim();
      var err = validateName(inst, name, tag ? tag.id : '', L.nameRequired);
      if (err) {
        toast(inst, err, true);
        return;
      }
      var finalColor = picked;
      if (finalColor && PALETTE.indexOf(finalColor) === -1) {
        var parsed = parseColorSafe(finalColor);
        finalColor = parsed ? App.ui.color.formatHex(parsed) : '';
      }
      closeTagPop();
      if (isNew) {
        if (typeof inst.opts.onCreate === 'function') inst.opts.onCreate(name, finalColor);
      } else if (typeof inst.opts.onRename === 'function') {
        inst.opts.onRename(tag.id, name, finalColor);
      }
    });
    // 回车提交
    tagPop.querySelector('[data-tp-name]').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tagPop.querySelector('[data-tp-dlg-ok]').click();
    });
    var inp = tagPop.querySelector('[data-tp-name]');
    setTimeout(function () {
      inp.focus();
      if (isNew) inp.select();
      else {
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 30);
  }
  // 点击 Popover 外部关闭(触发打开的动作项除外,避免同一次点击关闭刚打开的弹层)
  document.addEventListener('click', function (e) {
    if (!tagPop) return;
    if (e.target && e.target.closest && e.target.closest('[data-tp-dlg-close]')) {
      closeTagPop();
      return;
    }
    if (e.target && e.target.closest && e.target.closest('[data-tp-pop], [data-tp-act], [data-tp-create]')) return;
    closeTagPop();
  });
  // Esc 关闭 Popover / 右键浮层
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeTagPop();
    hideCtx();
  });

  function toast(inst, msg, isError) {
    try {
      App.ui.toast(msg, isError ? 'error' : '');
    } catch (e) {
      /* 无 toast 环境静默 */
    }
  }

export { openTagDialog };
