/* ============================================================
 * md.js — 流式 Markdown 渲染器(零依赖,chats 模块专用)
 * ------------------------------------------------------------
 * 由模块 manifest deps 预加载为 window.App.md。流式渲染安全:
 *   - 先转义 HTML,再套用规则,杜绝注入;
 *   - 未闭合的代码围栏自动闭合(safeRender),避免流式中途崩坏;
 *   - 链接/图片 URL 白名单(仅 http(s)/mailto/#/相对),拦截 javascript:。
 * 支持:标题 / 段落 / 加粗 / 斜体 / 删除线 / 行内与块级代码 / 链接 /
 * 图片 / 有序无序列表 / 任务列表 / 引用 / 表格 / 分割线。
 * 样式完全交给 module.css(.cm-md *)消费 token,此处不产出色值。
 * ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeUrl(url) {
    var u = String(url || '').trim();
    if (!u) return '#';
    if (u.indexOf('data:') === 0 && u.indexOf('data:image/') === 0) return u;
    if (u.charAt(0) === '#') return u;
    if (/^\/{1,2}/.test(u)) return u;
    if (/^https?:\/\//i.test(u)) return u;
    if (/^mailto:/i.test(u)) return u;
    return '#';
  }

  /** 行内规则(输入已转义) */
  function inline(src, inHeading) {
    var s = src;
    // 行内代码(优先)
    s = s.replace(/`([^`]+)`/g, function (m, code) {
      return '<code>' + code + '</code>';
    });
    // 删除线
    s = s.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
    // 加粗(允许 _ 或 *)
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^_])_([^_]+?)_(?!_)/g, '$1<em>$2</em>');
    // 图片
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']?[^"')]*)?\)/g, function (m, alt, url) {
      var u = safeUrl(url);
      return '<img src="' + u + '" alt="' + alt + '" loading="lazy" />';
    });
    // 链接
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, text, url) {
      var u = safeUrl(url);
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
    });
    if (!inHeading) {
      s = s.replace(/(^|\s)---(\s|$)/g, '$1&mdash;$2');
    }
    return s;
  }

  /** 段落分块(理解代码围栏/表格/列表分组) */
  function blocks(md) {
    var lines = String(md || '').split('\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      // 代码围栏
      if (/^```/.test(trimmed)) {
        var lang = trimmed.replace(/^```/, '').trim();
        var code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trimStart())) {
          code.push(lines[i]);
          i++;
        }
        i++; // 跳过闭合围栏(可能不存在 → 流式中自动闭合,不报错)
        out.push({ type: 'code', lang: lang, code: code.join('\n') });
        continue;
      }
      // 分割线
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line) || /^\s*---+$/.test(line)) {
        out.push({ type: 'hr' });
        i++;
        continue;
      }
      // 标题
      var hm = /^(\s{0,3})(#{1,6})\s+(.*)$/.exec(line);
      if (hm) {
        out.push({ type: 'h', level: hm[2].length, text: inline(hm[3], true) });
        i++;
        continue;
      }
      // 引用:连续 > 行
      if (/^\s*>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push({ type: 'quote', text: inline(quote.join('\n')) });
        continue;
      }
      // 表格:当前行含 | 且次行为分隔线
      if (
        line.indexOf('|') !== -1 &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim()) &&
        /-/.test(lines[i + 1])
      ) {
        var header = line.split('|').map(function (c) {
          return c.trim();
        }).filter(function (c) {
          return c !== '';
        });
        var rows = [];
        i += 2;
        while (i < lines.length && lines[i].indexOf('|') !== -1) {
          var cells = lines[i].split('|').map(function (c) {
            return c.trim();
          }).filter(function (c) {
            return c !== '';
          });
          rows.push(cells);
          i++;
        }
        out.push({ type: 'table', header: header, rows: rows });
        continue;
      }
      // 无序列表(含任务项)
      if (/^\s*([-*+])\s+/.test(line)) {
        var ul = [];
        while (i < lines.length) {
          var lm = /^\s*([-*+])\s+(.*)$/.exec(lines[i]);
          if (!lm) break;
          var body = lm[2];
          var task = /^\[([ xX])\]\s+(.*)$/.exec(body);
          if (task) {
            var checked = task[1].toLowerCase() === 'x';
            ul.push({
              task: true,
              checked: checked,
              text: inline(task[2]),
            });
          } else {
            ul.push({ task: false, text: inline(body) });
          }
          i++;
        }
        out.push({ type: 'ul', items: ul });
        continue;
      }
      // 有序列表
      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < lines.length) {
          var om = /^\s*\d+\.\s+(.*)$/.exec(lines[i]);
          if (!om) break;
          ol.push(inline(om[1]));
          i++;
        }
        out.push({ type: 'ol', items: ol });
        continue;
      }
      // 空行
      if (!trimmed) {
        i++;
        continue;
      }
      // 普通段落(收集到下一个空行/块级前)
      var para = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^```/.test(lines[i].trimStart()) &&
        !/^\s*#{1,6}\s/.test(lines[i]) &&
        !/^\s*>/ .test(lines[i]) &&
        !/^\s*([-*+])\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      if (para.length) {
        // 连续两空格换行 → <br>
        out.push({ type: 'p', text: inline(para.join('\n').replace(/\n/g, '\n')) });
      }
    }
    return out;
  }

  function renderBlock(b) {
    switch (b.type) {
      case 'h':
        return '<h' + b.level + '>' + b.text + '</h' + b.level + '>';
      case 'p':
        return '<p>' + b.text.replace(/\n/g, '<br />') + '</p>';
      case 'hr':
        return '<hr />';
      case 'code':
        return (
          '<div class="cm-code" data-lang="' + esc(b.lang) + '">' +
          '<pre><code' + (b.lang ? ' class="language-' + esc(b.lang) + '"' : '') + '>' + esc(b.code) + '</code></pre>' +
          '</div>'
        );
      case 'quote':
        return '<blockquote>' + b.text + '</blockquote>';
      case 'ul':
        return (
          '<ul>' +
          b.items
            .map(function (it) {
              if (it.task) {
                return (
                  '<li class="cm-task' + (it.checked ? ' is-done' : '') + '">' +
                  '<span class="cm-task-box">' +
                  (it.checked
                    ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
                    : '') +
                  '</span>' +
                  it.text +
                  '</li>'
                );
              }
              return '<li>' + it.text + '</li>';
            })
            .join('') +
          '</ul>'
        );
      case 'ol':
        return '<ol>' + b.items.map(function (it) { return '<li>' + it + '</li>'; }).join('') + '</ol>';
      case 'table':
        var htmlHead =
          '<thead><tr>' +
          b.header.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
          '</tr></thead>';
        var htmlBody =
          '<tbody>' +
          b.rows
            .map(function (r) {
              return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
            })
            .join('') +
          '</tbody>';
        return '<div class="cm-table-wrap"><table>' + htmlHead + htmlBody + '</table></div>';
    }
    return '';
  }

  /** 未闭合的代码围栏自动闭合,保证流式中途渲染不崩 */
  function autoCloseFence(md) {
    var counts = (String(md || '').match(/```/g) || []).length;
    var src = String(md || '');
    if (counts % 2 === 1) src += '\n```';
    return src;
  }

  function render(md) {
    var blks = blocks(autoCloseFence(md));
    return blks.map(renderBlock).join('');
  }

  window.App = window.App || {};
  App.md = {
    render: render,
    esc: esc,
    safeUrl: safeUrl,
    inline: inline,
    blocks: blocks,
  };
})();
