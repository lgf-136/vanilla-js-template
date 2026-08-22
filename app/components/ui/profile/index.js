/* ============================================================
 * profile.js — 配置文件管理(零依赖,VSCode 风格)
 * ------------------------------------------------------------
 * 配置文件保存一组 外观/通知/显示 的设置组合,可新建 / 重命名 /
 * 删除 / 切换。状态(列表 + 当前 id)由 settings.js 统一管理并
 * 持久化到 localStorage,随其它设置同步到数据库 app_settings
 * (settings:profiles / settings:activeProfile,按工作空间隔离)。
 * 本模块只负责交互:头像下拉菜单「配置文件」入口 + 管理弹窗。
 * 弹窗与悬停按钮样式内联注入(避免改动体积庞大的 vendored app.css)。
 * ============================================================ */
(function () {
  'use strict';

  var dialogOpen = false;
  var deleteTarget = null;
  var stylesInjected = false;

  var PF_STYLE =
    // 弹窗通用
    '.pf-dialog-mask{position:fixed;inset: 0;z-index:60;display:flex;align-items:center;justify-content:center;padding: calc(var(--spacing) * 4)}' +
    '.pf-dialog-overlay{position:absolute;inset: 0;background:var(--overlay-bg)}' +
    '.pf-dialog-panel{position:relative;width: 100%;max-width: calc(var(--spacing) * 104);max-height: calc(100vh - var(--spacing) * 8);overflow-y:auto;border:1px solid var(--border);border-radius:calc(var(--radius) * 1.2);background:var(--popover);color:var(--popover-foreground);padding: calc(var(--spacing) * 5);box-shadow:0 20px 50px -12px var(--shadow-color-dialog)}' +
    '.pf-desc{display:block;margin-top: calc(var(--spacing) * 1);font-size:.8125rem;color:var(--muted-foreground)}' +
    '.pf-list{display:flex;flex-direction:column;gap: calc(var(--spacing) * 1.5);margin-top: calc(var(--spacing) * 4)}' +
    '.pf-row{position:relative;display:flex;align-items:center}' +
    '.pf-row-main{flex:1;min-width: 0;display:flex;align-items:center;gap: calc(var(--spacing) * 2.5);padding: calc(var(--spacing) * 2);border-radius:var(--radius-md);text-align:left}' +
    '.pf-row-main:hover{background:var(--accent)}' +
    '.pf-badge{display:flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 7);height: calc(var(--spacing) * 7);flex:none;border-radius:var(--radius-md);background:var(--muted);color:var(--muted-foreground)}' +
    '.pf-badge svg{width: calc(var(--spacing) * 4);height: calc(var(--spacing) * 4)}' +
    '.pf-row-main.is-active .pf-badge{background:color-mix(in oklab, var(--primary) 12%, var(--background));color:var(--primary)}' +
    '.pf-name{flex:1;min-width: 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.875rem;font-weight:500}' +
    '.pf-check{display:flex;align-items:center;flex:none;color:var(--primary)}' +
    '.pf-check svg{width: calc(var(--spacing) * 4);height: calc(var(--spacing) * 4)}' +
    '.pf-actions{display:none;align-items:center;gap: 2px;margin-left: auto;padding-right: calc(var(--spacing) * 1)}' +
    '.pf-row:hover .pf-actions{display:flex}' +
    '.pf-actions button{display:inline-flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 6);height: calc(var(--spacing) * 6);padding: 0;border:0;border-radius:calc(var(--radius) * 0.6);background:transparent;color:var(--muted-foreground);cursor:pointer}' +
    '.pf-actions button:hover{background:var(--muted);color:var(--foreground)}' +
    '.pf-actions button.pf-delete:hover{background:var(--destructive);color:var(--primary-foreground)}' +
    '.pf-actions svg{width: calc(var(--spacing) * 3.5);height: calc(var(--spacing) * 3.5)}' +
    '.pf-add{display:flex;align-items:center;gap: calc(var(--spacing) * 2);width: 100%;margin-top: calc(var(--spacing) * 3);padding: calc(var(--spacing) * 2);border:1px dashed var(--border);border-radius:var(--radius-md);background:transparent;color:var(--foreground);font-size:.875rem;cursor:pointer}' +
    '.pf-add:hover{background:var(--accent)}' +
    '.pf-add-icon{display:flex;align-items:center;justify-content:center;width: calc(var(--spacing) * 6);height: calc(var(--spacing) * 6);border-radius:calc(var(--radius) * 0.6);background:var(--muted);color:var(--muted-foreground)}' +
    '.pf-add-icon svg{width: calc(var(--spacing) * 3.5);height: calc(var(--spacing) * 3.5)}' +
    '.pf-field-label{display:block;margin-bottom: calc(var(--spacing) * 2);font-size:.875rem;font-weight:500}' +
    '.pf-input{width: 100%;height: calc(var(--spacing) * 10);box-sizing:border-box;border:1px solid var(--input);border-radius:var(--radius-md);background:var(--background);color:var(--foreground);padding: 0 calc(var(--spacing) * 3);font-size:.875rem;outline:none}' +
    '.pf-input:focus-visible{border-color:var(--ring);box-shadow:0 0 0 2px color-mix(in oklab, var(--ring) 40%, transparent)}' +
    '.pf-input.pf-invalid{border-color:var(--destructive)}' +
    '.pf-error{display:none;margin-top: calc(var(--spacing) * 1);font-size:.75rem;color:var(--destructive)}' +
    '.pf-error.is-visible{display:block}';

  function t() {
    var locale = document.documentElement.lang || App.i18n.DEFAULT_LOCALE;
    return App.i18n.makeT(locale);
  }

  function settings() {
    return App.getShellContext().settings;
  }

  function profiles() {
    var s = settings();
    return s.profiles && s.profiles.length ? s.profiles : App.settings.defaultProfiles();
  }

  /** 统一转义（shared/escape.js，红线 13） */
  var esc = App.escape.escHtml;

  function injectStyles() {
    if (stylesInjected || !document.head) return;
    var style = document.createElement('style');
    style.setAttribute('data-pf-style', '');
    style.textContent = PF_STYLE;
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

  /** 渲染配置文件列表弹窗(点击条目切换,悬停显示重命名/删除) */
  function renderListDialog() {
    var tt = t();
    var list = profiles();
    var activeId = settings().activeProfile;
    var rows = list
      .map(function (p) {
        var isActive = p.id === activeId;
        var canDelete = p.id !== App.settings.DEFAULT_PROFILES[0].id && list.length > 1;
        return (
          '<div class="pf-row">' +
          '<button type="button" data-profile="' +
          p.id +
          '" class="pf-row-main' +
          (isActive ? ' is-active' : '') +
          '">' +
          '<span class="pf-badge">' +
          App.icon.iconSvg('user-cog') +
          '</span>' +
          '<span class="pf-name">' +
          esc(App.settings.profileDisplayName(p, tt)) +
          '</span>' +
          (isActive
            ? '<span class="pf-check">' + App.icon.iconSvg('circle-check') + '</span>'
            : '') +
          '</button>' +
          '<span class="pf-actions">' +
          '<button type="button" data-pf-edit="' +
          p.id +
          '" data-tip="' +
          tt('profiles.rename') +
          '" aria-label="' +
          tt('profiles.rename') +
          '">' +
          App.icon.iconSvg('pencil') +
          '</button>' +
          (canDelete
            ? '<button type="button" data-pf-delete="' +
              p.id +
              '" class="pf-delete" data-tip="' +
              tt('profiles.delete') +
              '" aria-label="' +
              tt('profiles.delete') +
              '">' +
              App.icon.iconSvg('trash-2') +
              '</button>'
            : '') +
          '</span>' +
          '</div>'
        );
      })
      .join('');
    return (
      '<div data-profile-dialog class="pf-dialog-mask">' +
      '<div data-pf-overlay class="pf-dialog-overlay"></div>' +
      '<div class="pf-dialog-panel">' +
      '<h2 class="font-heading text-lg font-semibold">' +
      tt('profiles.title') +
      '</h2>' +
      '<span class="pf-desc">' +
      tt('profiles.desc') +
      '</span>' +
      '<div class="pf-list">' +
      rows +
      '</div>' +
      '<button type="button" data-add-profile class="pf-add">' +
      '<span class="pf-add-icon">' +
      App.icon.iconSvg('plus') +
      '</span>' +
      '<span>' +
      tt('profiles.create') +
      '</span>' +
      '</button>' +
      '</div></div>'
    );
  }

  /** 新建 / 重命名弹窗(共用) */
  function renderNameDialog(mode, currentName) {
    var tt = t();
    var isRename = mode === 'rename';
    return (
      '<div data-profile-name-dialog class="pf-dialog-mask">' +
      '<div data-pf-overlay class="pf-dialog-overlay"></div>' +
      '<div class="pf-dialog-panel">' +
      '<h2 class="font-heading text-lg font-semibold">' +
      tt(isRename ? 'profiles.rename' : 'profiles.create') +
      '</h2>' +
      '<div class="mt-4">' +
      '<label class="pf-field-label" for="pf-name">' +
      tt('profiles.nameLabel') +
      '</label>' +
      '<input id="pf-name" data-pf-name type="text" class="pf-input" maxlength="40" placeholder="' +
      tt('profiles.namePlaceholder') +
      '" value="' +
      esc(isRename ? currentName : '') +
      '" />' +
      '<p data-pf-error class="pf-error"></p>' +
      '</div>' +
      '<div class="mt-6 flex justify-end gap-2">' +
      '<button type="button" data-pf-cancel data-slot="button" class="' +
      App.ui.buttonClass('outline') +
      '">' +
      tt('profiles.cancel') +
      '</button>' +
      '<button type="button" data-pf-submit data-slot="button" class="' +
      App.ui.buttonClass('default') +
      '">' +
      tt(isRename ? 'profiles.save' : 'profiles.create') +
      '</button>' +
      '</div></div></div>'
    );
  }

  function renderDeleteDialog() {
    var tt = t();
    return (
      '<div data-profile-delete-dialog class="pf-dialog-mask">' +
      '<div data-pf-overlay class="pf-dialog-overlay"></div>' +
      '<div class="pf-dialog-panel">' +
      '<h2 class="font-heading text-lg font-semibold">' +
      tt('profiles.deleteTitle') +
      '</h2>' +
      '<p class="mt-3 text-sm text-muted-foreground">' +
      tt('profiles.deleteDesc') +
      '</p>' +
      '<div class="mt-6 flex justify-end gap-2">' +
      '<button type="button" data-pf-cancel-delete data-slot="button" class="' +
      App.ui.buttonClass('outline') +
      '">' +
      tt('profiles.cancel') +
      '</button>' +
      '<button type="button" data-pf-confirm-delete data-slot="button" class="' +
      App.ui.buttonClass('destructive') +
      '">' +
      tt('profiles.delete') +
      '</button>' +
      '</div></div></div>'
    );
  }

  function mount(html) {
    var holder = document.createElement('div');
    holder.innerHTML = html;
    while (holder.firstChild) document.body.appendChild(holder.firstChild);
  }

  /** 打开配置文件列表(头像下拉菜单「配置文件」入口) */
  function openDialog() {
    if (dialogOpen) return;
    mount(renderListDialog());
    dialogOpen = true;
  }

  function openNameDialog(mode, name) {
    if (dialogOpen) return;
    mount(renderNameDialog(mode, name));
    dialogOpen = true;
    var input = document.querySelector('[data-pf-name]');
    if (input) {
      input.focus();
      var len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }

  function openDeleteDialog(id) {
    if (dialogOpen) return;
    if (
      !profiles().some(function (p) {
        return p.id === id;
      })
    )
      return;
    deleteTarget = id;
    mount(renderDeleteDialog());
    dialogOpen = true;
  }

  function closeDialog() {
    if (!dialogOpen) return;
    var el = document.querySelector('[data-profile-dialog]');
    if (el) el.remove();
    var name = document.querySelector('[data-profile-name-dialog]');
    if (name) name.remove();
    var del = document.querySelector('[data-profile-delete-dialog]');
    if (del) del.remove();
    dialogOpen = false;
    deleteTarget = null;
  }

  function showError(message) {
    var el = document.querySelector('[data-pf-error]');
    if (el) {
      el.textContent = message;
      el.classList.add('is-visible');
    }
    var input = document.querySelector('[data-pf-name]');
    if (input) {
      input.classList.add('pf-invalid');
      input.focus();
    }
  }

  function submitName() {
    var tt = t();
    var input = document.querySelector('[data-pf-name]');
    var name = input ? input.value.trim() : '';
    if (!name) {
      showError(tt('profiles.requiredName'));
      return;
    }
    App.saveProfile(name, dialogMode === 'rename');
    closeDialog();
  }

  /** 当前弹窗模式:create / rename(提交时判断) */
  var dialogMode = 'create';

  function confirmDelete() {
    var id = deleteTarget;
    closeDialog();
    if (id) App.deleteProfile(id);
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target.closest) return;

    // 头像下拉菜单「配置文件」入口
    if (target.closest('[data-open-profiles]')) {
      closeDropdowns();
      openDialog();
      return;
    }
    // 切换配置文件
    var item = target.closest('[data-profile]');
    if (item) {
      var id = item.getAttribute('data-profile');
      if (id && id !== settings().activeProfile) App.switchProfile(id);
      closeDialog();
      return;
    }
    var editBtn = target.closest('[data-pf-edit]');
    if (editBtn) {
      var editId = editBtn.getAttribute('data-pf-edit');
      var targetProfile = profiles().find(function (p) {
        return p.id === editId;
      });
      if (targetProfile) {
        dialogMode = 'rename';
        var current = App.settings.profileDisplayName(targetProfile, t());
        closeDialog();
        openNameDialog('rename', current);
      }
      return;
    }
    var deleteBtn = target.closest('[data-pf-delete]');
    if (deleteBtn) {
      closeDialog();
      openDeleteDialog(deleteBtn.getAttribute('data-pf-delete'));
      return;
    }
    if (target.closest('[data-add-profile]')) {
      dialogMode = 'create';
      closeDialog();
      openNameDialog('create', '');
      return;
    }
    if (target.closest('[data-pf-submit]')) {
      submitName();
      return;
    }
    if (target.closest('[data-pf-confirm-delete]')) {
      confirmDelete();
      return;
    }
    if (
      target.closest('[data-pf-cancel]') ||
      target.closest('[data-pf-cancel-delete]') ||
      target.closest('[data-pf-overlay]')
    ) {
      closeDialog();
      return;
    }
  });

  // 输入后清除非法态
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.hasAttribute && el.hasAttribute('data-pf-name')) {
      el.classList.remove('pf-invalid');
      var err = document.querySelector('[data-pf-error]');
      if (err) {
        err.textContent = '';
        err.classList.remove('is-visible');
      }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialogOpen) closeDialog();
  });

  injectStyles();

  window.App = window.App || {};
  App.profile = { open: openDialog, close: closeDialog };
})();
