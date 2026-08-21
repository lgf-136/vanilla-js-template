/**
 * scripts/build.js — 生产构建（`just build`，无打包器）
 * 产出 dist/（可直接静态托管），保留模板的目录结构与动态脚本路径。
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const ROOT = resolve(join(import.meta.dirname, '..'));
const DIST = join(ROOT, 'dist');
const COPY_ITEMS = ['index.html', 'app', 'public', 'shared'];
// 说明：shared/ 含运行时 HTML 转义 helper（shared/escape.js，红线 13），
// 随 index.html/app/public 一并复制进 dist/；其余共享常量仍仅供测试引用。

function charCode(char) {
  return char ? char.charCodeAt(0) : 0;
}

function isWhitespace(char) {
  const code = charCode(char);
  return code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32;
}

function isWordChar(char) {
  const code = charCode(char);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    char === '_' ||
    char === '$'
  );
}

function isAsciiLetter(char) {
  const code = charCode(char);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function needsSeparator(previous, next) {
  if (isWordChar(previous) && isWordChar(next)) return true;
  if (isWordChar(previous) && (next === '{' || next === '[')) return true;
  if ((previous === '+' && next === '+') || (previous === '-' && next === '-')) return true;
  if ((previous === '>' && next === '>') || (previous === '<' && next === '<')) return true;
  if ((previous === '&' && next === '&') || (previous === '|' && next === '|')) return true;
  return false;
}

function regexCanStart(lastToken) {
  return lastToken === 'operator' || lastToken === 'open';
}

function minifyJavaScript(source) {
  let output = '';
  let index = 0;
  let lastToken = 'operator';
  let pendingSeparator = false;

  function append(value, token) {
    const previous = output.charAt(output.length - 1);
    const next = value.charAt(0);
    if (pendingSeparator && needsSeparator(previous, next) && output && !isWhitespace(previous)) {
      output += ' ';
    }
    pendingSeparator = false;
    output += value;
    if (token) lastToken = token;
  }

  while (index < source.length) {
    const char = source[index];

    if (isWhitespace(char)) {
      while (index < source.length && isWhitespace(source[index])) index += 1;
      const next = source[index] || '';
      if (needsSeparator(output.charAt(output.length - 1), next)) pendingSeparator = true;
      continue;
    }

    if (char === '/' && source[index + 1] === '/') {
      index += 2;
      while (index < source.length && charCode(source[index]) !== 10 && charCode(source[index]) !== 13) index += 1;
      pendingSeparator = true;
      continue;
    }

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      pendingSeparator = true;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let end = index + 1;
      while (end < source.length) {
        if (charCode(source[end]) === 92) {
          end += 2;
        } else if (source[end] === quote) {
          end += 1;
          break;
        } else {
          end += 1;
        }
      }
      append(source.slice(index, end), 'literal');
      index = end;
      continue;
    }

    if (char === '`') {
      let end = index + 1;
      while (end < source.length) {
        if (charCode(source[end]) === 92) {
          end += 2;
        } else if (source[end] === '`') {
          end += 1;
          break;
        } else {
          end += 1;
        }
      }
      append(source.slice(index, end), 'literal');
      index = end;
      continue;
    }

    if (char === '/' && regexCanStart(lastToken)) {
      let end = index + 1;
      let inCharacterClass = false;
      while (end < source.length) {
        if (charCode(source[end]) === 92) {
          end += 2;
        } else if (source[end] === '[') {
          inCharacterClass = true;
          end += 1;
        } else if (source[end] === ']') {
          inCharacterClass = false;
          end += 1;
        } else if (source[end] === '/' && !inCharacterClass) {
          end += 1;
          while (isAsciiLetter(source[end])) end += 1;
          break;
        } else {
          end += 1;
        }
      }
      append(source.slice(index, end), 'literal');
      index = end;
      continue;
    }

    const token = isWordChar(char)
      ? 'keyword'
      : char === '(' || char === '[' || char === '{'
        ? 'open'
        : char === ')' || char === ']' || char === '}'
          ? 'close'
          : 'operator';
    append(char, token);
    index += 1;
  }

  return output;
}

function minifyCss(source) {
  return source
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) return '';
      return line.trimEnd();
    })
    .join('\n')
    .split('\n\n\n').join('\n\n');
}

function minify(source, extension) {
  return extension === '.js' ? minifyJavaScript(source) : minifyCss(source);
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function hash8(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

function collectStaticReferences(html) {
  const attributes = ['href="', 'src="', 'data-nova-href="', 'data-nova-src="'];
  const references = [];
  for (const attribute of attributes) {
    let cursor = 0;
    while (cursor < html.length) {
      const start = html.indexOf(attribute, cursor);
      if (start === -1) break;
      const valueStart = start + attribute.length;
      const valueEnd = html.indexOf('"', valueStart);
      if (valueEnd === -1) break;
      const value = html.slice(valueStart, valueEnd);
      if (value.startsWith('/app/') || value.startsWith('/public/')) references.push(value);
      cursor = valueEnd + 1;
    }
  }
  return [...new Set(references)];
}

async function main() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  for (const item of COPY_ITEMS) {
    cpSync(join(ROOT, item), join(DIST, item), { recursive: true });
  }

  for (const file of walk(DIST)) {
    if (file.endsWith('.test.js')) rmSync(file);
  }

  for (const file of walk(DIST)) {
    if (!file.endsWith('.js') && !file.endsWith('.css')) continue;
    if (file.endsWith(join('app', 'lib', 'chart.umd.js'))) continue;
    const extension = file.endsWith('.js') ? '.js' : '.css';
    const content = readFileSync(file, 'utf8');
    writeFileSync(file, minify(content, extension));
  }

  const indexPath = join(DIST, 'index.html');
  const html = readFileSync(indexPath, 'utf8');
  let fingerprintedHtml = html;
  for (const reference of collectStaticReferences(html)) {
    const file = join(DIST, reference);
    const content = readFileSync(file, 'utf8');
    const fingerprinted = reference.includes('?') ? reference : `${reference}?v=${hash8(content)}`;
    fingerprintedHtml = fingerprintedHtml.split(reference).join(fingerprinted);
  }
  writeFileSync(indexPath, fingerprintedHtml.split(/\s+/).join(' ').split('><').join('>\n<'));

  let total = 0;
  for (const file of walk(DIST)) total += statSync(file).size;
  console.log(`[build] dist/ 完成（共 ${(total / 1024).toFixed(1)}KB），文件结构与动态 import 路径保持不变`);
}

main().catch((error) => {
  console.error('[build] 失败:', error);
  process.exit(1);
});
