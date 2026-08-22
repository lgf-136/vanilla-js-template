/**
 * scripts/i18n-check.js — 三语言文案 key 一致性校验（`just i18n:check`）
 * 覆盖三类词典：
 *  1. 核心词典 app/core/i18n/dicts.js（壳层文案：sidebar.* / settings.* 等，AGENTS §7 第 4 步）；
 *  2. app/locales 与各模块 locales/ 目录（每目录必须恰好包含 zh-CN / zh-TW / en 三份 JSON，
 *     且 key 集合完全一致）；
 *  3. 各模块 i18n.js（window.__moduleI18n['<id>'] 内嵌 en / zh-CN / zh-TW 三个对象，
 *     同样要求 key 集合完全一致）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { dict as coreDict } from '../app/core/i18n/dicts.js';

const ROOT = resolve(join(import.meta.dirname, '..'));
const LANGS = ['zh-CN', 'zh-TW', 'en'];

function collectKeys(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) collectKeys(value, path, out);
    else out.add(path);
  }
  return out;
}

function findLocaleDirs(base, out = []) {
  for (const entry of readdirSync(base)) {
    if (entry.startsWith('.')) continue;
    const full = join(base, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'locales') out.push(full);
      else findLocaleDirs(full, out);
    }
  }
  return out;
}

function findModuleI18nFiles(base, out = []) {
  for (const entry of readdirSync(base)) {
    if (entry.startsWith('.')) continue;
    const full = join(base, entry);
    if (statSync(full).isDirectory()) findModuleI18nFiles(full, out);
    else if (entry === 'i18n.js') out.push(full);
  }
  return out;
}

let failed = false;

function checkDir(dir) {
  const rel = dir.length > ROOT.length ? dir.slice(ROOT.length + 1) : dir;
  const existing = readdirSync(dir).filter((f) => f.endsWith('.json'));

  const missing = LANGS.filter((l) => !existing.includes(`${l}.json`));
  const extra = existing.filter((f) => !LANGS.includes(f.replace(/\.json$/, '')));
  if (missing.length || extra.length) {
    console.error(`✗ ${rel}: 文件缺失 [${missing.join(', ')}] 或多余 [${extra.join(', ')}]`);
    failed = true;
    return;
  }

  const packs = {};
  for (const lang of LANGS) {
    packs[lang] = collectKeys(JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')));
  }

  const master = packs['zh-CN'];
  for (const lang of LANGS) {
    if (lang === 'zh-CN') continue;
    const missingKeys = [...master].filter((k) => !packs[lang].has(k));
    const extraKeys = [...packs[lang]].filter((k) => !master.has(k));
    if (missingKeys.length || extraKeys.length) {
      console.error(`✗ ${rel}/${lang}.json: 缺失 [${missingKeys.join(', ')}] 多余 [${extraKeys.join(', ')}]`);
      failed = true;
    }
  }
}

/** 校验核心词典 dicts.js：三语言 key 集合一致（缺一个 key 即失败） */
function checkCoreDicts() {
  const missing = LANGS.filter((l) => !coreDict[l] || typeof coreDict[l] !== 'object');
  if (missing.length) {
    console.error(`✗ app/core/i18n/dicts.js: 缺少语言对象 [${missing.join(', ')}]`);
    failed = true;
    return;
  }
  const packs = {};
  for (const lang of LANGS) packs[lang] = collectKeys(coreDict[lang]);
  const master = packs['zh-CN'];
  for (const lang of LANGS) {
    if (lang === 'zh-CN') continue;
    const missingKeys = [...master].filter((k) => !packs[lang].has(k));
    const extraKeys = [...packs[lang]].filter((k) => !master.has(k));
    if (missingKeys.length || extraKeys.length) {
      console.error(
        `✗ app/core/i18n/dicts.js: ${lang} 缺失 [${missingKeys.join(', ')}] 多余 [${extraKeys.join(', ')}]`
      );
      failed = true;
    }
  }
}

/** 校验单个模块 i18n.js：用 node:vm 在沙箱中执行，取出 window.__moduleI18n['<id>'] 后比对三语言 key 集合 */
function checkModuleI18nFile(file) {
  const rel = file.length > ROOT.length ? file.slice(ROOT.length + 1) : file;
  const src = readFileSync(file, 'utf8');
  const idMatch = src.match(/__moduleI18n\[\s*['"]([^'"]+)['"]\s*\]/);
  if (!idMatch) {
    console.error(`✗ ${rel}: 未找到 window.__moduleI18n['<id>'] 赋值`);
    failed = true;
    return;
  }
  const id = idMatch[1];
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(src, sandbox, { filename: file });
  } catch (e) {
    console.error(`✗ ${rel}: 执行失败(${e.message})`);
    failed = true;
    return;
  }
  const dict = sandbox.window && sandbox.window.__moduleI18n && sandbox.window.__moduleI18n[id];
  if (!dict || typeof dict !== 'object') {
    console.error(`✗ ${rel}: __moduleI18n['${id}'] 缺失或不是对象`);
    failed = true;
    return;
  }
  const missing = LANGS.filter((l) => !dict[l] || typeof dict[l] !== 'object');
  if (missing.length) {
    console.error(`✗ ${rel}: 缺少语言对象 [${missing.join(', ')}]`);
    failed = true;
    return;
  }

  const packs = {};
  for (const lang of LANGS) packs[lang] = collectKeys(dict[lang]);

  const master = packs['zh-CN'];
  for (const lang of LANGS) {
    if (lang === 'zh-CN') continue;
    const missingKeys = [...master].filter((k) => !packs[lang].has(k));
    const extraKeys = [...packs[lang]].filter((k) => !master.has(k));
    if (missingKeys.length || extraKeys.length) {
      console.error(`✗ ${rel}: ${lang} 缺失 [${missingKeys.join(', ')}] 多余 [${extraKeys.join(', ')}]`);
      failed = true;
    }
  }
}

checkCoreDicts();
findLocaleDirs(join(ROOT, 'app')).forEach(checkDir);
findModuleI18nFiles(join(ROOT, 'app', 'modules')).forEach(checkModuleI18nFile);

if (failed) {
  console.error('\n[i18n:check] 失败：请同步补齐三语言文案（AGENTS.md 第 7 节）');
  process.exit(1);
}
console.log('[i18n:check] 通过：核心 dicts.js、locale 目录与模块 i18n.js 三语言 key 一致');
process.exit(0);
