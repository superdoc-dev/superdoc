import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../');

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

test('sdk-release.mjs builds Node SDK before validate', async () => {
  const content = await readRepoFile('packages/sdk/scripts/sdk-release.mjs');
  assertOrder(
    content,
    "await run('pnpm', ['run', 'build'], { cwd: NODE_SDK_DIR });",
    "await run('node', [path.join(REPO_ROOT, 'packages/sdk/scripts/sdk-validate.mjs')]);",
    'packages/sdk/scripts/sdk-release.mjs',
  );
});

test('ci-sdk workflow builds Node SDK before validate', async () => {
  const content = await readRepoFile('.github/workflows/ci-sdk.yml');
  assertOrder(
    content,
    '- name: Build Node SDK',
    '- name: Validate SDK',
    '.github/workflows/ci-sdk.yml',
  );
});

test('release-sdk fallback workflow builds Node SDK before validate', async () => {
  const content = await readRepoFile('.github/workflows/release-sdk.yml');
  assertOrder(
    content,
    '- name: Build Node SDK',
    '- name: Validate SDK',
    '.github/workflows/release-sdk.yml',
  );
});

test('release-sdk fallback workflow publishes Node SDK via sdk-release-publish', async () => {
  const content = await readRepoFile('.github/workflows/release-sdk.yml');
  const expectedCmd =
    'node packages/sdk/scripts/sdk-release-publish.mjs --tag "${{ inputs.npm-tag }}" --npm-only';
  assert.ok(content.includes(expectedCmd), '.github/workflows/release-sdk.yml: missing sdk-release-publish command');
  assert.equal(
    content.includes('npm publish --access public --tag latest'),
    false,
    '.github/workflows/release-sdk.yml: must not use npm publish directly for Node SDK',
  );
});

test('release-sdk manual version input description matches manual fallback behavior', async () => {
  const content = await readRepoFile('.github/workflows/release-sdk.yml');
  assert.ok(
    content.includes('Leave empty to publish the current repo version.'),
    '.github/workflows/release-sdk.yml: manual version input must describe current-version publish behavior',
  );
  assert.equal(
    content.includes('Leave empty to let semantic-release decide.'),
    false,
    '.github/workflows/release-sdk.yml: manual fallback must not claim semantic-release chooses the version',
  );
});

test('release-sdk auto workflow resumes releases from sdk-v tags at HEAD', async () => {
  const content = await readRepoFile('.github/workflows/release-sdk.yml');
  assert.ok(
    content.includes("git tag --points-at HEAD --list 'sdk-v*' --sort=-version:refname | head -n 1"),
    '.github/workflows/release-sdk.yml: auto-release must detect sdk release tags at HEAD',
  );
  assert.ok(
    content.includes("if: steps.detect.outputs.release_present == 'true'"),
    '.github/workflows/release-sdk.yml: Python publish must key off release tag presence, not per-run tag creation',
  );
  assert.ok(
    content.includes('Resume Node SDK publish for existing release tag'),
    '.github/workflows/release-sdk.yml: auto-release must have an npm publish recovery step for reruns',
  );
  assert.ok(
    content.includes('node packages/sdk/scripts/sdk-release-publish.mjs --tag "${{ steps.detect.outputs.dist_tag }}" --npm-only'),
    '.github/workflows/release-sdk.yml: npm publish recovery must reuse sdk-release-publish.mjs',
  );
});

test('sdk semantic-release prepareCmd builds Node SDK before validate', async () => {
  const content = await readRepoFile('packages/sdk/.releaserc.cjs');
  assertOrder(
    content,
    "'pnpm -w run generate:all'",
    "'pnpm --prefix langs/node run build'",
    'packages/sdk/.releaserc.cjs',
  );
  assertOrder(
    content,
    "'pnpm --prefix langs/node run build'",
    "'node scripts/sdk-validate.mjs'",
    'packages/sdk/.releaserc.cjs',
  );
});

test('sdk semantic-release matches CLI channel model (next/next on main, latest on stable)', async () => {
  const content = await readRepoFile('packages/sdk/.releaserc.cjs');
  assert.ok(
    content.includes("{ name: 'stable', channel: 'latest' }"),
    "packages/sdk/.releaserc.cjs: stable release branch must remain configured",
  );
  assert.ok(
    content.includes("{ name: 'main', prerelease: 'next', channel: 'next' }"),
    "packages/sdk/.releaserc.cjs: main branch must release next versions on next channel",
  );
});

test('sdk-release-publish validates local PyPI prerequisites before Node publish', async () => {
  const content = await readRepoFile('packages/sdk/scripts/sdk-release-publish.mjs');
  assertOrder(
    content,
    'const localPypiPublishConfig = resolveLocalPypiPublishConfig({ npmOnly, dryRun });',
    "const nodePublishArgs = [path.join(__dirname, 'publish-node-sdk.mjs'), '--tag', tag];",
    'packages/sdk/scripts/sdk-release-publish.mjs',
  );
});
