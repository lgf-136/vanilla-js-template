/**
 * scripts/commit-msg-check.js — Conventional Commits 提交信息校验（AGENTS.md 第 10 节）
 *
 * 用法:
 *   node scripts/commit-msg-check.js              # 校验 HEAD 提交（CI 与本地提交后自检）
 *   node scripts/commit-msg-check.js <msg-file>   # 校验指定信息文件（commit-msg hook 场景）
 *
 * 规则:
 *   1. Header 必须为 `<type>(<scope>): <描述>` 或 `<type>: <描述>`，type 属白名单；
 *   2. 正文不得为空，且至少包含一条以 "- " 开头的逐文件说明行。
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TYPES = ['feat', 'fix', 'refactor', 'perf', 'style', 'docs', 'test', 'build', 'ci', 'chore'];

function headMessage() {
  const res = spawnSync('git', ['log', '-1', '--format=%B'], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(res.stderr || 'git log 失败');
  return res.stdout;
}

const raw = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : headMessage();
const lines = raw.replace(/\r\n/g, '\n').split('\n');
const header = (lines[0] || '').trim();
const body = lines.slice(1).join('\n').trim();
const errors = [];

const m = header.match(/^(\w+)(\([^)]*\))?: \S/);
if (!header) {
  errors.push('Header 为空');
} else if (!m) {
  errors.push(`Header 不符合 <type>(<scope>): <描述> 格式：${header}`);
} else if (!TYPES.includes(m[1])) {
  errors.push(`非法 type "${m[1]}"，允许：${TYPES.join(' / ')}`);
}

if (!body) {
  errors.push('正文为空：必须逐文件列出改动，精确到方法/组件级（AGENTS.md 第 10 节）');
} else if (!/^[-*] /m.test(body)) {
  errors.push('正文缺少以 "- " 开头的逐条说明行');
}

if (errors.length) {
  console.error('[commit-msg] 校验失败：\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('[commit-msg] 通过：' + header);
