import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  assert.equal(existsSync(join(DIST, 'app/components/layout/shell.js')), true);
  assert.equal(existsSync(join(DIST, 'app/components/ui/ui.js')), true);
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
