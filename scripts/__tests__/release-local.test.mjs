import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inferDryRunWouldRelease } from '../release-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');

async function readRepoFile(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

function assertOrder(content, first, second, context) {
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);
  assert.notEqual(firstIndex, -1, `${context}: missing "${first}"`);
  assert.notEqual(secondIndex, -1, `${context}: missing "${second}"`);
  assert.ok(firstIndex < secondIndex, `${context}: expected "${first}" before "${second}"`);
}

test('inferDryRunWouldRelease detects pending release previews', () => {
  assert.equal(
    inferDryRunWouldRelease('[semantic-release] › ℹ  The next release version is 1.2.3'),
    true,
  );
  assert.equal(
    inferDryRunWouldRelease('There are no relevant changes, so no new version is released.'),
    false,
  );
});

test('release-local helper prunes local-only tags across all release namespaces', async () => {
  const content = await readRepoFile('scripts/release-local.mjs');
  assert.ok(
    content.includes('for (const prefix of ALL_TAG_PREFIXES)'),
    'scripts/release-local.mjs: must iterate every known release tag prefix',
  );
  assert.equal(
    content.includes("filter((p) => p !== ownTagPrefix)"),
    false,
    'scripts/release-local.mjs: must not skip the current package tag namespace',
  );
});

test('stable orchestrator prunes before snapshot and reports would-release previews', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assertOrder(
    content,
    '  pruneLocalOnlyReleaseTags();',
    '  const tagsBefore = new Set(listTags(`${pkg.tagPrefix}*`));',
    'scripts/release-local-stable.mjs',
  );
  assert.ok(
    content.includes("'would-release'"),
    'scripts/release-local-stable.mjs: dry-run previews must be reported as would-release',
  );
});

test('stable orchestrator releases superdoc, cli, then sdk in order', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assertOrder(
    content,
    "name: 'superdoc'",
    "name: 'cli'",
    'scripts/release-local-stable.mjs (superdoc before cli)',
  );
  assertOrder(
    content,
    "name: 'cli'",
    "name: 'sdk'",
    'scripts/release-local-stable.mjs (cli before sdk)',
  );
});
