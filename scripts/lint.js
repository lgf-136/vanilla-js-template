/**
 * scripts/lint.js — 手写规则脚本（`just lint`）
 *  - 语法：node --check（每个 .js 文件）
 *  - 禁用模式：window.alert/confirm/prompt、document.write、eval(、new Function(、console.log(、
 *    私有转义函数（统一收敛 shared/escape.js，红线 13）
 *  - 样式规则：app/ 下的 JS/CSS 禁止硬编码十六进制颜色（tokens.css 除外；rgb/hsl/oklch 靠评审）
 *  - 模块边界：app/modules/<A>/ 内部禁止 import app/modules/<B>/ 的文件（红线 4）
 *  - 行数预算：单文件 ≤ 500 行（.js 与 .css；存量超标 .js 在 LEGACY_OVERSIZED 挂账，只许减少不许增加，红线 12）
 *  - 格式：禁止 Tab 缩进
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(join(import.meta.dirname, '..'));

const SCAN_DIRS = ['app', 'server', 'shared', 'scripts', 'tests', 'api'];

/** 红线 12：单文件行数上限 */
const MAX_LINES = 500;
/** 第三方/自动生成产物，不参与行数与颜色检查 */
const VENDORED_PREFIX = 'app/lib/';
/** 存量超 500 行的技术债清单：拆分后必须从此处移除，禁止新增条目 */
const LEGACY_OVERSIZED = new Set([
  'app/core/app.js',
  'app/core/i18n.js',
  'app/core/settings.js',
  'app/components/layout/shell.js',
  'app/components/ui/color-picker.js',
  'app/components/ui/data-table.js',
  'app/components/ui/group-tree.js',
  'app/components/ui/tag-picker.js',
  'app/components/ui/ui.js',
  'app/modules/apihub/index.js',
  'app/modules/chats/index.js',
  'app/modules/dashboard/index.js',
  'app/modules/settings/index.js',
  'app/modules/tasks/index.js',
  'server/modules/apihub/service.js',
]);

const BANNED_PATTERNS = [
  { re: /\bwindow\.(alert|confirm|prompt)\s*\(/, msg: '禁止 window.alert/confirm/prompt（用 ui-toast / ui-confirm / ui-dialog）' },
  { re: /\bdocument\.write\s*\(/, msg: '禁止 document.write' },
  { re: /\beval\s*\(/, msg: '禁止 eval(' },
  { re: /\bnew\s+Function\s*\(/, msg: '禁止 new Function(' },
  { re: /\bconsole\.log\s*\(/, msg: '禁止 console.log（仅客户端代码；scripts 与适配器日志允许）' },
  {
    re: /\bfunction\s+(esc|escHtml|escAttr|escapeHtml)\s*\(/,
    msg: '禁止私有转义函数（统一使用 shared/escape.js 的 App.escape，红线 13）',
    /** 唯一豁免：shared/escape.js 本体 */
    exempt: (relPath) => relPath === 'shared/escape.js',
  },
];

/** console.log 禁令只适用于浏览器运行时代码 */
const CONSOLE_LOG_ONLY_CLIENT = true;

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

let errors = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'data') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function checkSyntax(file) {
  if (!file.endsWith('.js')) return;
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    errors.push(`语法错误 ${rel(file)}:\n${res.stderr || res.stdout}`);
  }
}

function checkBanned(file) {
  const isJs = file.endsWith('.js');
  if (!isJs && !file.endsWith('.css')) return;
  // lint 自身必然包含禁用模式字样，跳过自检
  if (file.endsWith('scripts/lint.js')) return;
  const src = readFileSync(file, 'utf8');
  if (isJs) {
    for (const { re, msg, exempt } of BANNED_PATTERNS) {
      if (msg.includes('console.log') && !file.startsWith(join(ROOT, 'app'))) continue;
      if (exempt && exempt(rel(file))) continue;
      const m = src.match(re);
      if (m) errors.push(`${msg} → ${rel(file)}:${lineOf(src, m.index)}`);
    }
    if (src.includes('\t')) {
      errors.push(`禁止 Tab 缩进 → ${rel(file)}`);
    }
    checkModuleBoundary(file, src);
  }
  checkLineBudget(file, src);
  // 样式硬编码颜色检查（app/ 下 JS 内嵌样式与 CSS 文件）。
  // token 样式表与模板随附的静态 SVG/Chart.js 资源本身就是颜色定义，
  // 不应被当作业务组件样式重复改写。
  const tokenSheet = file.endsWith('tokens.css') || file.endsWith('semantic-tokens.css');
  const staticColorAsset = file.endsWith(join('app', 'components', 'ui', 'icons.js')) || file.endsWith(join('app', 'lib', 'chart.umd.js'));
  if (file.startsWith(join(ROOT, 'app')) && !tokenSheet && !staticColorAsset) {
    const m = src.match(HEX_COLOR);
    if (m) errors.push(`禁止硬编码十六进制颜色（色值 ${m[0]}，应消费 tokens.css 变量）→ ${rel(file)}:${lineOf(src, m.index)}`);
  }
}

function rel(file) {
  return file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file;
}

/** 红线 4：app/modules/<A>/ 内部文件不得 import app/modules/<B>/ 的文件 */
function checkModuleBoundary(file, src) {
  const relPosix = rel(file).split(sep).join('/');
  const owner = relPosix.match(/^app\/modules\/([^/]+)\//);
  if (!owner) return; // registry.js 等登记点不在模块目录内，不受限
  const IMPORT_RE = /(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const resolved = posix.normalize(posix.join(posix.dirname(relPosix), m[1]));
    const target = resolved.match(/^app\/modules\/([^/]+)\//);
    if (target && target[1] !== owner[1]) {
      errors.push(`禁止跨模块 import（${owner[1]} → ${target[1]}），应上移 components/ui 或 shared/ → ${rel(file)}:${lineOf(src, m.index)}`);
    }
  }
}

/** 红线 12：单文件 ≤ 500 行（.js 与 .css），存量超标文件挂账 LEGACY_OVERSIZED */
function checkLineBudget(file, src) {
  const isJs = file.endsWith('.js');
  if (!isJs && !file.endsWith('.css')) return;
  const relPosix = rel(file).split(sep).join('/');
  if (relPosix.startsWith(VENDORED_PREFIX) || LEGACY_OVERSIZED.has(relPosix)) return;
  // tokens.css 是模板预构建的 Tailwind v4 产物（自动生成代码，红线 12 豁免；见 docs/bug/ui-css.md）
  if (!isJs && relPosix === 'app/styles/tokens.css') return;
  const lines = src.split('\n').length;
  if (lines > MAX_LINES) {
    errors.push(`单文件 ${lines} 行超过 ${MAX_LINES} 行上限，必须按业务职责拆分 → ${rel(file)}`);
  }
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

for (const dir of SCAN_DIRS) {
  const base = join(ROOT, dir);
  if (!statSync(base, { throwIfNoEntry: false })?.isDirectory()) continue;
  for (const file of walk(base)) {
    checkSyntax(file);
    checkBanned(file);
  }
}

// ---- 退出 ----
if (errors.length) {
  console.error(`lint 失败（${errors.length} 个问题）：\n\n` + errors.join('\n\n'));
  process.exit(1);
}
console.log('[lint] 通过：语法 OK、无禁用模式、转义函数已收敛、无硬编码颜色(hex)、模块边界 OK、行数预算 OK、无 Tab');
process.exit(0);