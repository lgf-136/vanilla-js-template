/* hub-dialogs.js — 弹窗（确认/鉴权/路由表单）与复制工具 */
import { renderFull } from './hub-view.js';
import { addCustomRoute, apiKeyOf, setDefaultAuth, setRouteApiKey, setRouteAuth, updateCustomRoute } from './hub-actions.js';
import { methodClass } from './hub-list.js';
import { authLabel, customById, esc, escAttr, findRoute, icon, memberships, state, t } from './hub-store.js';

'use strict';

  var dialogMethod = 'GET';
  /* ---------- 弹窗(公共 App.ui.dialog;禁用 window.prompt/confirm) ---------- */
  function openDialog(opts) {
    return App.ui.dialog({
      head:
        '<div class="ui-dialog-title">' +
        opts.title +
        '</div>' +
        (opts.desc ? '<div class="ui-dialog-desc">' + opts.desc + '</div>' : ''),
      body: opts.body,
      foot: opts.foot,
      closeLabel: t('apihub.cancel'),
    });
  }
  function closeDialog() {
    App.ui.closeDialog();
  }
  function confirmDialog(title, msg, okLabel, onOk, danger) {
    var overlay = openDialog({
      title: title,
      desc: msg,
      body: '',
      foot:
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('outline') + '" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" data-slot="button" class="' +
        App.ui.buttonClass(danger ? 'destructive' : 'default') +
        '" data-hub-dlg-ok>' +
        (okLabel || t('apihub.confirm')) +
        '</button>',
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      closeDialog();
      onOk();
    });
  }
  /** 鉴权设置弹窗(默认 / 单路由共用) */
  function authDialog(key) {
    var isDefault = key === '__default__';
    var r = isDefault ? null : findRoute(key);
    var cur = isDefault
      ? (state.config.defaults && state.config.defaults.auth) || 'session'
      : memberships(key, r).auth || (state.config.defaults && state.config.defaults.auth) || 'session';
    if (cur === 'none') cur = 'session'; // 公开是开关效果,弹窗展示底层鉴权方式
    var body =
      '<div class="hub-form">' +
      '<div class="hub-field"><label>' +
      t('apihub.auth') +
      '</label>' +
      '<div class="hub-auth-options">' +
      ['none', 'session', 'bearer', 'global-password', 'api-key']
        .map(function (m) {
          return (
            '<label class="hub-auth-opt' +
            (cur === m ? ' is-on' : '') +
            '" data-hub-authpick="' +
            m +
            '">' +
            '<span class="hub-radio-dot"></span>' +
            '<span class="hub-auth-opt-main">' +
            '<span class="hub-auth-opt-title">' +
            authLabel(m) +
            '</span>' +
            '</span>' +
            '</label>'
          );
        })
        .join('') +
      '</div></div>' +
      (isDefault
        ? ''
        : '<input type="password" class="' + App.ui.inputClass() + '" data-hub-apikey placeholder="' +
          t('apihub.apiKeyPlaceholder') +
          '" value="' +
          escAttr(apiKeyOf(key)) +
          '" style="display:none" />') +
      '</div>';
    var overlay = openDialog({
      title: isDefault ? t('apihub.authDefaults') : esc(r ? r.method + ' ' + r.path : key),
      desc: isDefault ? t('apihub.authDefaultsDesc') : '',
      body: body,
      foot:
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('outline') + '" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('default') + '" data-hub-dlg-ok>' +
        t('apihub.save') +
        '</button>',
    });
    var picked = cur;
    overlay.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('[data-hub-authpick]') : null;
      if (!opt) return;
      picked = opt.getAttribute('data-hub-authpick');
      overlay.querySelectorAll('[data-hub-authpick]').forEach(function (el) {
        el.classList.toggle('is-on', el === opt);
      });
      var keyInput = overlay.querySelector('[data-hub-apikey]');
      if (keyInput) keyInput.style.display = picked === 'api-key' ? '' : 'none';
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      var keyInput = overlay.querySelector('[data-hub-apikey]');
      if (isDefault) {
        setDefaultAuth(picked);
      } else {
        setRouteAuth(key, picked);
        if (keyInput) {
          if (keyInput.value) setRouteApiKey(key, keyInput.value);
          else if (picked === 'api-key') {
            App.ui.toast(t('apihub.apiKeyPlaceholder'), 'error');
            return;
          } else setRouteApiKey(key, '');
        }
      }
      closeDialog();
      renderFull();
    });
  }
  /** 自定义路由表单(新建/编辑) */
  function routeFormDialog(editKey) {
    var edit = editKey ? findRoute(editKey) : null;
    var c = edit ? customById(edit.id) : null;
    dialogMethod = c ? c.method : 'GET';
    var ftype = c ? c.responseType || 'echo' : 'echo';
    var body =
      '<div class="hub-form">' +
      '<div class="hub-field"><label>' +
      t('apihub.routeName') +
      '</label><input type="text" class="' + App.ui.inputClass() + '" data-hub-f-name placeholder="' +
      t('apihub.routeNamePlaceholder') +
      '" value="' +
      escAttr(c ? c.name : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.description') +
      '</label><input type="text" class="' + App.ui.inputClass() + '" data-hub-f-desc placeholder="' +
      t('apihub.routeDescPlaceholder') +
      '" value="' +
      escAttr(c ? c.desc : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.method') +
      '</label>' +
      '<div class="hub-method-select" data-dropdown>' +
      '<button type="button" data-dropdown-trigger style="width:100%;color:var(--foreground)">' +
      '<span data-hub-f-method-label>' +
      dialogMethod +
      '</span>' +
      icon('chevron-down', 'size-3') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="left:0;right:auto;min-width:6.5rem">' +
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        .map(function (m) {
          return (
            '<button type="button" class="hub-dd-item" data-hub-f-method="' +
            m +
            '">' +
            '<span class="hub-method ' +
            methodClass(m) +
            '" style="min-width:2.75rem;height:1.125rem;font-size:0.5625rem;margin:0">' +
            m +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.path') +
      '</label><input type="text" class="' + App.ui.inputClass() + '" data-hub-f-path placeholder="/api/..." value="' +
      escAttr(c ? c.path : '') +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.responseType') +
      '</label>' +
      '<div class="hub-auth-options">' +
      '<label class="hub-auth-opt' +
      (ftype === 'echo' ? ' is-on' : '') +
      '" data-hub-ftype="echo"><span class="hub-radio-dot"></span>' +
      '<span class="hub-auth-opt-main"><span class="hub-auth-opt-title">' +
      t('apihub.echo') +
      '</span><span class="hub-auth-opt-desc">method / query / headers / body</span></span></label>' +
      '<label class="hub-auth-opt' +
      (ftype === 'static' ? ' is-on' : '') +
      '" data-hub-ftype="static"><span class="hub-radio-dot"></span>' +
      '<span class="hub-auth-opt-main"><span class="hub-auth-opt-title">' +
      t('apihub.static') +
      '</span></span></label>' +
      '</div></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.statusCode') +
      '</label><input type="number" class="' + App.ui.inputClass() + '" data-hub-f-status min="100" max="599" value="' +
      (c ? c.staticStatus || 200 : 200) +
      '" /></div>' +
      '<div class="hub-field"><label>' +
      t('apihub.response') +
      '</label><textarea class="' + App.ui.inputClass('ui-input-mono') + '" data-hub-f-static placeholder="{ }">' +
      esc(c && c.staticBody ? JSON.stringify(c.staticBody, null, 2) : '') +
      '</textarea></div>' +
      '</div>';
    var overlay = openDialog({
      title: edit ? t('apihub.edit') : t('apihub.addRoute'),
      desc: '',
      body: body,
      foot:
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('outline') + '" data-hub-dlg-close>' +
        t('apihub.cancel') +
        '</button>' +
        '<button type="button" data-slot="button" class="' + App.ui.buttonClass('default') + '" data-hub-dlg-ok>' +
        t('apihub.save') +
        '</button>',
    });
    overlay.addEventListener('click', function (e) {
      var fm = e.target.closest ? e.target.closest('[data-hub-f-method]') : null;
      if (fm) {
        dialogMethod = fm.getAttribute('data-hub-f-method');
        var lbl = overlay.querySelector('[data-hub-f-method-label]');
        if (lbl) lbl.textContent = dialogMethod;
        return;
      }
      var ft = e.target.closest ? e.target.closest('[data-hub-ftype]') : null;
      if (ft) {
        ftype = ft.getAttribute('data-hub-ftype');
        overlay.querySelectorAll('[data-hub-ftype]').forEach(function (el) {
          el.classList.toggle('is-on', el === ft);
        });
      }
    });
    overlay.querySelector('[data-hub-dlg-ok]').addEventListener('click', function () {
      var name = overlay.querySelector('[data-hub-f-name]').value.trim();
      var path = overlay.querySelector('[data-hub-f-path]').value.trim();
      if (!name) {
        App.ui.toast(t('apihub.nameRequired'), 'error');
        return;
      }
      if (!path || path.charAt(0) !== '/') {
        App.ui.toast(t('apihub.pathRequired'), 'error');
        return;
      }
      var status = parseInt(overlay.querySelector('[data-hub-f-status]').value, 10);
      if (isNaN(status) || status < 100 || status > 599) status = 200;
      var staticBody = null;
      if (ftype === 'static') {
        try {
          staticBody = JSON.parse(overlay.querySelector('[data-hub-f-static]').value || '{}');
        } catch (e2) {
          App.ui.toast(t('apihub.jsonInvalid'), 'error');
          return;
        }
      }
      var data = {
        method: dialogMethod,
        path: path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/',
        name: name,
        desc: overlay.querySelector('[data-hub-f-desc]').value.trim(),
        responseType: ftype,
        staticStatus: status,
        staticBody: staticBody,
      };
      if (edit) updateCustomRoute(edit.id, data);
      else addCustomRoute(data);
      closeDialog();
    });
  }
  /* ---------- 复制分享链接 ---------- */
  function copyLink(key) {
    copyText(location.origin + location.pathname + '#/apihub?r=' + encodeURIComponent(key));
  }
  function copyText(text, hint) {
    var done = function () {
      App.ui.toast(hint || t('apihub.shareHint'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text, done);
      });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) {
      App.ui.toast(t('apihub.saveFailed'), 'error');
    }
  }

export { authDialog, closeDialog, confirmDialog, copyLink, copyText, dialogMethod, fallbackCopy, openDialog, routeFormDialog };
