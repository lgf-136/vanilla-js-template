/* ============================================================
 * logger.js — 浏览器端日志系统(零依赖)
 * ------------------------------------------------------------
 * - 分级:debug / info / warn / error,控制台按等级着色
 * - 自动定位调用位置:通过调用栈提取【文件 + 函数 + 行号】,
 *   输出形如  [One API] ERROR [dashboard] module.js#pageProfile:42 消息
 * - 全局捕获:window.onerror / unhandledrejection 自动上报,
 *   未捕获异常也能看到文件/函数/行号与完整堆栈
 * - 用法:App.logger.error('dashboard', '渲染失败', err)
 *         App.logger.info('boot', '启动完成')
 *         App.logger.setLevel('warn')  // 过滤低等级
 * ============================================================ */
(function () {
  'use strict';

  var PROJECT = 'One API';
  var LEVELS = ['debug', 'info', 'warn', 'error'];
  var currentLevel = 'debug';

  /** 控制台 %c 样式:等级徽标 + 模块标签 */
  var STYLES = {
    badge: {
      debug: 'background:var(--nova-ink);color:var(--nova-cyan);font-weight:700;border-radius:3px;padding:0 calc(var(--spacing) * 1.25)',
      info: 'background:var(--nova-cyan);color:var(--nova-white);font-weight:700;border-radius:3px;padding:0 calc(var(--spacing) * 1.25)',
      warn: 'background:var(--nova-warning);color:var(--nova-white);font-weight:700;border-radius:3px;padding:0 calc(var(--spacing) * 1.25)',
      error: 'background:var(--nova-danger);color:var(--nova-white);font-weight:700;border-radius:3px;padding:0 calc(var(--spacing) * 1.25)',
    },
    project: 'color:var(--nova-purple);font-weight:700',
    module: 'color:var(--nova-muted)',
    loc: 'color:var(--nova-muted);font-style:italic',
  };

  var METHOD = { debug: 'debug', info: 'info', warn: 'warn', error: 'error' };

  /* ---------- 堆栈解析 ---------- */
  /** 解析单行堆栈 → { fn, file, line, col }(兼容 Chrome/Edge/Firefox/Safari) */
  function parseStackLine(line) {
    var t = String(line).trim();
    var m = t.match(/at\s+(.*?)\s*\((.*?):(\d+):(\d+)\)\s*$/); // at fn (url:l:c)
    if (m) return { fn: m[1], file: m[2], line: +m[3], col: +m[4] };
    m = t.match(/at\s+(.*?):(\d+):(\d+)\s*$/); // at url:l:c
    if (m) return { fn: '', file: m[1], line: +m[2], col: +m[3] };
    m = t.match(/^(.*?)@(.*?):(\d+):(\d+)$/); // Firefox: fn@url:l:c
    if (m) return { fn: m[1], file: m[2], line: +m[3], col: +m[4] };
    return null;
  }

  /** 去掉协议/host,保留相对路径(便于一眼定位) */
  function displayFile(url) {
    var f = String(url || '');
    f = f.replace(/^https?:\/\/[^/]+/, '');
    f = f.replace(/^file:\/\/\//, '');
    f = f.split('?')[0].split('#')[0];
    if (f.charAt(0) === '/') f = f.slice(1);
    return f;
  }

  /** 提取调用者信息:跳过 logger.js 内部帧,取第一个外部帧 */
  function callerFrame() {
    var stack = new Error().stack;
    if (!stack) return null;
    var lines = stack.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var f = parseStackLine(lines[i]);
      if (!f || !f.file) continue;
      if (f.file.indexOf('logger.js') !== -1) continue; // logger 内部帧
      var fn = (f.fn || '(anonymous)').replace(/^Object\./, ''); // Chrome 的 Object.fn → fn
      return { fn: fn, file: displayFile(f.file), line: f.line, col: f.col };
    }
    return null;
  }

  /* ---------- 核心输出 ---------- */
  function log(level, moduleId, message, data) {
    if (LEVELS.indexOf(level) === -1) level = 'info';
    if (LEVELS.indexOf(level) < LEVELS.indexOf(currentLevel)) return;
    var caller = callerFrame();
    var loc = caller ? ' ' + caller.file + '#' + caller.fn + ':' + caller.line : '';
    var prefix =
      '%c[' +
      PROJECT +
      ']%c %c' +
      level.toUpperCase() +
      '%c %c[' +
      moduleId +
      ']%c' +
      loc +
      ' ' +
      message;
    var args = [prefix, STYLES.project, '', STYLES.badge[level], '', STYLES.module, ''];
    var fn = console[METHOD[level]] || console.log;
    fn.apply(console, args);
    // 附加数据:Error 直接交给控制台渲染(完整可点击堆栈);对象打印明细
    if (data instanceof Error) {
      fn(data);
    } else if (data !== undefined) {
      fn(data);
    }
  }

  var logger = {
    log: log,
    debug: function (m, msg, data) {
      log('debug', m, msg, data);
    },
    info: function (m, msg, data) {
      log('info', m, msg, data);
    },
    warn: function (m, msg, data) {
      log('warn', m, msg, data);
    },
    error: function (m, msg, data) {
      log('error', m, msg, data);
    },
    setLevel: function (lv) {
      if (LEVELS.indexOf(lv) !== -1) currentLevel = lv;
    },
    getLevel: function () {
      return currentLevel;
    },
    /** 暴露解析/定位能力,便于模块自定义输出 */
    parseStackLine: parseStackLine,
    callerFrame: callerFrame,
    displayFile: displayFile,
  };

  /* ---------- 全局错误捕获 ---------- */
  window.addEventListener('error', function (ev) {
    var err = ev.error || null;
    var detail =
      err instanceof Error && err.stack
        ? err
        : {
            message: ev.message,
            file: displayFile(ev.filename),
            line: ev.lineno,
            col: ev.colno,
            stack: err && err.stack,
          };
    logger.error('global', '未捕获异常: ' + (ev.message || 'unknown'), detail);
  });

  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    logger.error('global', '未处理的 Promise 拒绝', r instanceof Error ? r : { reason: r });
  });

  window.App = window.App || {};
  App.logger = logger;
})();
