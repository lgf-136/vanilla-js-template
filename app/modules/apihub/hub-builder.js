/* hub-builder.js — 请求运行 + 构建器/响应/历史渲染 */
import { renderFull } from './hub-view.js';
import { apiKeyOf } from './hub-actions.js';
import { copyText } from './hub-dialogs.js';
import { kvRowsHtml, methodClass } from './hub-list.js';
import { authMode, esc, escAttr, findRoute, hasBody, icon, persistHistory, rowsToObj, t, view } from './hub-store.js';

'use strict';

  /* ---------- 路由选择 + 运行 ---------- */
  function selectRoute(key, r, silent) {
    r = r || findRoute(key);
    if (!r) return;
    view.selected = key;
    view.req = {
      method: r.method,
      path: r.path,
      params: [{ k: '', v: '' }],
      headers: [{ k: '', v: '' }],
      body: '',
    };
    // 按生效鉴权方式预填认证头(公开/全局密码需要用户自行补充)
    var mode = authMode(key, r);
    var token = App.auth && App.auth.token ? App.auth.token() : null;
    if (mode === 'session' && token) {
      view.req.headers = [{ k: 'x-auth-token', v: token }, { k: '', v: '' }];
    } else if (mode === 'bearer' && token) {
      view.req.headers = [{ k: 'Authorization', v: 'Bearer ' + token }, { k: '', v: '' }];
    } else if (mode === 'global-password') {
      view.req.headers = [{ k: 'x-auth-password', v: '' }, { k: '', v: '' }];
    } else if (mode === 'api-key') {
      view.req.headers = [{ k: 'x-api-key', v: apiKeyOf(key) }, { k: '', v: '' }];
    }
    if (!silent) renderFull();
  }
  function buildUrl() {
    var qs = rowsToObj(view.req.params);
    var keys = Object.keys(qs);
    if (!keys.length) return view.req.path;
    var parts = keys.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]);
    });
    return view.req.path + (view.req.path.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
  }
  function runRequest() {
    var req = view.req;
    if (!req.path || req.path.charAt(0) !== '/') {
      App.ui.toast(t('apihub.pathRequired'), 'error');
      return;
    }
    var headers = rowsToObj(req.headers);
    var url = buildUrl();
    var started = performance.now();
    view.running = true;
    renderFull();

    var opts = { method: req.method, headers: headers, cache: 'no-store' };
    if (hasBody(req.method) && req.body) {
      if (!headers['content-type'] && !headers['Content-Type']) {
        opts.headers['Content-Type'] = 'application/json';
      }
      opts.body = req.body;
    }

    fetch(url, opts)
      .then(function (res) {
        return res.text().then(function (text) {
          var timeMs = Math.round(performance.now() - started);
          var size = 0;
          try {
            size = new Blob([text]).size;
          } catch (e) {
            size = text.length;
          }
          var hdrs = [];
          if (res.headers && typeof res.headers.forEach === 'function') {
            res.headers.forEach(function (v, k) {
              hdrs.push([k, v]);
            });
          }
          view.run = {
            status: res.status,
            statusText: res.statusText || '',
            timeMs: timeMs,
            size: size,
            headers: hdrs,
            text: text,
          };
          view.history.unshift({ method: req.method, path: url, status: res.status, ts: Date.now() });
          view.history = view.history.slice(0, 20);
          persistHistory();
        });
      })
      .catch(function (e) {
        view.run = {
          status: 0,
          statusText: 'Error',
          timeMs: Math.round(performance.now() - started),
          size: 0,
          headers: [],
          text: String((e && e.message) || e),
        };
      })
      .then(function () {
        view.running = false;
        renderFull();
      });
  }
  function rerunHistory(item) {
    var m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/.*)$/.exec(item.path);
    view.req.method = (m && m[1]) || 'GET';
    var path = (m && m[2]) || item.path;
    var qIdx = path.indexOf('?');
    if (qIdx !== -1) {
      view.req.path = path.slice(0, qIdx);
      var qs = path.slice(qIdx + 1).split('&');
      view.req.params = qs.map(function (pair) {
        var kv = pair.split('=');
        return { k: decodeURIComponent(kv[0] || ''), v: decodeURIComponent(kv[1] || '') };
      });
    } else {
      view.req.path = path;
      view.req.params = [{ k: '', v: '' }];
    }
    runRequest();
  }
  /** 尝试把文本美化为缩进 JSON;不是 JSON 返回 null(调用方回退原文) */
  function prettyJson(text) {
    if (typeof text !== 'string' || !text) return null;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch (e) {
      return null;
    }
  }
  /** JSON 语法高亮(仅转义 & < >,保留引号以便正则匹配字符串) */
  function highlightJson(text) {
    var src = viewPretty(text);
    var isJson = prettyJson(text) !== null;
    if (!isJson) src = String(text || '');
    src = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!isJson) return src;
    return src.replace(
      /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      function (m, str, colon, boolv, nullv, num) {
        if (str) return '<span class="hub-hl-str">' + str + '</span>' + (colon || '');
        if (boolv) return '<span class="hub-hl-bool">' + boolv + '</span>';
        if (nullv) return '<span class="hub-hl-null">' + nullv + '</span>';
        if (num) return '<span class="hub-hl-num">' + num + '</span>';
        return m;
      }
    );
  }
  function requestHtml() {
    var req = view.req;
    return (
      '<div class="hub-req">' +
      '<div class="hub-req-line">' +
      '<div class="hub-method-select" data-dropdown>' +
      '<button type="button" data-dropdown-trigger><span>' +
      esc(req.method) +
      '</span>' +
      icon('chevron-down', '') +
      '</button>' +
      '<div class="hub-dd-menu" data-dropdown-menu style="left: 0;right: auto;min-width: calc(var(--spacing) * 26)">' +
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        .map(function (mm) {
          return (
            '<button type="button" class="hub-dd-item" data-hub-reqmethod="' +
            mm +
            '">' +
            '<span class="hub-method ' +
            methodClass(mm) +
            '" style="min-width:calc(var(--spacing) * 11);height: calc(var(--spacing) * 4.5);font-size:0.5625rem;margin: 0">' +
            mm +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</div></div>' +
      '<input type="text" class="hub-req-path" data-hub-reqpath placeholder="/api/..." value="' +
      escAttr(req.path) +
      '" />' +
      '<button type="button" data-slot="button" class="' + App.ui.buttonClass('default') + '" data-hub-act="send"' +
      (view.running ? ' disabled' : '') +
      '>' +
      icon('send', '') +
      esc(t('apihub.send')) +
      '</button>' +
      '</div>' +
      '<div class="hub-tabs">' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'params' ? ' is-on' : '') +
      '" data-hub-tab="params">' +
      icon('sliders-horizontal', '') +
      esc(t('apihub.params')) +
      '</button>' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'headers' ? ' is-on' : '') +
      '" data-hub-tab="headers">' +
      icon('list-filter', '') +
      esc(t('apihub.headers')) +
      '</button>' +
      '<button type="button" class="hub-tab' +
      (view.runTab === 'body' ? ' is-on' : '') +
      '" data-hub-tab="body">' +
      icon('scroll-text', '') +
      esc(t('apihub.body')) +
      '</button>' +
      '</div>' +
      (view.runTab === 'params' ? kvRowsHtml(req.params, 'params') : '') +
      (view.runTab === 'headers' ? kvRowsHtml(req.headers, 'headers') : '') +
      (view.runTab === 'body'
        ? '<textarea class="hub-body-input" data-hub-reqbody placeholder="{ }">' +
          esc(req.body || '') +
          '</textarea>'
        : '') +
      '</div>'
    );
  }
  function statusClass(s) {
    if (s >= 200 && s < 300) return 'is-2xx';
    if (s >= 400 && s < 500) return 'is-4xx';
    if (s >= 500) return 'is-5xx';
    return 'is-err';
  }
  function fmtSize(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  /** 递归解码 JSON 字符串值(美化视图用:settings 等 KV 值以 JSON 字符串落库) */
  function decodeNested(value) {
    if (typeof value === 'string') {
      var t = value.trim();
      if (t && (t.charAt(0) === '{' || t.charAt(0) === '[')) {
        try {
          return decodeNested(JSON.parse(value));
        } catch (e) {
          return value;
        }
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(decodeNested);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        out[k] = decodeNested(value[k]);
      });
      return out;
    }
    return value;
  }
  /** 美化视图文本:解析 JSON → 递归解码嵌套字符串 → 缩进序列化 */
  function viewPretty(text) {
    try {
      return JSON.stringify(decodeNested(JSON.parse(text)), null, 2);
    } catch (e) {
      return prettyJson(text) || text;
    }
  }
  /* ---------- 响应 JSON 树(公共组件 App.ui.jsonTree) ---------- */
  var jsonTree = null;
  /** 解析响应文本为解码后的 JSON 值;非 JSON 返回 null */
  function jsonValue(text) {
    try {
      return decodeNested(JSON.parse(text));
    } catch (e) {
      return null;
    }
  }
  function ensureJsonTree(value) {
    if (!jsonTree) {
      jsonTree = App.ui.jsonTree.create({
        labels: {
          copyNode: t('apihub.copyNode'),
          items: t('apihub.jsonItems'),
          keys: t('apihub.jsonKeys'),
        },
        onCopy: function (text) {
          copyText(text, t('apihub.copied'));
        },
        onRender: function () {
          var box = document.querySelector('[data-hub-jsonbox]');
          if (box) box.innerHTML = jsonTree.render();
        },
      });
    }
    jsonTree.setValue(value);
    return jsonTree;
  }
  function responseHtml() {
    var res = view.run;
    var isJson = res ? prettyJson(res.text || '') !== null : false;
    var html =
      '<div class="hub-res-head">' +
      '<span class="hub-res-title">' +
      icon('circle-dot', '') +
      esc(t('apihub.response')) +
      '</span>';
    if (res) {
      html +=
        '<div class="hub-res-meta">' +
        '<span class="hub-res-status ' +
        statusClass(res.status) +
        '">' +
        (res.status ? String(res.status) : 'ERR') +
        (res.statusText ? ' ' + esc(res.statusText) : '') +
        '</span>' +
        '<span class="hub-res-stat">' +
        res.timeMs +
        ' ms</span>' +
        '<span class="hub-res-stat">' +
        fmtSize(res.size) +
        '</span>' +
        '</div>';
    }
    html +=
      '<div class="hub-res-actions">' +
      '<button type="button" class="hub-res-toggle' +
      (view.resView === 'pretty' ? ' is-on' : '') +
      '" data-hub-resview="pretty">' +
      esc(t('apihub.pretty')) +
      '</button>' +
      '<button type="button" class="hub-res-toggle' +
      (view.resView === 'raw' ? ' is-on' : '') +
      '" data-hub-resview="raw">' +
      esc(t('apihub.raw')) +
      '</button>' +
      (res && isJson && view.resView === 'pretty'
        ? '<button type="button" class="hub-res-toggle" data-jexpall="all" data-tip="' +
          escAttr(t('apihub.expandAll')) +
          '" aria-label="' +
          escAttr(t('apihub.expandAll')) +
          '">' +
          icon('arrow-down', '') +
          esc(t('apihub.expandAll')) +
          '</button>' +
          '<button type="button" class="hub-res-toggle" data-jexpall="none" data-tip="' +
          escAttr(t('apihub.collapseAll')) +
          '" aria-label="' +
          escAttr(t('apihub.collapseAll')) +
          '">' +
          icon('arrow-up', '') +
          esc(t('apihub.collapseAll')) +
          '</button>'
        : '') +
      '<button type="button" class="hub-res-toggle" data-hub-act="copyres">' +
      icon('copy', '') +
      esc(t('apihub.copy')) +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="hub-res-body">';
    if (view.running) {
      html += '<div class="hub-res-empty">' + icon('circle-dot', '') + esc(t('apihub.sending')) + '</div>';
    } else if (!res) {
      html += '<div class="hub-res-empty">' + icon('route', '') + esc(t('apihub.emptyRun')) + '</div>';
    } else {
      var body = res.text || '';
      if (view.resView === 'pretty' && isJson) {
        html += '<div class="hub-json" data-hub-jsonbox>' + ensureJsonTree(jsonValue(body)).render() + '</div>';
      } else if (view.resView === 'pretty') {
        html += '<pre class="hub-pre">' + highlightJson(body) + '</pre>';
      } else {
        html += '<pre class="hub-pre">' + esc(body) + '</pre>';
      }
      if (res.headers && res.headers.length) {
        html +=
          '<div class="hub-headers-list">' +
          res.headers
            .map(function (h) {
              return '<div><span>' + esc(h[0]) + '</span><span>' + esc(h[1]) + '</span></div>';
            })
            .join('') +
          '</div>';
      }
    }
    html += '</div>';
    return html;
  }
  function historyHtml() {
    var h = view.history || [];
    var html =
      '<div class="hub-history">' +
      '<div class="hub-history-head">' +
      icon('timer', '') +
      esc(t('apihub.history')) +
      '</div>' +
      '<div class="hub-history-list">';
    if (!h.length) {
      html += '<div class="hub-history-empty">' + esc(t('apihub.noRecent')) + '</div>';
    } else {
      html += h
        .map(function (item) {
          return (
            '<div class="hub-history-item" data-hub-replay="' +
            item.ts +
            '">' +
            '<span class="hub-method ' +
            methodClass(item.method) +
            '">' +
            esc(item.method) +
            '</span>' +
            '<span class="hub-history-path">' +
            esc(item.path) +
            '</span>' +
            '<span class="hub-history-status">' +
            item.status +
            '</span>' +
            '</div>'
          );
        })
        .join('');
    }
    html += '</div></div>';
    return html;
  }
  function runHtml() {
    return (
      '<div class="hub-col hub-run">' +
      '<div class="hub-run-scroll">' +
      requestHtml() +
      responseHtml() +
      '</div>' +
      historyHtml() +
      '</div>'
    );
  }

export { buildUrl, decodeNested, ensureJsonTree, fmtSize, highlightJson, historyHtml, jsonTree, jsonValue, prettyJson, requestHtml, rerunHistory, responseHtml, runHtml, runRequest, selectRoute, statusClass, viewPretty };
