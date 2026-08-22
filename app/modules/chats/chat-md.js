/* ============================================================
 * chat-md.js — 流式 Markdown → 安全 HTML 转换器(零依赖)
 * ------------------------------------------------------------
 * 配合 ai-stream-kit 的 StreamMarkdownRenderer(markdownToHtml)
 * 使用:入参为 autoClose 修补后的 Markdown 文本,输出受控 HTML。
 * 安全模型:
 *   - 先统一转义(shared/escape.js 收敛),再对转义文本做词法变换,
 *     只放行受控标签(<p>/<pre>/<code>/<h1-6>/<ul>/<ol>/<li>/
 *     <blockquote>/<hr>/<br>/<a>/<img>/<span>)
 *   - URL 白名单:http(s) / mailto / # / 站内相对路径,javascript: 一律丢弃
 *   - 代码块带语言标签 + 复制按钮 + 轻量语法高亮(token 类,
 *     颜色经 CSS 变量按深浅主题消费)
 * 纯模块(仅依赖 App.escape),可被 node --test 直接导入。
 * ============================================================ */
'use strict';

var escHtml = App.escape.escHtml;
var escAttr = App.escape.escAttr;

/* ---------- URL 白名单 ---------- */
function safeUrl(url, attr) {
  var u = String(url || '').trim();
  if (!u) return '';
  if (/^(https?:|mailto:)/i.test(u)) return escAttr(u);
  if (u.charAt(0) === '#' || u.charAt(0) === '/') return escAttr(u);
  // 其它协议(javascript:/data: 等)一律丢弃,仅保留文字
  return attr ? '' : escHtml(u);
}

/* ---------- 代码高亮(轻量) ---------- */
var TOKEN_RE =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|new|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|this|super|extends|switch|case|break|continue|default|static|get|set|yield|delete|void|do|interface|type|enum|implements|private|public|protected|readonly|package|namespace|declare|abstract|number|string|boolean|any|unknown|never|object|symbol|bigint|def|print|lambda|None|True|False|elif|pass|raise|with|as|global|nonlocal|select|from|where|insert|update|delete|create|table|join|left|right|inner|outer|on|group|order|by|having|limit|values|into|set|alter|drop|index|primary|key|foreign|references|int|varchar|text|timestamp)\b)|(\b\d+(?:\.\d+)?\b)|([a-zA-Z_$][\w$]*(?=\s*\())/g;

function highlight(code) {
  var out = '';
  var last = 0;
  var m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(code))) {
    if (m.index > last) out += escHtml(code.slice(last, m.index));
    var cls = m[1] ? 'ch-tk-c' : m[2] ? 'ch-tk-s' : m[3] ? 'ch-tk-k' : m[4] ? 'ch-tk-n' : m[5] ? 'ch-tk-f' : '';
    if (cls) out += '<span class="' + cls + '">' + escHtml(m[0]) + '</span>';
    else out += escHtml(m[0]);
    last = m.index + m[0].length;
  }
  if (last < code.length) out += escHtml(code.slice(last));
  return out;
}

/* ---------- 块级分词 ---------- */
function tokenizeBlocks(lines) {
  var blocks = [];
  var i = 0;
  var para = [];
  function flushPara() {
    if (para.length) {
      blocks.push({ type: 'para', lines: para });
      para = [];
    }
  }
  while (i < lines.length) {
    var line = lines[i];
    var fence = /^(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      flushPara();
      var char = fence[1][0];
      var lang = fence[2].trim().split(/\s+/)[0];
      var code = [];
      i++;
      while (i < lines.length) {
        var close = /^(`{3,}|~{3,})\s*$/.exec(lines[i]);
        if (close && close[1][0] === char) break;
        code.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lang: lang, code: code.join('\n') });
      i++;
      continue;
    }
    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }
    var h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      blocks.push({ type: 'heading', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    var q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      var quote = [];
      while (i < lines.length) {
        var qm = /^>\s?(.*)$/.exec(lines[i]);
        if (!qm) break;
        quote.push(qm[1]);
        i++;
      }
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }
    if (/^\s*([-*+])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flushPara();
      var list = [];
      var ordered = /^\s*\d+[.)]\s+/.test(line);
      while (i < lines.length) {
        var lm = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!lm) break;
        list.push(lm[1]);
        i++;
      }
      blocks.push({ type: 'list', ordered: ordered, items: list });
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushPara();
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

/* ---------- 行内词法 ----------
 * 入参为未转义原始文本;对字面内容统一经 escHtml 转义后输出,
 * 仅放行受控标签(块级转义职责在 renderBlock / highlight)。
 */
function inline(text) {
  var out = '';
  var buf = '';
  function flush() {
    if (buf) {
      out += escHtml(buf);
      buf = '';
    }
  }
  var i = 0;
  var n = text.length;
  while (i < n) {
    var ch = text[i];
    if (ch === '`') {
      var end = text.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        out += '<code>' + escHtml(text.slice(i + 1, end)) + '</code>';
        i = end + 1;
        continue;
      }
      buf += '`';
      i++;
      continue;
    }
    if (ch === '~' && text[i + 1] === '~') {
      var se = text.indexOf('~~', i + 2);
      if (se !== -1) {
        flush();
        out += '<del>' + inline(text.slice(i + 2, se)) + '</del>';
        i = se + 2;
        continue;
      }
      buf += '~~';
      i += 2;
      continue;
    }
    if (ch === '!' && text[i + 1] === '[') {
      var im = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(text.slice(i));
      if (im) {
        flush();
        var src = safeUrl(im[2], true);
        if (src) {
          out += '<img src="' + src + '" alt="' + escAttr(im[1] || '') + '" loading="lazy" />';
        } else {
          out += '![' + escHtml(im[1]) + '](' + escHtml(im[2]) + ')';
        }
        i += im[0].length;
        continue;
      }
      buf += '!';
      i++;
      continue;
    }
    if (ch === '[') {
      var lm = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(text.slice(i));
      if (lm) {
        flush();
        var href = safeUrl(lm[2], true);
        if (href) {
          out += '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + inline(lm[1] || '') + '</a>';
        } else {
          out += '[' + escHtml(lm[1]) + '](' + escHtml(lm[2]) + ')';
        }
        i += lm[0].length;
        continue;
      }
      buf += '[';
      i++;
      continue;
    }
    if (ch === '*' && text[i + 1] === '*') {
      var be = findMarker(text, i + 2, '**');
      if (be !== -1) {
        flush();
        out += '<strong>' + inline(text.slice(i + 2, be)) + '</strong>';
        i = be + 2;
        continue;
      }
      buf += '**';
      i += 2;
      continue;
    }
    if (ch === '_' && text[i + 1] === '_') {
      var ue = findMarker(text, i + 2, '__');
      if (ue !== -1) {
        flush();
        out += '<strong>' + inline(text.slice(i + 2, ue)) + '</strong>';
        i = ue + 2;
        continue;
      }
      buf += '__';
      i += 2;
      continue;
    }
    if (ch === '*') {
      var ie = findMarker(text, i + 1, '*');
      if (ie !== -1) {
        flush();
        out += '<em>' + inline(text.slice(i + 1, ie)) + '</em>';
        i = ie + 1;
        continue;
      }
      buf += '*';
      i++;
      continue;
    }
    if (ch === '_') {
      var iae = findMarker(text, i + 1, '_');
      if (iae !== -1) {
        flush();
        out += '<em>' + inline(text.slice(i + 1, iae)) + '</em>';
        i = iae + 1;
        continue;
      }
      buf += '_';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** 找结束标记(跳过成对 ** 嵌套:遇到新开启的 ** 则层级+1) */
function findMarker(text, start, marker) {
  var depth = 1;
  var i = start;
  var n = text.length;
  while (i < n) {
    var idx = text.indexOf(marker, i);
    if (idx === -1) return -1;
    // 检查是否与其它标记重叠(如 ***)
    if (text[idx + marker.length] === marker[0]) {
      // *** 双闭合场景:向前吃掉一层
      depth++;
      i = idx + marker.length;
      continue;
    }
    depth--;
    if (depth === 0) return idx;
    i = idx + marker.length;
  }
  return -1;
}

/* ---------- 块渲染 ---------- */
function renderBlock(block) {
  if (block.type === 'code') {
    var lang = block.lang ? escAttr(block.lang) : '';
    return (
      '<div class="ch-code"><div class="ch-code-head"><span class="ch-code-lang">' +
      (lang ? escHtml(block.lang) : '') +
      '</span><button type="button" class="ch-code-copy" data-ch-act="copy-code" data-code="' +
      escAttr(block.code) +
      '" aria-label="' +
      escAttr(block.lang || 'code') +
      '">' +
      copySvg() +
      '</button></div><pre><code class="' +
      (lang ? 'lang-' + lang : '') +
      '">' +
      highlight(block.code) +
      '</code></pre></div>'
    );
  }
  if (block.type === 'heading') {
    return '<h' + block.level + '>' + inline(block.text) + '</h' + block.level + '>';
  }
  if (block.type === 'quote') {
    return '<blockquote>' + block.lines.map(function (l) { return '<p>' + inline(l) + '</p>'; }).join('') + '</blockquote>';
  }
  if (block.type === 'list') {
    var tag = block.ordered ? 'ol' : 'ul';
    return '<' + tag + '>' + block.items.map(function (it) { return '<li>' + inline(it) + '</li>'; }).join('') + '</' + tag + '>';
  }
  if (block.type === 'hr') return '<hr />';
  return '<p>' + block.lines.map(function (l) { return inline(l); }).join('<br />') + '</p>';
}

function copySvg() {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
  );
}

/**
 * 主入口:Markdown(已 autoClose 修补)→ 安全 HTML
 * 原始文本先做块级分词(结构化字符不受转义影响),转义在
 * 渲染期逐段完成(renderBlock → inline / highlight / escHtml)。
 */
export function mdToHtml(md) {
  var lines = String(md == null ? '' : md).split('\n');
  var blocks = tokenizeBlocks(lines);
  return blocks.map(renderBlock).join('\n');
}

/** 纯文本 → 段落化 HTML(思维链等非 Markdown 场景,pre-wrap) */
export function textToHtml(text) {
  return '<p>' + escHtml(text).replace(/\n/g, '<br />') + '</p>';
}
