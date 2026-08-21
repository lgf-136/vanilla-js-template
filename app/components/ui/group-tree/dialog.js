/* ============================================================
 * dialog.js — 分组树·弹窗族（自 index.js 拆出）
 * ------------------------------------------------------------
 * 职责：openDialog/closeDialog 弹窗框架 + dialogFoot/bindDialogFoot
 *       底栏装配，以及新建 openCreateDialog / 重命名 openRenameDialog /
 *       移动 openMoveDialog / 设置图标 openIconDialog（图标库 + Emoji）/
 *       设置颜色 openColorDialog（内嵌公共圆形拾色器）/ 删除确认
 *       openDeleteDialog 全部弹窗；toast 反馈辅助。
 *       自研弹窗，禁用 window.prompt/confirm（红线 2）。
 * 依赖：model.js（nodeOf/descendants/treeChildren）；render.js
 *       （ic/iconHtml/allIcons/EMOJIS）；App.ui.colorPicker、
 *       App.ui.toast、App.escape（运行时全局）。
 * ============================================================ */
'use strict';

import { descendants, nodeOf, treeChildren } from './model.js';
import { EMOJIS, allIcons, ic, iconHtml } from './render.js';

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;
  var escAttr = App.escape.escAttr;

  function toast(inst, msg, error) {
    try {
      App.ui.toast(msg, error ? 'error' : 'default');
    } catch (e) {
      /* 静默 */
    }
  }

  /* ---------- 弹窗(自研,禁用 window.prompt/confirm) ---------- */
  function openDialog(opts) {
    closeDialog();
    var overlay = document.createElement('div');
    overlay.className = 'gt-overlay';
    overlay.innerHTML =
      '<div class="gt-dialog">' +
      '<div class="gt-dialog-head">' +
      '<span class="gt-dialog-title">' +
      opts.title +
      '</span>' +
      '<button type="button" class="gt-more" data-gt-dlg-close aria-label="' +
      escAttr(opts.closeLabel || '') +
      '">' +
      ic('x') +
      '</button>' +
      '</div>' +
      (opts.desc ? '<div class="gt-dialog-desc">' + opts.desc + '</div>' : '') +
      '<div class="gt-dialog-body">' +
      (opts.body || '') +
      '</div>' +
      '<div class="gt-dialog-foot">' +
      (opts.foot || '') +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-gt-dlg-close]')) closeDialog();
    });
    return overlay;
  }
  function closeDialog() {
    var list = document.querySelectorAll('.gt-overlay');
    list.forEach(function (ov) {
      ov.remove();
    });
  }
  function dialogFoot(inst, okLabel) {
    var L = inst.labels();
    return (
      '<button type="button" class="gt-btn gt-btn-ghost" data-gt-dlg-cancel>' +
      esc(L.cancel || '') +
      '</button>' +
      '<button type="button" class="gt-btn gt-btn-primary" data-gt-dlg-ok>' +
      esc(okLabel || L.save || '') +
      '</button>'
    );
  }
  function bindDialogFoot(overlay, onOk, validate) {
    overlay.querySelector('[data-gt-dlg-ok]').addEventListener('click', function () {
      var ok = validate ? validate() : true;
      if (ok === false) return; // 校验失败,保持弹窗
      closeDialog();
      onOk();
    });
    var cancel = overlay.querySelector('[data-gt-dlg-cancel]');
    if (cancel) cancel.addEventListener('click', closeDialog);
  }

  /** 目标父级选择列表(创建/移动共用;excludeId 禁选自身及子孙) */
  function parentOptionsHtml(inst, current, excludeId) {
    var nodes = inst.nodes();
    var L = inst.labels();
    var html =
      '<label class="gt-opt' +
      ((current || '') === '' ? ' is-on' : '') +
      '" data-gt-parent=""><span class="gt-opt-dot"></span>' +
      '<span class="gt-opt-name">' +
      esc(L.rootGroup || '') +
      '</span></label>';
    var forbid = excludeId ? descendants(nodes, excludeId) : [];
    function walk(parentId, depth) {
      treeChildren(nodes, parentId).forEach(function (n) {
        var disabled = forbid.indexOf(n.id) !== -1;
        html +=
          '<label class="gt-opt' +
          ((current || '') === n.id ? ' is-on' : '') +
          (disabled ? ' is-disabled' : '') +
          '" data-gt-parent="' +
          esc(n.id) +
          '" style="padding-left:' +
          (depth * 0.875 + 0.625) +
          'rem">' +
          '<span class="gt-opt-dot"></span>' +
          '<span class="gt-opt-name">' +
          (n.icon ? '<span class="gt-opt-ic">' + iconHtml(n) + '</span>' : '') +
          esc(n.name) +
          '</span></label>';
        walk(n.id, depth + 1);
      });
    }
    walk('', 0);
    return '<div class="gt-optlist">' + html + '</div>';
  }

  /** 新建分组(可选父分组,默认根);module 顶部 + 按钮复用 */
  function openCreateDialog(inst, defaultParentId) {
    var L = inst.labels();
    var picked = defaultParentId || '';
    var overlay = openDialog({
      closeLabel: L.close || '',
      title: esc(L.newGroup || ''),
      desc: '',
      body:
        '<div class="gt-field"><label>' +
        esc(L.name || '') +
        '</label>' +
        '<input type="text" class="gt-input" data-gt-name placeholder="' +
        esc(L.namePlaceholder || '') +
        '" /></div>' +
        '<div class="gt-field"><label>' +
        esc(L.parentGroup || '') +
        '</label>' +
        parentOptionsHtml(inst, picked, null) +
        '</div>',
      foot: dialogFoot(inst, L.save || ''),
    });
    overlay.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('[data-gt-parent]') : null;
      if (!opt) return;
      picked = opt.getAttribute('data-gt-parent') || '';
      overlay.querySelectorAll('[data-gt-parent]').forEach(function (el) {
        el.classList.toggle('is-on', el === opt);
      });
    });
    bindDialogFoot(
      overlay,
      function () {
        var name = overlay.querySelector('[data-gt-name]').value.trim();
        if (typeof inst.opts.onCreate === 'function') inst.opts.onCreate(picked, name);
      },
      function () {
        var name = overlay.querySelector('[data-gt-name]').value.trim();
        if (!name) {
          toast(inst, L.nameRequired || '', true);
          return false;
        }
        return true;
      }
    );
    var inp = overlay.querySelector('[data-gt-name]');
    setTimeout(function () {
      inp.focus();
    }, 30);
  }

  function openRenameDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var overlay = openDialog({
      closeLabel: L.close || '',
      title: esc(L.rename || ''),
      desc: '',
      body:
        '<div class="gt-field"><label>' +
        esc(L.name || '') +
        '</label><input type="text" class="gt-input" data-gt-name value="' +
        esc(node.name) +
        '" /></div>',
      foot: dialogFoot(inst, L.save || ''),
    });
    bindDialogFoot(
      overlay,
      function () {
        var name = overlay.querySelector('[data-gt-name]').value.trim();
        if (typeof inst.opts.onRename === 'function') inst.opts.onRename(id, name);
      },
      function () {
        var name = overlay.querySelector('[data-gt-name]').value.trim();
        if (!name) {
          toast(inst, L.nameRequired || '', true);
          return false;
        }
        return true;
      }
    );
    var inp = overlay.querySelector('[data-gt-name]');
    setTimeout(function () {
      inp.focus();
      inp.select();
    }, 30);
  }

  function openMoveDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var picked = node.parentId || '';
    var overlay = openDialog({
      closeLabel: L.close || '',
      title: esc(L.moveTo || ''),
      desc: '',
      body:
        '<div class="gt-field"><label>' +
        esc(L.chooseParent || '') +
        '</label>' +
        parentOptionsHtml(inst, picked, id) +
        '</div>',
      foot: dialogFoot(inst, L.save || ''),
    });
    overlay.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('[data-gt-parent]') : null;
      if (!opt || opt.classList.contains('is-disabled')) return;
      picked = opt.getAttribute('data-gt-parent') || '';
      overlay.querySelectorAll('[data-gt-parent]').forEach(function (el) {
        el.classList.toggle('is-on', el === opt);
      });
    });
    bindDialogFoot(overlay, function () {
      if (picked === (node.parentId || '')) return;
      if (typeof inst.opts.onMove === 'function') inst.opts.onMove(id, picked, 'inside');
    });
  }

  /** 图标选择弹窗:图标库 / Emoji 两个页签 */
  function openIconDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var overlay = openDialog({
      closeLabel: L.close || '',
      title: esc(L.icon || ''),
      desc: '',
      body:
        '<div class="gt-tabs">' +
        '<button type="button" class="gt-tab is-on" data-gt-ictab="icon">' +
        esc(L.icon || '') +
        '</button>' +
        '<button type="button" class="gt-tab" data-gt-ictab="emoji">' +
        esc(L.emoji || 'Emoji') +
        '</button>' +
        '</div>' +
        '<div class="gt-icpanel" data-gt-icpanel="icon">' +
        App.ui.searchInput.html({
          placeholder: L.iconSearch || '',
          attrs: 'data-gt-icsearch',
          class: 'is-compact gt-icsearch',
          clearLabel: L.clear || '',
        }) +
        '<div class="gt-icgrid" data-gt-icgrid></div>' +
        '</div>' +
        '<div class="gt-icpanel" data-gt-icpanel="emoji" style="display:none">' +
        '<div class="gt-icgrid" data-gt-emojigrid>' +
        EMOJIS.map(function (em) {
          return (
            '<button type="button" class="gt-icbtn is-emoji" data-gt-emojipick="' +
            esc(em) +
            '">' +
            em +
            '</button>'
          );
        }).join('') +
        '</div>' +
        '<div class="gt-emojirow">' +
        '<input type="text" class="gt-input" data-gt-emojiinput placeholder="' +
        esc(L.emojiInput || '') +
        '" />' +
        '<button type="button" class="gt-btn gt-btn-primary" data-gt-emojiok>' +
        esc(L.apply || '') +
        '</button>' +
        '</div>' +
        '</div>',
      foot:
        '<button type="button" class="gt-btn gt-btn-danger" data-gt-icclear>' +
        esc(L.clearIcon || '') +
        '</button>' +
        '<button type="button" class="gt-btn gt-btn-ghost" data-gt-dlg-cancel>' +
        esc(L.cancel || '') +
        '</button>',
    });
    var grid = overlay.querySelector('[data-gt-icgrid]');
    function renderGrid(q) {
      var names = allIcons().filter(function (n) {
        return !q || n.indexOf(q) !== -1;
      });
      grid.innerHTML = names
        .map(function (n) {
          return (
            '<button type="button" class="gt-icbtn" data-gt-icpick="' +
            esc(n) +
            '" data-tip="' +
            esc(n) +
            '">' +
            ic(n) +
            '</button>'
          );
        })
        .join('');
    }
    renderGrid('');
    overlay.addEventListener('click', function (e) {
      var tab = e.target.closest ? e.target.closest('[data-gt-ictab]') : null;
      if (tab) {
        var which = tab.getAttribute('data-gt-ictab');
        overlay.querySelectorAll('[data-gt-ictab]').forEach(function (el) {
          el.classList.toggle('is-on', el === tab);
        });
        overlay.querySelectorAll('[data-gt-icpanel]').forEach(function (el) {
          el.style.display = el.getAttribute('data-gt-icpanel') === which ? '' : 'none';
        });
        return;
      }
      var pick = e.target.closest ? e.target.closest('[data-gt-icpick]') : null;
      if (pick) {
        var name = pick.getAttribute('data-gt-icpick');
        closeDialog();
        if (typeof inst.opts.onIconChange === 'function') inst.opts.onIconChange(id, name);
        return;
      }
      var epick = e.target.closest ? e.target.closest('[data-gt-emojipick]') : null;
      if (epick) {
        closeDialog();
        if (typeof inst.opts.onIconChange === 'function')
          inst.opts.onIconChange(id, epick.getAttribute('data-gt-emojipick'));
        return;
      }
      if (e.target.closest('[data-gt-emojiok]')) {
        var v = overlay.querySelector('[data-gt-emojiinput]').value.trim();
        if (v) {
          closeDialog();
          if (typeof inst.opts.onIconChange === 'function') inst.opts.onIconChange(id, v);
        }
        return;
      }
      if (e.target.closest('[data-gt-icclear]')) {
        closeDialog();
        if (typeof inst.opts.onIconChange === 'function') inst.opts.onIconChange(id, '');
        return;
      }
    });
    overlay.addEventListener('input', function (e) {
      var t = e.target;
      if (t && t.hasAttribute && t.hasAttribute('data-gt-icsearch')) renderGrid(t.value.trim().toLowerCase());
    });
  }

  /** 颜色选择弹窗(内嵌公共圆形拾色器) */
  function openColorDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var overlay = openDialog({
      closeLabel: L.close || '',
      title: esc(L.color || ''),
      desc: '',
      body: '<div class="gt-colorwrap"></div>',
      foot:
        '<button type="button" class="gt-btn gt-btn-ghost" data-gt-dlg-cancel>' +
        esc(L.cancel || '') +
        '</button>',
    });
    var wrap = overlay.querySelector('.gt-colorwrap');
    wrap.innerHTML = App.ui.colorPicker.pickerHtml(node.color || '', {
      showClear: true,
      clearLabel: L.clearColor || '',
      applyLabel: L.apply || '',
      copiedLabel: L.copied || '',
      onPick: function (value) {
        if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(id, value);
        closeDialog();
      },
      onClear: function () {
        if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(id, '');
        closeDialog();
      },
    });
    var scope = wrap.querySelector('[data-color-picker]');
    if (scope) {
      scope._cpkOpts = {
        showClear: true,
        clearLabel: L.clearColor || '',
        applyLabel: L.apply || '',
        copiedLabel: L.copied || '',
        onPick: function (value) {
          if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(id, value);
          closeDialog();
        },
        onClear: function () {
          if (typeof inst.opts.onColorChange === 'function') inst.opts.onColorChange(id, '');
          closeDialog();
        },
      };
    }
  }

  function openDeleteDialog(inst, id) {
    var node = nodeOf(inst, id);
    if (!node) return;
    var L = inst.labels();
    var overlay = openDialog({
      closeLabel: L.close || '',
      title: esc(L.deleteConfirm || ''),
      desc: esc((L.deleteMsg || '').split('{name}').join(node.name)),
      body: '',
      foot:
        '<button type="button" class="gt-btn gt-btn-ghost" data-gt-dlg-cancel>' +
        esc(L.cancel || '') +
        '</button>' +
        '<button type="button" class="gt-btn gt-btn-danger" data-gt-dlg-ok>' +
        esc(L.delete || '') +
        '</button>',
    });
    bindDialogFoot(overlay, function () {
      if (typeof inst.opts.onDelete === 'function') inst.opts.onDelete(id);
    });
  }

export {
  closeDialog,
  openCreateDialog,
  openRenameDialog,
  openMoveDialog,
  openIconDialog,
  openColorDialog,
  openDeleteDialog,
};
