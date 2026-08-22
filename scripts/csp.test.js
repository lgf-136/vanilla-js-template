/* CSP 自一致性测试:内联 PREPAINT 脚本的 sha256 哈希必须与 CSP 声明一致。
 * 任何对内联脚本的修改若不同步更新哈希,此处即失败,防止 CSP 漂移。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const cspMatch = html.match(/content="([^"]*)"\s*\/?>/g) || [];
const cspLine = cspMatch.find((line) => line.includes('default-src')) || '';
const cspContent = cspLine.replace(/^content="|"\/?>$/g, '');

test('index.html 只含一个内联脚本(PREPAINT)', () => {
  assert.equal(scripts.length, 1);
});

test('CSP 使用 sha256 哈希固定内联脚本,而非 unsafe-inline', () => {
  assert.ok(cspContent.includes("script-src 'self'"), "CSP 应保留 script-src 'self'");
  assert.doesNotMatch(cspContent, /script-src[^;]*'unsafe-inline'/, 'script-src 不应再包含 unsafe-inline');
  assert.match(cspContent, /'sha256-[A-Za-z0-9+/=]+'/, 'CSP 应包含内联脚本的 sha256 哈希');
});

test('CSP 哈希与内联脚本实际内容一致', () => {
  const [script] = scripts;
  const hash = createHash('sha256').update(script[1], 'utf8').digest('base64');
  assert.ok(
    cspContent.includes(`'sha256-${hash}'`),
    `CSP 缺少内联脚本当前哈希 sha256-${hash}(修改内联脚本后须同步更新 CSP)`
  );
});
