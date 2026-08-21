/* ============================================================
 * dialogs.js — chats 模块对话框集(供应商/提示词/MCP/重命名/附件等)
 * ------------------------------------------------------------
 * 由 manifest deps 预加载为 window.App.chatsDialogs。
 * 与主文件 index.js 经 App.chatsCtx 共享状态与工具函数(ctx 在
 * index.js 求值时注入,此处仅在事件回调内访问)。
 * 拆分目的:单懒加载文件 gzip ≤ 15KB(AGENTS.md 第 8 节)。
 * ============================================================ */
(function () {
  'use strict';

  function C() {
    return window.App && App.chatsCtx;
  }

  /* ---------- 局部别名(保持与主文件一致的调用形态) ---------- */
  function bind() {
    var c = C();
    return {
      c: c,
      state: c.state,
      t: c.t,
      tF: c.tF,
      ic: c.ic,
      esc: c.esc,
      escAttr: c.escAttr,
      val: c.val,
      dlgField: c.dlgField,
    };
  }

  /* ---------- 供应商:新增 / 管理 / 配置 Key / 删除 ---------- */
  var providerTypeSel = 'openai';

  function radioBtn(val2, label, checked) {
    var b = bind();
    return (
      '<button type="button" class="ch-dlg-radio' +
      (checked ? ' is-on' : '') +
      '" data-ch-pv-type-val="' +
      val2 +
      '">' +
      label +
      '</button>'
    );
  }

  function openProviderDialog() {
    var b = bind();
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + b.t('chats.addProvider') + '</h2>',
      body:
        '<div class="ch-dlg-grid">' +
        b.dlgField(b.t('chats.providerName'), '<input type="text" class="ui-input" data-ch-pv-name placeholder="' + b.escAttr(b.t('chats.providerNamePh')) + '" />') +
        b.dlgField(b.t('chats.providerKey2'), '<input type="text" class="ui-input" data-ch-pv-key placeholder="' + b.escAttr(b.t('chats.providerKeyPh')) + '" />') +
        b.dlgField(b.t('chats.providerBase'), '<input type="text" class="ui-input" data-ch-pv-base placeholder="' + b.escAttr(b.t('chats.providerBasePh')) + '" />') +
        b.dlgField(b.t('chats.providerType'),
          '<div class="ch-dlg-radios" data-ch-pv-type>' +
          radioBtn('openai', 'OpenAI 兼容', true) +
          radioBtn('anthropic', 'Anthropic', false) +
          radioBtn('gemini', 'Gemini', false) +
          '</div>') +
        b.dlgField(b.t('chats.providerKeyLabel'), '<input type="password" class="ui-input" data-ch-pv-apikey placeholder="' + b.escAttr(b.t('chats.providerKeyPh2')) + '" autocomplete="off" />') +
        '</div>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-pv-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-pv-save>' +
        b.t('chats.save') +
        '</button>',
    });
  }

  function openProviderManager() {
    var b = bind();
    var rows = b.c
      .providers()
      .map(function (p2) {
        return (
          '<div class="ch-pvm-row">' +
          '<span class="ch-pvm-dot' +
          (p2.hasApiKey ? ' is-ok' : '') +
          '" data-tip="' +
          b.escAttr(p2.hasApiKey ? b.t('chats.wsKeyConfigured') : b.t('chats.noKeySet')) +
          '"></span>' +
          '<span class="ch-pvm-name">' +
          b.esc(p2.name) +
          '</span>' +
          (p2.builtin ? '<span class="ch-pvm-badge">' + b.esc(b.t('chats.builtin')) + '</span>' : '') +
          '<span class="ch-pvm-models">' +
          ((p2.models || []).length || '') +
          '</span>' +
          '<span class="ch-pvm-ops">' +
          '<button type="button" class="ch-mcp-op" data-ch-pvm-key="' +
          b.escAttr(p2.key) +
          '" data-tip="' +
          b.escAttr(b.t('chats.providerKeySet')) +
          '" aria-label="' +
          b.escAttr(b.t('chats.providerKeySet')) +
          '">' +
          b.ic('key-round', 'size-3') +
          '</button>' +
          (p2.builtin
            ? ''
            : '<button type="button" class="ch-mcp-op is-danger" data-ch-pvm-del="' +
              b.escAttr(p2.key) +
              '" data-tip="' +
              b.escAttr(b.t('chats.delete')) +
              '" aria-label="' +
              b.escAttr(b.t('chats.delete')) +
              '">' +
              b.ic('trash-2', 'size-3') +
              '</button>') +
          '</span></div>'
        );
      })
      .join('');
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + b.t('chats.providerManage') + '</h2>',
      body:
        '<div class="ch-pvm-list">' +
        (rows || '<div class="ch-dd-empty">' + b.esc(b.t('chats.noProviders')) + '</div>') +
        '</div>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-pvm-close>' +
        b.t('chats.cancel') +
        '</button>',
    });
  }

  function openProviderKeyDialog(key) {
    var b = bind();
    var p = b.c.providerByKey(key);
    App.ui.dialog({
      head:
        '<h2 class="ui-dialog-title">' +
        b.t('chats.providerKeySet') +
        ' · ' +
        b.esc((p && p.name) || key) +
        '</h2>',
      body:
        b.dlgField(
          b.t('chats.providerBase'),
          '<input type="text" class="ui-input" data-ch-pvk-base value="' +
            b.escAttr((p && p.baseUrl) || '') +
            '" placeholder="' +
            b.escAttr(b.t('chats.providerBasePh')) +
            '" />'
        ) +
        b.dlgField(
          b.t('chats.providerKeyLabel'),
          '<input type="password" class="ui-input" data-ch-pvk-apikey autocomplete="off" placeholder="' +
            b.escAttr(p && p.hasApiKey ? b.t('chats.providerKeyKeep') : b.t('chats.providerKeyPh2')) +
            '" />'
        ),
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-pvk-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-pvk-save>' +
        b.t('chats.save') +
        '</button>',
    });
    b.state._pvkKey = key;
  }

  function confirmDeleteProvider(key) {
    var b = bind();
    var p = b.c.providerByKey(key);
    b.state._pvmDelKey = key;
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + b.t('chats.delete') + '</h2>',
      body:
        '<p class="ui-dialog-desc">' +
        b.tF('chats.providerDeleteMsg', { name: b.esc((p && p.name) || key) }) +
        '</p>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-pvdl-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('destructive', 'sm') +
        '" data-ch-pvdl-ok>' +
        b.t('chats.delete') +
        '</button>',
    });
  }

  /* ---------- 手动输入模型 ---------- */
  function openModelManualDialog() {
    var b = bind();
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + b.t('chats.typeModel') + '</h2>',
      body:
        '<label class="ui-dialog-label">' +
        b.t('chats.model') +
        '</label>' +
        '<input type="text" class="ui-input" data-ch-manual-model value="' +
        b.escAttr(b.state.model || '') +
        '" autocomplete="off" />',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-manual-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-manual-ok>' +
        b.t('chats.save') +
        '</button>',
    });
    var inp = document.querySelector('[data-ch-manual-model]');
    if (inp) inp.focus();
  }

  /* ---------- 提示词 CRUD ---------- */
  function openPromptDialog(id) {
    var b = bind();
    var pr = id ? b.c.promptById(id) : null;
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + (pr ? b.t('chats.promptEdit') : b.t('chats.promptNew')) + '</h2>',
      body:
        '<div class="ch-dlg-grid">' +
        b.dlgField(b.t('chats.promptName'), '<input type="text" class="ui-input" data-ch-pr-name value="' + b.escAttr((pr && pr.name) || '') + '" maxlength="40" />') +
        b.dlgField(b.t('chats.promptCat'), '<input type="text" class="ui-input" data-ch-pr-cat value="' + b.escAttr((pr && pr.category) || '') + '" maxlength="20" />') +
        '</div>' +
        b.dlgField(
          b.t('chats.promptContent'),
          '<textarea class="ui-input ch-dlg-textarea" data-ch-pr-content rows="6" placeholder="' +
            b.escAttr(b.t('chats.promptContentPh')) +
            '">' +
            b.esc((pr && pr.content) || '') +
            '</textarea>'
        ),
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-pr-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-pr-save>' +
        b.t('chats.save') +
        '</button>',
    });
    b.state._promptEditId = id || null;
  }

  function deletePrompt(id) {
    var b = bind();
    var pr = b.c.promptById(id);
    if (!pr) return;
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + b.t('chats.promptDelete') + '</h2>',
      body:
        '<p class="ui-dialog-desc">' +
        b.tF('chats.deletePromptMsg', { name: b.esc(pr.name) }) +
        '</p>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-prdl-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('destructive', 'sm') +
        '" data-ch-prdl-ok>' +
        b.t('chats.delete') +
        '</button>',
    });
    b.state._promptDelId = id;
  }

  /* ---------- MCP 新增/编辑/删除 ---------- */
  var mcpProtocolSel = 'http';

  function openMcpDialog(id) {
    var b = bind();
    var m = id ? b.c.mcps().filter(function (x) { return x.id === id; })[0] || null : null;
    b.state._mcpEditId = id || null;
    b.state._mcpTestTools = (m && m.tools) || [];
    mcpProtocolSel = (m && m.protocol) || 'http';
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + (m ? b.t('chats.mcpEdit') : b.t('chats.mcpAdd')) + '</h2>',
      body:
        '<div class="ch-dlg-grid">' +
        b.dlgField(b.t('chats.mcpName'), '<input type="text" class="ui-input" data-ch-mcp-f-name value="' + b.escAttr((m && m.name) || '') + '" maxlength="60" />') +
        b.dlgField(
          b.t('chats.mcpProtocol'),
          '<div class="ch-dlg-radios" data-ch-mcp-f-protocol>' +
          '<button type="button" class="ch-dlg-radio' +
          (mcpProtocolSel !== 'sse' ? ' is-on' : '') +
          '" data-ch-mcp-protocol="http">' +
          b.t('chats.mcpProtocolHttp') +
          '</button>' +
          '<button type="button" class="ch-dlg-radio' +
          (mcpProtocolSel === 'sse' ? ' is-on' : '') +
          '" data-ch-mcp-protocol="sse">' +
          b.t('chats.mcpProtocolSse') +
          '</button>' +
          '</div>'
        ) +
        b.dlgField(b.t('chats.mcpUrl'), '<input type="text" class="ui-input" data-ch-mcp-f-url value="' + b.escAttr((m && m.url) || '') + '" placeholder="https://…" />') +
        '</div>' +
        '<div class="ch-mcp-dlg-tools" data-ch-mcp-f-tools>' +
        '<div class="ch-mcp-dlg-head">' +
        '<span>' +
        b.t('chats.mcpTools') +
        '</span>' +
        '<button type="button" class="ch-link-btn" data-ch-mcp-f-test>' +
        b.ic('refresh-cw', 'size-3') +
        b.t('chats.mcpTest') +
        '</button>' +
        '</div>' +
        '<div class="ch-mcp-dlg-tool-list" data-ch-mcp-f-tool-list>' +
        (b.state._mcpTestTools && b.state._mcpTestTools.length
          ? b.state._mcpTestTools
              .map(function (t2) {
                return '<div class="ch-mcp-dlg-tool"><span class="ch-mcp-dlg-tool-ic">' + b.ic('wrench', 'size-3.5') + '</span><span class="ch-mcp-dlg-tool-name">' + b.esc(t2.name || '') + '</span></div>';
              })
              .join('')
          : '<div class="ch-mcp-dlg-empty">' + b.esc(b.t('chats.mcpNotest')) + '</div>') +
        '</div>' +
        '</div>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-mcp-f-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-mcp-f-save>' +
        b.t('chats.save') +
        '</button>',
    });
  }

  function deleteMcp(id) {
    var b = bind();
    var m = b.c.mcps().filter(function (x) { return x.id === id; })[0] || null;
    if (!m) return;
    b.state._mcpDelId = id;
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + b.t('chats.mcpDelete') + '</h2>',
      body:
        '<p class="ui-dialog-desc">' +
        b.tF('chats.mcpDeleteMsg', { name: b.esc(m.name) }) +
        '</p>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-mcpdl-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('destructive', 'sm') +
        '" data-ch-mcpdl-ok>' +
        b.t('chats.delete') +
        '</button>',
    });
  }

  /* ---------- 会话重命名 / 删除 ---------- */
  function openRenameConv(cv) {
    var b = bind();
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + b.t('chats.rename') + '</h2>',
      body:
        '<label class="ui-dialog-label">' +
        b.t('chats.name') +
        '</label>' +
        '<input type="text" class="ui-input ch-dialog-input" data-ch-rename-input value="' +
        b.escAttr(cv.title || '') +
        '" maxlength="80" />',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-rename-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-rename-ok>' +
        b.t('chats.save') +
        '</button>',
    });
    b.state._renameConvId = cv.id;
    var inp = document.querySelector('[data-ch-rename-input]');
    if (inp) {
      inp.focus();
      inp.select();
    }
  }

  function confirmDeleteConv(cv) {
    var b = bind();
    b.state._delConvId = cv.id;
    App.ui.dialog({
      head: '<h2 class="ui-dialog-title">' + b.t('chats.deleteConv') + '</h2>',
      body:
        '<p class="ui-dialog-desc">' +
        b.tF('chats.deleteConvMsg', { name: b.esc(cv.title || b.t('chats.untitled')) }) +
        '</p>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-del-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('destructive', 'sm') +
        '" data-ch-del-ok>' +
        b.t('chats.delete') +
        '</button>',
    });
  }

  /* ---------- 会话标签多选浮层 ---------- */
  function saveConvTags(convId, tagIds) {
    var b = bind();
    App.api
      .put('/api/chats/conversations/' + encodeURIComponent(convId), { tagIds: tagIds })
      .then(function () {
        return b.c.reloadState();
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'tags_failed', 'error');
      });
  }

  function openTagsPicker(convId) {
    var b = bind();
    var cv = b.c.conversations().filter(function (x) { return x.id === convId; })[0] || null;
    if (!cv) return;
    var picked = (cv.tagIds || []).slice();
    var html =
      '<div class="cm-tagmenu" data-cm-tagmenu>' +
      '<div class="cm-tagmenu-head">' +
      b.t('chats.addTags') +
      '</div>' +
      b.c.tagInst().pickerHtml(picked) +
      '</div>';
    App.ui.contextMenu.open(html, {
      x: 8,
      y: 8,
      className: 'cm-ctxpop cm-tagmenu-pop',
      onClose: function () {
        b.state._tagMenuConv = null;
      },
    });
    var pop = document.querySelector('[data-ctxpop].cm-tagmenu-pop');
    if (pop) pop._chConvId = convId;
    b.state._tagMenuConv = convId;
    b.state._tagMenuPicked = picked;
  }

  /* ---------- 附件插入(本地 / 远程 URL) ---------- */
  function openAttachDialog(kind) {
    var b = bind();
    b.state._attKind = kind === 'image' ? 'image' : 'file';
    App.ui.dialog({
      head:
        '<h2 class="ui-dialog-title">' +
        b.t(b.state._attKind === 'image' ? 'chats.insertImage' : 'chats.insertFile') +
        '</h2>',
      body:
        b.dlgField(
          b.t('chats.attachUrlLabel'),
          '<input type="url" class="ui-input" data-ch-att-url placeholder="https://…" />'
        ) +
        '<div class="ch-dlg-hint">' +
        b.esc(b.t('chats.attachUrlHint')) +
        '</div>',
      foot:
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-att-local>' +
        b.ic('folder-open', 'size-3.5') +
        b.t('chats.attachLocal') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('outline', 'sm') +
        '" data-ch-att-cancel>' +
        b.t('chats.cancel') +
        '</button>' +
        '<button type="button" class="' +
        App.ui.buttonClass('default', 'sm') +
        '" data-ch-att-add>' +
        b.t('chats.attachUrlAdd') +
        '</button>',
    });
  }

  function pickLocalFile(kind) {
    var b = bind();
    var inp = document.createElement('input');
    inp.type = 'file';
    if (kind === 'image') inp.accept = 'image/*';
    inp.onchange = function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      if (/^image\//.test(file.type)) {
        b.c.readImageFile(file, function (part) {
          b.state.attachments.push(part);
          b.c.rerender();
        });
      } else {
        b.c.readTextFile(file, function (part) {
          b.state.attachments.push(part);
          b.c.rerender();
        });
      }
    };
    inp.click();
  }

  function fetchRemoteAttachment(url) {
    var b = bind();
    App.ui.toast(b.t('chats.attFetching'));
    App.api
      .post('/api/chats/fetch-url', { url: url })
      .then(function (res) {
        if (res && res.type === 'image') {
          b.state.attachments.push({ type: 'image', name: res.name || 'image', dataUri: res.dataUri, url: url });
        } else {
          b.state.attachments.push({ type: 'file', name: (res && res.name) || 'file.txt', content: (res && res.content) || '', url: url });
        }
        App.ui.toast(b.t('chats.attAdded'));
        b.c.rerender();
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || b.t('chats.attachFetchFail'), 'error');
      });
  }

  /* ============================================================
   * 对话框事件委托(全部挂 document,与 index.js 分支按属性互斥)
   * ============================================================ */
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;

    // 供应商管理列表触发项
    if (el.closest('[data-ch-provider-manage]')) {
      openProviderManager();
      return;
    }
    if (el.closest('[data-ch-pvm-close]')) {
      App.ui.closeDialog();
      return;
    }
    var pvmKey = el.closest('[data-ch-pvm-key]');
    if (pvmKey) {
      openProviderKeyDialog(pvmKey.getAttribute('data-ch-pvm-key'));
      return;
    }
    var pvmDel = el.closest('[data-ch-pvm-del]');
    if (pvmDel) {
      confirmDeleteProvider(pvmDel.getAttribute('data-ch-pvm-del'));
      return;
    }
    // 标签多选浮层:完成按钮
    if (el.closest('[data-tp-done]')) {
      if (el.closest('[data-ctxpop].cm-tagmenu-pop')) App.ui.contextMenu.close();
      return;
    }

    // 供应商类型单选(新增对话框)
    var pv = el.closest('[data-ch-pv-type-val]');
    if (pv) {
      providerTypeSel = pv.getAttribute('data-ch-pv-type-val');
      document.querySelectorAll('[data-ch-pv-type-val]').forEach(function (btn) {
        btn.classList.toggle('is-on', btn === pv);
      });
      return;
    }
    if (el.closest('[data-ch-pv-save]')) {
      var b = bind();
      var name = b.val('[data-ch-pv-name]', '');
      var key = b.val('[data-ch-pv-key]', '');
      var base = b.val('[data-ch-pv-base]', '');
      var apikey = b.val('[data-ch-pv-apikey]', '');
      if (!key || !base) {
        App.ui.toast(b.t('chats.providerRequired'), 'error');
        return;
      }
      App.ui.closeDialog();
      App.api
        .post('/api/chats/providers', {
          key: key,
          name: name || key,
          type: providerTypeSel,
          baseUrl: base,
          apiKey: apikey,
        })
        .then(function () {
          b.state.providerKey = key;
          b.state.model = '';
          return b.c.reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'provider_failed', 'error');
          b.c.reloadState();
        });
      return;
    }
    if (el.closest('[data-ch-pv-cancel]')) {
      App.ui.closeDialog();
      return;
    }
    // 供应商管理:配置 Key / 删除
    if (el.closest('[data-ch-pvk-save]')) {
      var b2 = bind();
      var pvkKey = b2.state._pvkKey;
      var pvkBase = b2.val('[data-ch-pvk-base]', '');
      var pvkApikey = b2.val('[data-ch-pvk-apikey]', '');
      App.ui.closeDialog();
      if (!pvkKey) return;
      var pvBody = { key: pvkKey };
      if (pvkBase) pvBody.baseUrl = pvkBase;
      if (pvkApikey) pvBody.apiKey = pvkApikey;
      App.api
        .post('/api/chats/providers', pvBody)
        .then(function () {
          App.ui.toast(b2.t('chats.providerSaved'));
          return b2.c.reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'provider_failed', 'error');
        });
      b2.state._pvkKey = null;
      return;
    }
    if (el.closest('[data-ch-pvk-cancel]')) {
      bind().state._pvkKey = null;
      App.ui.closeDialog();
      return;
    }
    if (el.closest('[data-ch-pvdl-ok]')) {
      var b3 = bind();
      var delKey = b3.state._pvmDelKey;
      App.ui.closeDialog();
      if (!delKey) return;
      App.api
        .del('/api/chats/providers?key=' + encodeURIComponent(delKey))
        .then(function () {
          if (b3.state.providerKey === delKey) {
            b3.state.providerKey = null;
            b3.state.model = '';
            b3.c.resolveDefaults();
          }
          App.ui.toast(b3.t('chats.providerDeleted'));
          return b3.c.reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'delete_failed', 'error');
        });
      b3.state._pvmDelKey = null;
      return;
    }
    if (el.closest('[data-ch-pvdl-cancel]')) {
      bind().state._pvmDelKey = null;
      App.ui.closeDialog();
      return;
    }
    // 手动模型
    if (el.closest('[data-ch-manual-ok]')) {
      var b4 = bind();
      var v = b4.val('[data-ch-manual-model]', '');
      if (v) {
        b4.state.model = v;
        b4.c.persistPrefs();
      }
      App.ui.closeDialog();
      b4.c.rerender();
      return;
    }
    if (el.closest('[data-ch-manual-cancel]')) {
      App.ui.closeDialog();
      return;
    }
    // 提示词保存/取消/删除
    if (el.closest('[data-ch-pr-save]')) {
      var b5 = bind();
      var name5 = b5.val('[data-ch-pr-name]', '');
      var content = b5.val('[data-ch-pr-content]', '');
      var cat = b5.val('[data-ch-pr-cat]', '');
      if (!name5 || !content) {
        App.ui.toast(b5.t('chats.promptRequired'), 'error');
        return;
      }
      App.ui.closeDialog();
      if (b5.state._promptEditId) {
        App.api
          .put('/api/chats/prompts/' + encodeURIComponent(b5.state._promptEditId), { name: name5, content: content, category: cat })
          .then(function () {
            return b5.c.reloadState();
          })
          .catch(function (err) {
            App.ui.toast((err && err.message) || 'prompt_failed', 'error');
          });
      } else {
        App.api
          .post('/api/chats/prompts', { name: name5, content: content, category: cat })
          .then(function (res) {
            b5.state.promptId = (res && res.prompt && res.prompt.id) || b5.state.promptId;
            return b5.c.reloadState();
          })
          .catch(function (err) {
            App.ui.toast((err && err.message) || 'prompt_failed', 'error');
          });
      }
      b5.state._promptEditId = null;
      return;
    }
    if (el.closest('[data-ch-pr-cancel]')) {
      bind().state._promptEditId = null;
      App.ui.closeDialog();
      return;
    }
    if (el.closest('[data-ch-prdl-ok]')) {
      var b6 = bind();
      var pid = b6.state._promptDelId;
      App.ui.closeDialog();
      if (!pid) return;
      App.api
        .del('/api/chats/prompts/' + encodeURIComponent(pid))
        .then(function () {
          if (b6.state.promptId === pid) b6.state.promptId = '';
          b6.c.reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'prompt_del_failed', 'error');
        });
      return;
    }
    if (el.closest('[data-ch-prdl-cancel]')) {
      App.ui.closeDialog();
      return;
    }
    // MCP 协议单选 / 测试 / 保存 / 删除确认
    var proto = el.closest('[data-ch-mcp-protocol]');
    if (proto) {
      mcpProtocolSel = proto.getAttribute('data-ch-mcp-protocol');
      document.querySelectorAll('[data-ch-mcp-protocol]').forEach(function (btn) {
        btn.classList.toggle('is-on', btn === proto);
      });
      return;
    }
    if (el.closest('[data-ch-mcp-f-test]')) {
      var b7 = bind();
      var mname = b7.val('[data-ch-mcp-f-name]', '') || b7.t('chats.mcpTest');
      var murl = b7.val('[data-ch-mcp-f-url]', '');
      if (!murl) {
        App.ui.toast(b7.t('chats.mcpUrlRequired'), 'error');
        return;
      }
      App.api
        .post('/api/chats/mcp/test', { name: mname, protocol: mcpProtocolSel, url: murl })
        .then(function (res) {
          b7.state._mcpTestTools = (res && res.tools) || [];
          var list = document.querySelector('[data-ch-mcp-f-tool-list]');
          if (list) {
            list.innerHTML = b7.state._mcpTestTools.length
              ? b7.state._mcpTestTools
                  .map(function (t2) {
                    return '<div class="ch-mcp-dlg-tool"><span class="ch-mcp-dlg-tool-ic">' + b7.ic('wrench', 'size-3.5') + '</span><span class="ch-mcp-dlg-tool-name">' + b7.esc(t2.name || '') + '</span></div>';
                  })
                  .join('')
              : '<div class="ch-mcp-dlg-empty">' + b7.esc(b7.t('chats.mcpNotools')) + '</div>';
          }
          App.ui.toast(b7.tF('chats.mcpTestedTools', { n: b7.state._mcpTestTools.length }));
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || b7.t('chats.mcpTestFailed'), 'error');
        });
      return;
    }
    if (el.closest('[data-ch-mcp-f-save]')) {
      var b8 = bind();
      var mname8 = b8.val('[data-ch-mcp-f-name]', '');
      var murl8 = b8.val('[data-ch-mcp-f-url]', '');
      if (!mname8 || !murl8) {
        App.ui.toast(b8.t('chats.mcpRequired'), 'error');
        return;
      }
      var tools = b8.state._mcpTestTools || [];
      if (!Array.isArray(tools)) tools = [];
      tools = tools.map(function (t2) {
        return Object.assign({}, t2, { enabled: t2.enabled !== false });
      });
      var body = { name: mname8, protocol: mcpProtocolSel, url: murl8, tools: tools };
      if (b8.state._mcpEditId) body.id = b8.state._mcpEditId;
      App.ui.closeDialog();
      App.api
        .post('/api/chats/mcp', body)
        .then(function () {
          return b8.c.reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'mcp_failed', 'error');
        });
      b8.state._mcpEditId = null;
      return;
    }
    if (el.closest('[data-ch-mcp-f-cancel]')) {
      bind().state._mcpEditId = null;
      App.ui.closeDialog();
      return;
    }
    if (el.closest('[data-ch-mcpdl-ok]')) {
      var b9 = bind();
      var delId = b9.state._mcpDelId;
      App.ui.closeDialog();
      if (!delId) return;
      App.api
        .del('/api/chats/mcp?key=' + encodeURIComponent(delId))
        .then(function () {
          b9.c.reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'mcp_del_failed', 'error');
        });
      return;
    }
    if (el.closest('[data-ch-mcpdl-cancel]')) {
      App.ui.closeDialog();
      return;
    }
    // 会话重命名 / 删除确认
    if (el.closest('[data-ch-rename-ok]')) {
      var b10 = bind();
      var inp = document.querySelector('[data-ch-rename-input]');
      var title = (inp && inp.value.trim()) || '';
      var rid = b10.state._renameConvId || b10.state.selectedId;
      if (rid) {
        App.api.put('/api/chats/conversations/' + encodeURIComponent(rid), { title: title }).then(function () {
          return b10.c.reloadState();
        });
      }
      App.ui.closeDialog();
      return;
    }
    if (el.closest('[data-ch-rename-cancel]')) {
      App.ui.closeDialog();
      return;
    }
    if (el.closest('[data-ch-del-ok]')) {
      var b11 = bind();
      var did = b11.state._delConvId || b11.state.selectedId;
      App.ui.closeDialog();
      if (!did) return;
      App.api
        .del('/api/chats/conversations/' + encodeURIComponent(did))
        .then(function () {
          if (b11.state.selectedId === did) b11.state.selectedId = null;
          b11.state.messages = [];
          b11.c.stopStreamSilent();
          b11.c.reloadState();
        })
        .catch(function (err) {
          App.ui.toast((err && err.message) || 'delete_failed', 'error');
          b11.c.reloadState();
        });
      return;
    }
    if (el.closest('[data-ch-del-cancel]')) {
      App.ui.closeDialog();
      return;
    }
    // 标签多选浮层:切换 / 完成
    var pick = el.closest('[data-tp-pick]');
    if (pick) {
      var pop = el.closest('[data-ctxpop].cm-tagmenu-pop');
      if (pop) {
        var b12 = bind();
        var convId = pop._chConvId;
        var cv = b12.c.conversations().filter(function (x) { return x.id === convId; })[0] || null;
        if (cv) {
          var picked = (cv.tagIds || []).slice();
          var idx = picked.indexOf(pick.getAttribute('data-tp-pick'));
          if (idx === -1) picked.push(pick.getAttribute('data-tp-pick'));
          else picked.splice(idx, 1);
          saveConvTags(convId, picked);
        }
        App.ui.contextMenu.close();
      }
      return;
    }
    // 附件对话框
    if (el.closest('[data-ch-att-local]')) {
      var attKind = bind().state._attKind || 'file';
      App.ui.closeDialog();
      pickLocalFile(attKind);
      return;
    }
    if (el.closest('[data-ch-att-cancel]')) {
      App.ui.closeDialog();
      return;
    }
    if (el.closest('[data-ch-att-add]')) {
      var b13 = bind();
      var attUrl = b13.val('[data-ch-att-url]', '');
      App.ui.closeDialog();
      if (!attUrl) {
        App.ui.toast(b13.t('chats.attachUrlRequired'), 'error');
        return;
      }
      fetchRemoteAttachment(attUrl);
      return;
    }
  });

  window.App = window.App || {};
  App.chatsDialogs = {
    openProviderDialog: openProviderDialog,
    openProviderManager: openProviderManager,
    openModelManualDialog: openModelManualDialog,
    openPromptDialog: openPromptDialog,
    deletePrompt: deletePrompt,
    openMcpDialog: openMcpDialog,
    deleteMcp: deleteMcp,
    openRenameConv: openRenameConv,
    confirmDeleteConv: confirmDeleteConv,
    openTagsPicker: openTagsPicker,
    openAttachDialog: openAttachDialog,
  };
})();
