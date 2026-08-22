import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

function collectJavaScriptFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) collectJavaScriptFiles(file, files);
    else if (file.endsWith('.js')) files.push(file);
  }
  return files;
}

test('production build contains the migrated template structure and valid JavaScript', () => {
  const result = spawnSync(process.execPath, ['scripts/build.js'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(join(DIST, 'app/core/bootstrap.js')), true);
  assert.equal(existsSync(join(DIST, 'app/core/settings/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/core/i18n/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/core/i18n/dicts.js')), true);
  assert.equal(existsSync(join(DIST, 'app/components/layout/shell/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/components/ui/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/components/ui/icons/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/components/ui/data-table/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/components/ui/group-tree/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/modules/dashboard/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/modules/tasks/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/modules/apps/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/modules/chats/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/modules/docs/sub/introduction.js')), true);
  assert.equal(existsSync(join(DIST, 'app/modules/settings/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/modules/apihub/index.js')), true);
  assert.equal(existsSync(join(DIST, 'app/fonts')), true);
  assert.equal(existsSync(join(DIST, 'app/template')), false);

  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  assert.match(html, /app\/styles\/critical\.css/);
  assert.match(html, /app\/core\/bootstrap\.js/);
  assert.doesNotMatch(html, /app\/lib\/chart\.umd\.js/);

  // CSP 哈希回归:build.js 压缩 HTML 时必须逐字节保留内联脚本,
  // 否则 dist 内联脚本哈希与 CSP 声明不一致、生产环境内联脚本被拦截
  const distScript = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(distScript, 'dist/index.html 应包含内联 PREPAINT 脚本');
  const distHash = createHash('sha256').update(distScript[1], 'utf8').digest('base64');
  assert.ok(
    html.includes(`'sha256-${distHash}'`),
    `dist CSP 必须包含内联脚本当前哈希 sha256-${distHash}`
  );
  assert.equal(existsSync(join(DIST, 'app/styles/tokens.css')), true);
  assert.equal(existsSync(join(DIST, 'app/styles/utilities.css')), true);
  assert.doesNotMatch(html, /app\/template|server\/template/);

  for (const file of collectJavaScriptFiles(DIST)) {
    const syntax = spawnSync(process.execPath, ['--check', file], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(syntax.status, 0, `${file}\n${syntax.stderr || syntax.stdout}`);
  }
});
