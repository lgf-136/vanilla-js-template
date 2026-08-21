/* ============================================================
 * workspace.js — 工作空间交互(零依赖)
 * ------------------------------------------------------------
 * 工作空间状态(列表 + 当前 id)由 settings.js 统一管理、持久化到
 * localStorage 并随其它设置同步到数据库;本模块只负责交互:
 *   - 侧边栏切换工作空间
 *   - 新增 / 编辑 / 删除工作空间(悬停显示编辑、删除按钮)
 * 弹窗与悬停按钮样式内联注入(避免改动体积庞大的 vendored app.css)。
 * ============================================================ */
(function () {
  'use strict';

  /** 弹窗草稿状态(新增/编辑共用) */
  var draft = { mode: 'create', id: '', icon: 'house', color: 'zinc' };
  var dialogOpen = false;
  var deleteTarget = null;
  var stylesInjected = false;

  var WS_STYLE =
    // 侧边栏下拉:工作空间条目悬停显示操作按钮
    '.ws-menu-item{position:relative;display:flex;align-items:center}' +
    '.ws-menu-item .ws-menu-main{flex:1;min-width:0}' +
    '.ws-menu-actions{display:none;align-items:center;gap:2px;margin-left:auto;padding-right:.25rem}' +
    '.ws-menu-item:hover .ws-menu-actions{display:flex}' +
    '.ws-menu-actions button{display:inline-flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;padding:0;border:0;border-radius:.375rem;background:transparent;color:var(--muted-foreground);cursor:pointer}' +
    '.ws-menu-actions button:hover{background:var(--muted);color:var(--foreground)}' +
    '.ws-menu-actions button.ws-menu-delete:hover{background:var(--destructive);color:var(--primary-foreground)}' +
    '.ws-menu-actions svg{width:.875rem;height:.875rem}' +
    // 弹窗通用
    '.ws-dialog-mask{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:1rem}' +
    '.ws-dialog-overlay{position:absolute;inset:0;background:var(--overlay-bg)}' +
    '.ws-dialog-panel{position:relative;width:100%;max-width:28rem;max-height:calc(100vh - 2rem);overflow-y:auto;border:1px solid var(--border);border-radius:.75rem;background:var(--popover);color:var(--popover-foreground);padding:1.25rem;box-shadow:0 20px 50px -12px var(--shadow-color-dialog)}' +
    '.ws-field-label{display:block;margin-bottom:.5rem;font-size:.875rem;font-weight:500}' +
    '.ws-input{width:100%;height:2.5rem;box-sizing:border-box;border:1px solid var(--input);border-radius:var(--radius-md);background:var(--background);color:var(--foreground);padding:0 .75rem;font-size:.875rem;outline:none}' +
    '.ws-input:focus-visible{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent)}' +
    '.ws-input.ws-name-invalid{border-color:var(--destructive)}' +
    '.ws-input:disabled{opacity:.6;cursor:not-allowed}' +
    '.ws-textarea{width:100%;min-height:4.5rem;box-sizing:border-box;border:1px solid var(--input);border-radius:var(--radius-md);background:var(--background);color:var(--foreground);padding:.5rem .75rem;font-size:.875rem;font-family:inherit;outline:none;resize:vertical}' +
    '.ws-textarea:focus-visible{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent)}' +
    '.ws-hint{display:block;margin-top:.25rem;font-size:.75rem;color:var(--muted-foreground)}' +
    '.ws-error{display:none;margin-top:.25rem;font-size:.75rem;color:var(--destructive)}' +
    '.ws-error.is-visible{display:block}' +
    '.ws-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.5rem}' +
    '.ws-pick{display:flex;align-items:center;justify-content:center;height:2.5rem;border:1px solid var(--border);border-radius:.5rem;background:var(--background);color:var(--foreground);cursor:pointer;outline:none}' +
    '.ws-pick:hover{background:var(--muted)}' +
    '.ws-pick.is-active{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary);background:color-mix(in oklab, var(--primary) 8%, var(--background))}' +
    '.ws-dot{display:block;width:1.25rem;height:1.25rem;border-radius:9999px;box-shadow:0 0 0 1px var(--border)}';

  function t() {
    var locale = document.documentElement.lang || App.i18n.DEFAULT_LOCALE;
    return App.i18n.makeT(locale);
  }

  function injectStyles() {
    if (stylesInjected || !document.head) return;
    var style = document.createElement('style');
    style.setAttribute('data-ws-style', '');
    style.textContent = WS_STYLE;
    document.head.appendChild(style);
    stylesInjected = true;
  }

  function closeDropdowns() {
    document.querySelectorAll('[data-dropdown-menu]').forEach(function (m) {
      m.classList.remove('open');
    });
    document.querySelectorAll('[data-dropdown-trigger]').forEach(function (tr) {
      tr.removeAttribute('aria-expanded');
    });
  }

  function iconButtons() {
    return App.settings.WORKSPACE_ICONS.map(function (name) {
      var active = draft.icon === name;
      return (
        '<button type="button" data-ws-icon="' +
        name +
        '" aria-pressed="' +
        active +
        '" class="ws-pick' +
        (active ? ' is-active' : '') +
        '" data-tip="' +
        name +
        '">' +
        App.icon.iconSvg(name, { class: 'size-4' }) +
        '</button>'
      );
    }).join('');
  }

  function colorButtons() {
    return App.settings.WORKSPACE_COLORS.map(function (c) {
      var active = draft.color === c;
      return (
        '<button type="button" data-ws-color="' +
        c +
        '" aria-pressed="' +
        active +
        '" class="ws-pick' +
        (active ? ' is-active' : '') +
        '" data-tip="' +
        c +
        '">' +
        '<span class="ws-dot swatch-' +
        c +
        '"></span>' +
        '</button>'
      );
    }).join('');
  }

  /** 必填错误提示节点 */
  function errorNode(key) {
    return '<p data-ws-error="' + key + '" class="ws-error"></p>';
  }

  function renderDialog() {
    var tt = t();
    var isEdit = draft.mode === 'edit';
    return (
      '<div data-workspace-dialog class="ws-dialog-mask">' +
      '<div data-workspace-overlay class="ws-dialog-overlay"></div>' +
      '<div class="ws-dialog-panel">' +
      '<h2 class="font-heading text-lg font-semibold">' +
      tt(isEdit ? 'workspace.editTitle' : 'workspace.title') +
      '</h2>' +
      '<div class="mt-4 space-y-4">' +
      '<div>' +
      '<label class="ws-field-label" for="ws-zhcn">' +
      tt('workspace.zhCNLabel') +
      ' <span class="text-destructive">*</span></label>' +
      '<input id="ws-zhcn" data-ws-zhcn type="text" class="ws-input" maxlength="40" placeholder="' +
      tt('workspace.zhCNPlaceholder') +
      '" />' +
      errorNode('zhcn') +
      '</div>' +
      '<div>' +
      '<label class="ws-field-label" for="ws-en">' +
      tt('workspace.enLabel') +
      ' <span class="text-destructive">*</span></label>' +
      '<input id="ws-en" data-ws-en type="text" class="ws-input" maxlength="40" placeholder="' +
      tt('workspace.enPlaceholder') +
      '"' +
      (isEdit ? ' disabled' : '') +
      ' />' +
      '<span class="ws-hint">' +
      tt('workspace.enHint') +
      '</span>' +
      errorNode('en') +
      '</div>' +
      '<div>' +
      '<label class="ws-field-label" for="ws-zhtw">' +
      tt('workspace.zhTWLabel') +
      '</label>' +
      '<input id="ws-zhtw" data-ws-zhtw type="text" class="ws-input" maxlength="40" placeholder="' +
      tt('workspace.zhTWPlaceholder') +
      '" />' +
      '</div>' +
      '<div>' +
      '<label class="ws-field-label" for="ws-note">' +
      tt('workspace.noteLabel') +
      '</label>' +
      '<textarea id="ws-note" data-ws-note class="ws-textarea" maxlength="200" placeholder="' +
      tt('workspace.notePlaceholder') +
      '"></textarea>' +
      '</div>' +
      '<div>' +
      '<span class="ws-field-label">' +
      tt('workspace.iconLabel') +
      '</span>' +
      '<div class="ws-grid">' +
      iconButtons() +
      '</div>' +
      '</div>' +
      '<div>' +
      '<span class="ws-field-label">' +
      tt('workspace.colorLabel') +
      '</span>' +
      '<div class="ws-grid">' +
      colorButtons() +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="mt-6 flex justify-end gap-2">' +
      '<button type="button" data-ws-cancel data-slot="button" class="' +
      App.ui.buttonClass('outline') +
      '">' +
      tt('workspace.cancel') +
      '</button>' +
      '<button type="button" data-ws-submit data-slot="button" class="' +
      App.ui.buttonClass('default') +
      '">' +
      tt(isEdit ? 'workspace.save' : 'workspace.create') +
      '</button>' +
      '</div></div></div>'
    );
  }

  function renderDeleteDialog() {
    var tt = t();
    return (
      '<div data-workspace-delete-dialog class="ws-dialog-mask">' +
      '<div data-ws-delete-overlay class="ws-dialog-overlay"></div>' +
      '<div class="ws-dialog-panel">' +
      '<h2 class="font-heading text-lg font-semibold">' +
      tt('workspace.deleteTitle') +
      '</h2>' +
      '<p class="mt-3 text-sm text-muted-foreground">' +
      tt('workspace.deleteDesc') +
      '</p>' +
      '<div class="mt-6 flex justify-end gap-2">' +
      '<button type="button" data-ws-cancel-delete data-slot="button" class="' +
      App.ui.buttonClass('outline') +
      '">' +
      tt('workspace.cancel') +
      '</button>' +
      '<button type="button" data-ws-confirm-delete data-slot="button" class="' +
      App.ui.buttonClass('destructive') +
      '">' +
      tt('workspace.deleteConfirm') +
      '</button>' +
      '</div></div></div>'
    );
  }

  function mount(html) {
    var holder = document.createElement('div');
    holder.innerHTML = html;
    // render 返回弹窗根节点,可能有多个兄弟节点时全部挂载(防御性)
    while (holder.firstChild) document.body.appendChild(holder.firstChild);
  }

  function setValue(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.value = value == null ? '' : value;
  }

  function openDialog(mode, ws) {
    if (dialogOpen) return;
    ws = ws || {};
    draft = {
      mode: mode === 'edit' ? 'edit' : 'create',
      id: mode === 'edit' ? String(ws.id || '') : '',
      icon: WORKSPACE_ICON_SAFE(ws.icon),
      color: WORKSPACE_COLOR_SAFE(ws.color),
    };
    mount(renderDialog());
    dialogOpen = true;
    setValue(
      '[data-ws-zhcn]',
      mode === 'edit' ? (ws.names && ws.names['zh-CN']) || ws.name || '' : ''
    );
    setValue('[data-ws-en]', mode === 'edit' ? (ws.names && ws.names.en) || '' : '');
    setValue('[data-ws-zhtw]', mode === 'edit' ? (ws.names && ws.names['zh-TW']) || '' : '');
    setValue('[data-ws-note]', mode === 'edit' ? ws.note || '' : '');
    var first = document.querySelector('[data-ws-zhcn]');
    if (first) first.focus();
  }

  function openDeleteDialog(id) {
    if (dialogOpen) return;
    if (
      !App.getShellContext().settings.workspaces.some(function (w) {
        return w.id === id;
      })
    )
      return;
    deleteTarget = id;
    mount(renderDeleteDialog());
    dialogOpen = true;
  }

  function closeDialog() {
    if (!dialogOpen) return;
    var el = document.querySelector('[data-workspace-dialog]');
    if (el) el.remove();
    var del = document.querySelector('[data-workspace-delete-dialog]');
    if (del) del.remove();
    dialogOpen = false;
    deleteTarget = null;
  }

  function WORKSPACE_ICON_SAFE(name) {
    return App.settings.WORKSPACE_ICONS.indexOf(name) !== -1 ? name : 'house';
  }

  function WORKSPACE_COLOR_SAFE(color) {
    return App.settings.WORKSPACE_COLORS.indexOf(color) !== -1 ? color : 'zinc';
  }

  function selectIcon(name) {
    draft.icon = name;
    var dialog = document.querySelector('[data-workspace-dialog]');
    if (!dialog) return;
    dialog.querySelectorAll('[data-ws-icon]').forEach(function (b) {
      var on = b.getAttribute('data-ws-icon') === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function selectColor(color) {
    draft.color = color;
    var dialog = document.querySelector('[data-workspace-dialog]');
    if (!dialog) return;
    dialog.querySelectorAll('[data-ws-color]').forEach(function (b) {
      var on = b.getAttribute('data-ws-color') === color;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function fieldValue(selector) {
    var el = document.querySelector(selector);
    return el ? el.value.trim() : '';
  }

  function showError(key, message) {
    var el = document.querySelector('[data-ws-error="' + key + '"]');
    if (el) {
      el.textContent = message;
      el.classList.add('is-visible');
    }
    var input =
      key === 'zhcn'
        ? document.querySelector('[data-ws-zhcn]')
        : document.querySelector('[data-ws-en]');
    if (input) {
      input.classList.add('ws-name-invalid');
      input.focus();
    }
  }

  function clearError(key) {
    var el = document.querySelector('[data-ws-error="' + key + '"]');
    if (el) {
      el.textContent = '';
      el.classList.remove('is-visible');
    }
  }

  function submit() {
    var tt = t();
    var zhCN = fieldValue('[data-ws-zhcn]');
    var en = fieldValue('[data-ws-en]');
    var zhTW = fieldValue('[data-ws-zhtw]');
    var note = fieldValue('[data-ws-note]');
    if (!zhCN) {
      showError('zhcn', tt('workspace.requiredZhCN'));
      return;
    }
    if (!en || !App.settings.slugify(en)) {
      showError('en', tt('workspace.requiredEn'));
      return;
    }
    var ws = {
      id: draft.mode === 'edit' ? draft.id : '',
      name: zhCN,
      names: { 'zh-CN': zhCN, 'zh-TW': zhTW, en: en },
      icon: draft.icon,
      color: draft.color,
      note: note,
    };
    App.saveWorkspace(ws, draft.mode === 'edit');
    closeDialog();
  }

  function confirmDelete() {
    var id = deleteTarget;
    closeDialog();
    if (id) App.deleteWorkspace(id);
  }

  /** 切换当前工作空间(旧数据落库 → 写全局指针 → 加载新工作空间数据) */
  function switchTo(id) {
    App.switchWorkspace(id);
    closeDropdowns();
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target.closest) return;

    if (target.closest('[data-add-workspace]')) {
      closeDropdowns();
      openDialog('create');
      return;
    }
    var editBtn = target.closest('[data-ws-edit]');
    if (editBtn) {
      closeDropdowns();
      var list = App.getShellContext().settings.workspaces || [];
      var targetWs = list.find(function (w) {
        return w.id === editBtn.getAttribute('data-ws-edit');
      });
      if (targetWs) openDialog('edit', targetWs);
      return;
    }
    var deleteBtn = target.closest('[data-ws-delete]');
    if (deleteBtn) {
      closeDropdowns();
      openDeleteDialog(deleteBtn.getAttribute('data-ws-delete'));
      return;
    }
    var item = target.closest('[data-workspace]');
    if (item) {
      switchTo(item.getAttribute('data-workspace'));
      return;
    }
    var iconBtn = target.closest('[data-ws-icon]');
    if (iconBtn) {
      selectIcon(iconBtn.getAttribute('data-ws-icon'));
      return;
    }
    var colorBtn = target.closest('[data-ws-color]');
    if (colorBtn) {
      selectColor(colorBtn.getAttribute('data-ws-color'));
      return;
    }
    if (target.closest('[data-ws-submit]')) {
      submit();
      return;
    }
    if (target.closest('[data-ws-confirm-delete]')) {
      confirmDelete();
      return;
    }
    if (
      target.closest('[data-ws-cancel]') ||
      target.closest('[data-ws-cancel-delete]') ||
      target.closest('[data-workspace-overlay]') ||
      target.closest('[data-ws-delete-overlay]')
    ) {
      closeDialog();
      return;
    }
  });

  // 输入后清除非法态
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.hasAttribute) return;
    if (el.hasAttribute('data-ws-zhcn')) {
      el.classList.remove('ws-name-invalid');
      clearError('zhcn');
    }
    if (el.hasAttribute('data-ws-en')) {
      el.classList.remove('ws-name-invalid');
      clearError('en');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialogOpen) closeDialog();
  });

  injectStyles();

  window.App = window.App || {};
  App.workspace = { openDialog: openDialog, closeDialog: closeDialog, switchTo: switchTo };
})();
