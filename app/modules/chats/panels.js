/* ============================================================
 * panels.js — chats 右栏面板(参数设置 | MCP | Agent)+ 联网搜索 Key
 * ------------------------------------------------------------
 * 由 manifest deps 预加载为 window.App.chatsPanels。
 * 与主文件 index.js 经 App.chatsCtx 共享状态与工具函数(ctx 在
 * index.js 求值时注入,此处仅在渲染/回调时访问)。
 * 拆分目的:单懒加载文件 gzip ≤ 15KB(AGENTS.md 第 8 节)。
 * ============================================================ */
(function () {
  'use strict';

  function C() {
    return window.App && App.chatsCtx;
  }

  /** 面板字段区块:标题 + 内容 */
  function fieldSection(label, content) {
    return (
      '<div class="ch-field-section">' +
      '<div class="ch-field-label">' +
      label +
      '</div>' +
      '<div class="ch-field-body">' +
      content +
      '</div>' +
      '</div>'
    );
  }

  var TOKEN_PRESETS = [
    '2k',
    '4k',
    '8k',
    '16k',
    '32k',
    '64k',
    '128k',
    '256k',
    '384k',
  ];

  function capt(name) {
    return { tavily: 'Tavily', brave: 'Brave', serper: 'Serper' }[name] || name;
  }

  function renderParamField(c, s, val) {
    if (val === undefined || val === '' || val === null) val = s.min;
    var pct = ((Number(val) - s.min) / (s.max - s.min)) * 100;
    return (
      '<div class="ch-field ch-param">' +
      '<div class="ch-param-head">' +
      '<label>' +
      c.esc(s.label) +
      '</label>' +
      '<span class="ch-param-val" data-param-val="' +
      s.key +
      '">' +
      c.esc(val) +
      '</span>' +
      '</div>' +
      '<div class="ch-param-range">' +
      '<input type="range" class="cm-range" min="' +
      s.min +
      '" max="' +
      s.max +
      '" step="' +
      s.step +
      '" value="' +
      val +
      '" data-ch-param="' +
      s.key +
      '" data-param-range="' +
      s.key +
      '" style="--pct:' +
      pct +
      '%" />' +
      '</div>' +
      '</div>'
    );
  }

  function renderParamsTab() {
    var c = C();
    var p = c.providerByKey(c.state.providerKey);
    var models = c.modelOptions(c.state.providerKey);
    var prompt = c.promptById(c.state.promptId);
    var q = (c.state.modelQuery || '').trim().toLowerCase();
    var filtered = models
      ? models.filter(function (m) {
          return m.toLowerCase().indexOf(q) !== -1;
        })
      : [];

    var schema = [
      { label: c.t('chats.temperature'), key: 'temperature', min: 0, max: 2, step: 0.01 },
      { label: c.t('chats.topP'), key: 'topP', min: 0, max: 1, step: 0.01 },
    ];
    var paramInputs = schema
      .map(function (s2) {
        var val = c.state.params[s2.key];
        return renderParamField(c, s2, val);
      })
      .join('');
    var maxTokens = c.state.params.maxTokens;

    return (
      '<div class="ch-panel-scroll">' +
      fieldSection(c.t('chats.provider'),
        '<div class="ch-field" data-dropdown>' +
        '<button type="button" class="ch-select-like" data-dropdown-trigger data-ch-p-provider-trigger>' +
        '<span class="ch-select-ic">' +
        c.ic('layers', 'size-3.5') +
        '</span>' +
        '<span class="ch-select-name">' +
        c.esc(p ? p.name : c.t('chats.selectProvider')) +
        '</span>' +
        (p && !p.hasApiKey && !p.local ? c.ic('key-round', 'size-3 ch-warn') : '') +
        c.ic('chevron-down', 'size-3.5') +
        '</button>' +
        '<div data-dropdown-menu class="ch-select-menu ' +
        App.ui.dropdownContentClass('min-w-52') +
        '" data-side="bottom">' +
        c.providers()
          .map(function (p2) {
            return (
              '<button type="button" role="menuitem" class="' +
              App.ui.dropdownItemClass('gap-2') +
              '" data-ch-p-provider="' +
              c.escAttr(p2.key) +
              '">' +
              '<span class="ch-dd-check">' +
              (p2.key === c.state.providerKey ? c.ic('check', 'size-3.5') : '') +
              '</span>' +
              '<span class="ch-dd-name">' +
              c.esc(p2.name) +
              '</span>' +
              '</button>'
            );
          })
          .join('') +
        App.ui.dropdownSeparator() +
        '<button type="button" role="menuitem" class="' +
        App.ui.dropdownItemClass('gap-2 ch-dd-primary') +
        '" data-ch-provider-add>' +
        c.ic('circle-plus', 'size-3.5') +
        c.t('chats.addProvider') +
        '</button>' +
        '<button type="button" role="menuitem" class="' +
        App.ui.dropdownItemClass('gap-2') +
        '" data-ch-provider-manage>' +
        c.ic('pencil', 'size-3.5') +
        c.t('chats.providerManage') +
        '</button>' +
        '</div></div>') +
      fieldSection(
        c.t('chats.model'),
        '<div class="ch-model-combo">' +
        '<div class="ch-model-top">' +
        '<input type="text" class="ch-model-input" data-ch-model-input placeholder="' +
        c.escAttr(c.t('chats.modelPlaceholder')) +
        '" value="' +
        c.escAttr(c.state.model || '') +
        '" autocomplete="off" />' +
        '<button type="button" class="ch-icon-btn ch-sm-btn" data-ch-p-model-fetch data-tip="' +
        c.escAttr(c.t('chats.fetchModels')) +
        '" aria-label="' +
        c.escAttr(c.t('chats.fetchModels')) +
        '">' +
        c.ic('refresh-cw', 'size-3.5') +
        '</button>' +
        '</div>' +
        '<div class="ch-model-list" data-ch-model-list>' +
        (filtered && filtered.length
          ? filtered
              .map(function (m) {
                return (
                  '<button type="button" class="ch-model-opt' +
                  (m === c.state.model ? ' is-on' : '') +
                  '" data-ch-p-model="' +
                  c.escAttr(m) +
                  '">' +
                  (m === c.state.model ? c.ic('check', 'size-3.5') : '') +
                  '<span>' +
                  c.esc(m) +
                  '</span>' +
                  '</button>'
                );
              })
              .join('')
          : '<div class="ch-model-empty">' + c.esc(c.t('chats.noModelsHint')) + '</div>') +
        '</div>' +
        '</div>'
      ) +
      paramInputs +
      fieldSection(
        c.t('chats.topK'),
        '<input type="number" class="ch-num-input" data-ch-param="topK" min="0" max="100" value="' +
        c.escAttr(c.state.params.topK != null ? c.state.params.topK : '') +
        '" />'
      ) +
      fieldSection(
        c.t('chats.maxTokens'),
        '<div class="ch-tokens-row">' +
        '<input type="text" class="ch-num-input ch-tokens-input" data-ch-param="maxTokens" value="' +
        c.escAttr(maxTokens) +
        '" placeholder="' +
        c.escAttr(c.t('chats.tokensPlaceholder')) +
        '" autocomplete="off" />' +
        '<span class="ch-tokens-hint">' +
        c.esc(c.formatTokens(maxTokens)) +
        '</span>' +
        '<span class="cm-chip-wrap" data-dropdown>' +
        '<button type="button" class="ch-preset-btn" data-dropdown-trigger aria-label="' +
        c.escAttr(c.t('chats.presets')) +
        '">' +
        c.ic('chevron-down', 'size-3.5') +
        '</button>' +
        '<div data-dropdown-menu class="' +
        App.ui.dropdownContentClass('min-w-24') +
        '" data-side="bottom">' +
        TOKEN_PRESETS.map(function (v) {
          return (
            '<button type="button" role="menuitem" class="' +
            App.ui.dropdownItemClass('gap-1') +
            '" data-ch-preset="' +
            c.escAttr(v) +
            '">' +
            (String(maxTokens) === v ? c.ic('check', 'size-3.5') : '') +
            '<span class="ch-dd-name">' +
            c.esc(v) +
            '</span>' +
            '</button>'
          );
        }).join('') +
        '</div></span>' +
        '</div>'
      ) +
      fieldSection(
        c.t('chats.prompt'),
        '<div class="ch-field" data-dropdown>' +
        '<button type="button" class="ch-select-like" data-dropdown-trigger data-ch-prompt-trigger>' +
        '<span class="ch-select-ic">' +
        c.ic('wand-2', 'size-3.5') +
        '</span>' +
        '<span class="ch-select-name">' +
        c.esc(prompt ? prompt.name : c.t('chats.noPrompt')) +
        '</span>' +
        c.ic('chevron-down', 'size-3.5') +
        '</button>' +
        '<div data-dropdown-menu class="ch-select-menu ' +
        App.ui.dropdownContentClass('min-w-56') +
        '" data-side="bottom">' +
        '<button type="button" role="menuitem" class="' +
        App.ui.dropdownItemClass('gap-2') +
        '" data-ch-prompt-none>' +
        '<span class="ch-dd-check">' +
        (!c.state.promptId ? c.ic('check', 'size-3.5') : '') +
        '</span>' +
        '<span class="ch-dd-name">' +
        c.esc(c.t('chats.noPrompt')) +
        '</span>' +
        '</button>' +
        App.ui.dropdownSeparator() +
        c.prompts()
          .map(function (pr) {
            return (
              '<button type="button" role="menuitem" class="' +
              App.ui.dropdownItemClass('gap-2') +
              '" data-ch-prompt="' +
              c.escAttr(pr.id) +
              '">' +
              '<span class="ch-dd-check">' +
              (pr.id === c.state.promptId ? c.ic('check', 'size-3.5') : '') +
              '</span>' +
              '<span class="ch-dd-name">' +
              c.esc(pr.name) +
              '</span>' +
              (pr.category ? '<span class="ch-dd-cat">' + c.esc(pr.category) + '</span>' : '') +
              '</button>'
            );
          })
          .join('') +
        App.ui.dropdownSeparator() +
        '<button type="button" role="menuitem" class="' +
        App.ui.dropdownItemClass('gap-2 ch-dd-primary') +
        '" data-ch-prompt-new>' +
        c.ic('plus', 'size-3.5') +
        c.t('chats.promptNew') +
        '</button>' +
        '</div></div>' +
        (prompt
          ? '<div class="ch-prompt-actions">' +
            '<button type="button" class="ch-link-btn" data-ch-prompt-edit="' +
            c.escAttr(prompt.id) +
            '">' +
            c.ic('pencil', 'size-3') +
            c.t('chats.promptEdit') +
            '</button>' +
            '<button type="button" class="ch-link-btn is-danger" data-ch-prompt-del="' +
            c.escAttr(prompt.id) +
            '">' +
            c.ic('trash-2', 'size-3') +
            c.t('chats.promptDelete') +
            '</button>' +
            '</div>'
          : '') +
        (prompt ? '<div class="ch-prompt-preview">' + c.esc(prompt.content.slice(0, 180)) + (prompt.content.length > 180 ? '…' : '') + '</div>' : '')
      ) +
      fieldSection(
        c.t('chats.webSearchTitle'),
        '<label class="ch-switch-row">' +
        '<span class="ch-switch-label">' +
        c.t('chats.webSearchToggle') +
        '</span>' +
        '<span role="switch" aria-checked="' +
        (c.state.webSearch.enabled ? 'true' : 'false') +
        '" class="ui-switch' +
        (c.state.webSearch.enabled ? ' is-on' : '') +
        '" data-ch-ws-switch></span>' +
        '</label>' +
        (c.state.webSearch.enabled
          ? '<div class="ch-ws-providers">' +
            ['tavily', 'brave', 'serper']
              .map(function (prov) {
                return (
                  '<button type="button" class="ch-ws-provider' +
                  (c.state.webSearch.provider === prov ? ' is-on' : '') +
                  '" data-ch-ws-provider="' +
                  prov +
                  '">' +
                  capt(prov) +
                  '</button>'
                );
              })
              .join('') +
            '</div>' +
            renderWsKeyField(c, c.state.webSearch.provider)
          : '')
      ) +
      '</div>'
    );
  }

  /* ---------- 联网搜索 Key 配置 ---------- */
  function wsKeyConfigured(c, prov) {
    var ks = (c.state.data && c.state.data.websearchKeys) || {};
    return !!ks[prov];
  }
  function renderWsKeyField(c, prov) {
    var ok = wsKeyConfigured(c, prov);
    return (
      '<div class="ch-ws-key">' +
      '<div class="ch-ws-key-label">' +
      '<span>' +
      c.esc(c.tF('chats.wsKeyLabel', { provider: capt(prov) })) +
      '</span>' +
      '<span class="ch-ws-key-state' +
      (ok ? ' is-ok' : ' is-miss') +
      '">' +
      c.ic(ok ? 'circle-check' : 'circle-alert', 'size-3') +
      c.esc(ok ? c.t('chats.wsKeyConfigured') : c.t('chats.wsKeyMissing')) +
      '</span>' +
      '</div>' +
      '<div class="ch-tokens-row">' +
      '<input type="password" class="ch-num-input ch-ws-key-input" data-ch-wskey-input autocomplete="off" placeholder="' +
      c.escAttr(c.t('chats.wsKeyPh')) +
      '" />' +
      '<button type="button" class="ch-link-btn" data-ch-wskey-save>' +
      c.ic('check', 'size-3') +
      c.t('chats.wsKeySave') +
      '</button>' +
      '</div></div>'
    );
  }
  function saveWsKey() {
    var c = C();
    var prov = c.state.webSearch.provider || 'tavily';
    var keyVal = c.val('[data-ch-wskey-input]', '');
    if (!keyVal) {
      App.ui.toast(c.t('chats.wsKeyRequired'), 'error');
      return;
    }
    var settings = {};
    settings['chats:websearch:' + prov + ':apikey'] = keyVal;
    App.api
      .put('/api/settings', { settings: settings })
      .then(function () {
        App.ui.toast(c.t('chats.wsKeySaved'));
        return c.reloadState();
      })
      .catch(function (e) {
        App.ui.toast((e && e.message) || 'save_failed', 'error');
      });
  }

  function renderMcpTab() {
    var c = C();
    var list = c.mcps();
    return (
      '<div class="ch-panel-scroll">' +
      (list.length
        ? list.map(renderMcpCard).join('')
        : '<div class="ch-panel-empty">' +
          c.ic('plug', 'size-5') +
          '<span>' +
          c.esc(c.t('chats.mcpEmpty')) +
          '</span>' +
          '</div>') +
      '</div>' +
      '<div class="ch-panel-foot">' +
      '<button type="button" data-slot="button" class="' +
      App.ui.buttonClass('default', 'sm', 'w-full') +
      '" data-ch-mcp-add>' +
      c.ic('plus', 'size-4') +
      c.t('chats.mcpAdd') +
      '</button>' +
      '</div>'
    );
  }
  function renderMcpCard(m) {
    var c = C();
    var tools = Array.isArray(m.tools) ? m.tools : [];
    var toolRows = tools
      .map(function (tl, i) {
        var disabled = !m.enabled;
        var on = m.enabled && tl.enabled !== false;
        return (
          '<label class="ch-mcp-tool">' +
          '<span class="ch-mcp-tool-name">' +
          c.ic('wrench', 'size-3') +
          '<span class="ch-mcp-tool-title">' +
          c.esc(tl.name || 'tool') +
          '</span>' +
          '</span>' +
          '<span role="switch" aria-checked="' +
          (on ? 'true' : 'false') +
          '" class="ui-switch' +
          (on ? ' is-on' : '') +
          (disabled ? ' is-disabled' : '') +
          '" data-ch-mcp-tool="' +
          c.escAttr(m.id) +
          ':' +
          i +
          '"></span>' +
          '</label>'
        );
      })
      .join('');
    var sse = m.protocol === 'sse';
    return (
      '<div class="ch-mcp-card">' +
      '<div class="ch-mcp-head">' +
      '<div class="ch-mcp-titles">' +
      '<span class="ch-mcp-name">' +
      (sse ? c.ic('radio', 'size-3.5') : c.ic('plug', 'size-3.5')) +
      c.esc(m.name) +
      '</span>' +
      '<span class="ch-mcp-url">' +
      c.esc(m.url) +
      '</span>' +
      '</div>' +
      '<span role="switch" aria-checked="' +
      (m.enabled ? 'true' : 'false') +
      '" class="ui-switch' +
      (m.enabled ? ' is-on' : '') +
      '" data-ch-mcp-sw="' +
      c.escAttr(m.id) +
      '"></span>' +
      '</div>' +
      '<div class="ch-mcp-meta">' +
      '<span class="ch-mcp-badge">' +
      (sse ? c.t('chats.mcpProtocolSse') : c.t('chats.mcpProtocolHttp')) +
      '</span>' +
      '<span class="ch-mcp-count">' +
      c.t('chats.mcpTools') +
      ' ' +
      tools.length +
      '</span>' +
      '<div class="ch-mcp-ops">' +
      '<button type="button" class="ch-mcp-op" data-ch-mcp-edit="' +
      c.escAttr(m.id) +
      '">' +
      c.ic('pencil', 'size-3') +
      '</button>' +
      '<button type="button" class="ch-mcp-op is-danger" data-ch-mcp-del="' +
      c.escAttr(m.id) +
      '">' +
      c.ic('trash-2', 'size-3') +
      '</button>' +
      '</div>' +
      '</div>' +
      (tools.length
        ? '<div class="ch-mcp-tools">' +
          '<div class="ch-mcp-tools-label">' +
          c.t('chats.mcpToolsEnabled') +
          '</div>' +
          toolRows +
          '</div>'
        : '<div class="ch-mcp-notools">' + c.esc(c.t('chats.mcpFetchFirst')) + '</div>') +
      '</div>'
    );
  }
  function renderAgentTab() {
    var c = C();
    return (
      '<div class="ch-panel-scroll">' +
      App.ui.emptyState({
        icon: 'bot',
        title: c.t('chats.agentTab'),
        desc: c.t('chats.agentDesc'),
        fill: true,
      }) +
      '</div>'
    );
  }

  function renderBody() {
    var c = C();
    if (c.state.rightTab === 'mcp') return renderMcpTab();
    if (c.state.rightTab === 'agent') return renderAgentTab();
    return renderParamsTab();
  }

  // 面板专属点击分支(与 index.js 的委托按属性天然互斥)
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var wsProv = el.closest('[data-ch-ws-provider]');
    if (wsProv) {
      var c = C();
      c.state.webSearch.provider = wsProv.getAttribute('data-ch-ws-provider');
      c.persistPrefs();
      c.rerender();
      return;
    }
    if (el.closest('[data-ch-wskey-save]')) {
      saveWsKey();
      return;
    }
  });

  window.App = window.App || {};
  App.chatsPanels = {
    renderBody: renderBody,
  };
})();
