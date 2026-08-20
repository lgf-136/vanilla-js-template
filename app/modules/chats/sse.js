/* ============================================================
 * sse.js — 流式对话 SSE 客户端(chats 模块专用依赖)
 * ------------------------------------------------------------
 * App.sse.stream(opts):对 POST /api/chats/chat 发起流式请求,
 * 渐进读取 text/event-stream 帧,按事件回调。零依赖。
 *
 * 用法:
 *   App.sse.stream({
 *     url: '/api/chats/chat',
 *     body: { conversationId, providerKey, model, params, ... },
 *     onEvent(type, data){ ... },   // reasoning/text/tool/usage/error...
 *     onDone(){ ... },
 *     onError(err){ ... },
 *     signal,                        // 可传入 AbortController.signal
 *   })
 *
 * 兼容 401(会话失效 → App.auth.onUnauthorized),其余非 2xx 报错回调。
 * 服务端事件见 server/modules/chats/ai.js 顶部协议说明。
 * ============================================================ */
(function () {
  'use strict';

  function escJson(text) {
    return String(text == null ? '' : text);
  }

  /** 解析单个 SSE 帧行集合 → { event, data } */
  function parseFrame(lines) {
    var event = 'message';
    var data = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.charAt(0) === ':') continue; // 空行与注释
      var colon = line.indexOf(':');
      var field = colon === -1 ? line : line.slice(0, colon);
      var val = colon === -1 ? '' : line.slice(colon + 1);
      if (val.charAt(0) === ' ') val = val.slice(1);
      if (field === 'event') event = val;
      else if (field === 'data') data = data ? data + '\n' + val : val;
    }
    return { event: event, data: data };
  }

  function tryParse(text) {
    try {
      return text ? JSON.parse(text) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 发起流式请求。返回 { abort() }。
   * onEvent(type, data) 在每次完整事件触发;onDone 在流结束时触发。
   * 服务端错误会在 onEvent('error', {...}) 中送达;连接层失败走 onError。
   */
  function stream(opts) {
    var o = opts || {};
    var controller = new AbortController();
    var userSignal = o.signal;
    if (userSignal) {
      if (userSignal.aborted) controller.abort();
      else {
        userSignal.addEventListener('abort', function onAbort() {
          controller.abort();
        });
      }
    }
    var cancelled = false;

    var headers = { 'Cache-Control': 'no-store', Accept: 'text/event-stream' };
    var token = App.auth ? App.auth.token() : null;
    if (token) headers['x-auth-token'] = token;
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';

    fetch(o.url || '/api/chats/chat', {
      method: 'POST',
      headers: headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: controller.signal,
    })
      .then(function (res) {
        if (res.status === 401) {
          if (App.auth && typeof App.auth.onUnauthorized === 'function') App.auth.onUnauthorized();
          var err = new Error('未授权');
          err.status = 401;
          throw err;
        }
        if (!res.ok) {
          return res.text().then(function (text) {
            var data = tryParse(text);
            throw new Error((data && data.message) || 'HTTP ' + res.status);
          });
        }
        if (!res.body || typeof res.body.getReader !== 'function') {
          throw new Error('当前环境不支持流式读取');
        }
        return readStream(res.body, function (frame) {
          if (cancelled) return;
          var ev = frame.event;
          var data = tryParse(frame.data);
          if (typeof o.onEvent === 'function') o.onEvent(ev, data);
        });
      })
      .then(function () {
        if (!cancelled && typeof o.onDone === 'function') o.onDone();
      })
      .catch(function (e) {
        if (cancelled) return;
        if (typeof o.onError === 'function') o.onError(e);
      });

    return {
      abort: function () {
        cancelled = true;
        try {
          controller.abort();
        } catch (e) {
          /* noop */
        }
      },
    };
  }

  /** 逐行读取 SSE 并组装帧,遇到空行即回调一帧 */
  function readStream(body, onFrame) {
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var frameLines = [];
    return (function pump() {
      return reader.read().then(function (result) {
        if (result.done) {
          // 结尾残留帧(部分实现无末行空行)
          if (frameLines.length) onFrame(parseFrame(frameLines));
          return;
        }
        buffer += decoder.decode(result.value, { stream: true });
        var idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          var line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.charAt(line.length - 1) === '\r') line = line.slice(0, -1);
          if (line === '') {
            // 空行 → 帧结束
            if (frameLines.length) {
              onFrame(parseFrame(frameLines));
              frameLines = [];
            }
          } else {
            frameLines.push(line);
          }
        }
        return pump();
      });
    })();
  }

  /** 简易复制到剪贴板(供复制按钮复用) */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(String(text == null ? '' : text)).catch(function () {
        return null;
      });
    }
    return Promise.resolve(null);
  }

  window.App = window.App || {};
  App.sse = {
    stream: stream,
    copyText: copyText,
    escJson: escJson,
  };
})();
