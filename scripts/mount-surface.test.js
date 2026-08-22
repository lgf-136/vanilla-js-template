import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const UI_DIR = join(ROOT, 'app/components/ui');

/**
 * 静态解析 app/components/ui 下全部挂载语句,得到完整 App.ui 挂载面。
 * 三种形态:
 *   平铺函数: App.ui.<key> = function ... {...};
 *   平铺标识: App.ui.<key> = <ident>;
 *   分组对象: App.ui.<group> = { <key>: ..., ... };
 * 分组对象用括号配平提取(支持单行/多行),键取冒号前的标识符。
 * 不做真实求值——组件含 document 副作用(样式注入/事件监听),
 * 本测试只关心"挂载面"本身(架构 2.3.2:App.ui.* 挂载面逐字稳定,
 * 拆分前后做挂载键 diff,消费方零改动)。
 */
function collectJs(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) collectJs(file, files);
    else if (file.endsWith('.js') && !file.endsWith('.test.js')) files.push(file);
  }
  return files;
}

/** 括号配平:从 src 的 pos 处(已指向 '{')返回匹配 '}' 的下标 */
function matchingBrace(src, pos) {
  let depth = 0;
  for (let i = pos; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseMounts() {
  const flat = new Set();
  const groups = {};
  for (const file of collectJs(UI_DIR)) {
    const src = readFileSync(file, 'utf8');
    const assignRe = /App\.ui\.([A-Za-z][A-Za-z0-9]*)\s*=\s*/g;
    let m;
    while ((m = assignRe.exec(src)) !== null) {
      const key = m[1];
      const rest = src.slice(assignRe.lastIndex);
      const next = rest[0];
      if (next === '{') {
        const end = matchingBrace(rest, 0);
        if (end === -1) continue;
        const body = rest.slice(1, end);
        const keys = [];
        // 匹配顶层键:冒号前的标识符;跳过嵌套对象内部(冒号后紧跟 `{` 或 `function` 的
        // 是值,后续属于嵌套体,用非贪婪到下一个顶层逗号/括号边界近似)。
        // 本项目分组对象均为平铺键:值(单层),无嵌套对象字面量。
        const keyRe = /([A-Za-z][A-Za-z0-9]*)\s*:\s*(?!\{)/g;
        let k;
        while ((k = keyRe.exec(body)) !== null) keys.push(k[1]);
        groups[key] = keys;
        assignRe.lastIndex += end + 1;
      } else if (next === 'f' || next === '(') {
        // App.ui.<key> = function ... {...};  或  App.ui.<key> = (() => ...)();
        flat.add(key);
      } else {
        // App.ui.<key> = <ident>;
        const ident = /^[A-Za-z][A-Za-z0-9]*\s*;/.exec(rest);
        if (ident) flat.add(key);
      }
    }
  }
  return { flat, groups };
}

test('App.ui 挂载面:平铺键清单稳定(与拆分前逐字一致)', () => {
  const { flat } = parseMounts();
  assert.deepEqual([...flat].sort(), [
    'avatarHtml',
    'badgeClass',
    'buttonClass',
    'buttonIcon',
    'cardClass',
    'cardContentClass',
    'cardHeaderClass',
    'cardTitleClass',
    'closeDialog',
    'cn',
    'dataTable',
    'dialog',
    'dropdownContentClass',
    'dropdownItemClass',
    'dropdownLabelClass',
    'dropdownSeparator',
    'dropdownTriggerClass',
    'emptyState',
    'inputClass',
    'notFound',
    'placeholderCard',
    'switchRow',
    'tagPill',
    'tagPills',
    'toast',
    'toggleItemClass',
  ]);
});

test('App.ui 挂载面:分组键清单稳定', () => {
  const { groups } = parseMounts();
  assert.deepEqual(groups.contextMenu, ['item', 'separator', 'submenu', 'empty', 'open', 'close']);
  assert.deepEqual(groups.radio, [
    'gridClass',
    'sectionTitle',
    'sectionTitleToggle',
    'check',
    'iconCard',
    'swatchPicker',
    'segmented',
    'readonlyRow',
  ]);
  assert.deepEqual(groups.searchInput, ['html']);
  assert.deepEqual(groups.tooltip, ['show', 'hide']);
  assert.deepEqual(groups.jsonTree, ['create']);
  assert.ok(groups.color.length >= 3, 'color 分组应至少包含核心取色函数');
  assert.ok(groups.colorPicker.length >= 1, 'colorPicker 分组不应为空');
  assert.ok(groups.groupTree.length >= 1, 'groupTree 分组不应为空');
  assert.ok(groups.tagPicker.length >= 1, 'tagPicker 分组不应为空');
});

test('App.ui 挂载面:分组名不与平铺键冲突', () => {
  const { flat, groups } = parseMounts();
  for (const g of Object.keys(groups)) {
    assert.equal(flat.has(g), false, `分组名 ${g} 与平铺键冲突`);
  }
});

/** 收集全部 app/ 下 .js 源码(排除测试文件) */
function collectAppJs(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) collectAppJs(file, files);
    else if (file.endsWith('.js') && !file.endsWith('.test.js')) files.push(file);
  }
  return files;
}

test('App.ui 消费面:全部 app/ 源码仅引用已挂载的键', () => {
  const { flat, groups } = parseMounts();
  const mounted = new Set(flat);
  for (const [g, keys] of Object.entries(groups)) {
    mounted.add(g);
    keys.forEach((k) => mounted.add(`${g}.${k}`));
  }
  const bad = [];
  for (const file of collectAppJs(join(ROOT, 'app'))) {
    const rel = file.slice(ROOT.length + 1);
    const src = readFileSync(file, 'utf8');
    const re = /App\.ui\.([A-Za-z][A-Za-z0-9]*)(?:\.([A-Za-z][A-Za-z0-9]*))?/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const a = m[1];
      const b = m[2];
      const token = b ? `${a}.${b}` : a;
      if (!mounted.has(token)) bad.push(`${rel}: App.ui.${token}`);
    }
  }
  assert.deepEqual(bad, [], '存在引用未挂载的 App.ui 键(挂载面回退,禁止)');
});
