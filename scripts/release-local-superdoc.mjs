#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKED_TAG_PATTERNS = ['cli-v*', 'vscode-v*'];
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function run(command, args, options = {}) {
  const { capture = false, env = process.env } = options;
  return execFileSync(command, args, {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function listTags(pattern) {
  const output = run('git', ['tag', '--list', pattern], { capture: true }).trim();
  return output ? output.split('\n').map((tag) => tag.trim()).filter(Boolean) : [];
}

function getRemoteTags() {
  const output = run('git', ['ls-remote', '--tags', 'origin'], { capture: true }).trim();
  if (!output) return new Set();

  const tags = output
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter((ref) => ref && ref.startsWith('refs/tags/'))
    .map((ref) => ref.replace(/^refs\/tags\//, ''))
    .map((tag) => tag.replace(/\^\{\}$/, ''));

  return new Set(tags);
}

function pruneLocalOnlyBlockedTags() {
  const pruned = [];
  const remoteTags = getRemoteTags();

  for (const pattern of BLOCKED_TAG_PATTERNS) {
    const tags = listTags(pattern);
    for (const tag of tags) {
      if (remoteTags.has(tag)) continue;
      run('git', ['tag', '-d', tag]);
      pruned.push(tag);
    }
  }

  if (pruned.length > 0) {
    console.log(
      `Pruned ${pruned.length} local-only non-superdoc tags before release: ${pruned.join(', ')}`,
    );
  }
}

function runSemanticRelease() {
  const extraArgs = process.argv.slice(2);
  run(
    'pnpm',
    ['--prefix', 'packages/superdoc', 'exec', 'semantic-release', '--no-ci', ...extraArgs],
    { env: { ...process.env, LEFTHOOK: '0' } },
  );
}

try {
  pruneLocalOnlyBlockedTags();
  runSemanticRelease();
} catch (error) {
  const message = error && typeof error.message === 'string' ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
