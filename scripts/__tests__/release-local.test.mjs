import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildSemanticReleaseArgs,
  buildSemanticReleaseEnv,
  detectPreviewTargetFromBranchName,
  getRepositoryUrlCandidates,
  inferPreviewTargetBranch,
  inferDryRunWouldRelease,
  splitPreviewArgs,
} from '../release-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
const require = createRequire(import.meta.url);
const { strictBreakingParserOpts } = require('../semantic-release/strict-breaking-parser.cjs');

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
  assert.equal(inferDryRunWouldRelease('[semantic-release] › ℹ  The next release version is 1.2.3'), true);
  assert.equal(inferDryRunWouldRelease('There are no relevant changes, so no new version is released.'), false);
});

test('release-local helper does not inject semantic-release branch overrides', () => {
  assert.deepEqual(
    buildSemanticReleaseArgs({
      packageCwd: 'packages/superdoc',
      extraArgs: ['--dry-run'],
    }),
    ['--prefix', 'packages/superdoc', 'exec', 'semantic-release', '--no-ci', '--dry-run'],
  );
});

test('release-local helper strips custom preview-branch flags before forwarding args', () => {
  assert.deepEqual(splitPreviewArgs(['--dry-run', '--preview-branch', 'stable', '--debug']), {
    semanticReleaseArgs: ['--dry-run', '--debug'],
    previewBranchOverride: 'stable',
  });
});

test('release-local helper supports equals-style preview branch overrides', () => {
  assert.deepEqual(splitPreviewArgs(['--dry-run', '--preview-branch=main']), {
    semanticReleaseArgs: ['--dry-run'],
    previewBranchOverride: 'main',
  });
});

test('release-local helper marks dry runs as local preview mode', () => {
  const env = buildSemanticReleaseEnv({
    branch: 'stable',
    extraArgs: ['--dry-run'],
    baseEnv: {},
  });

  assert.equal(env.GITHUB_REF_NAME, 'stable');
  assert.equal(env.SUPERDOC_RELEASE_PREVIEW, '1');
  assert.equal(env.LEFTHOOK, '0');
});

test('release-local helper infers preview target from merge-branch names', () => {
  assert.equal(detectPreviewTargetFromBranchName('merge/main-into-stable-2026-04-24', ['stable', 'main']), 'stable');
  assert.equal(detectPreviewTargetFromBranchName('hotfix/to-0.29.x-urgent', ['stable', 'main', '0.29.x']), '0.29.x');
});

test('release-local helper honors explicit preview-branch overrides', () => {
  assert.equal(
    inferPreviewTargetBranch({
      currentBranch: 'merge/main-into-stable-2026-04-24',
      releaseBranches: ['stable', 'main'],
      previewBranchOverride: 'main',
    }),
    'main',
  );
});

test('release-local helper rewrites both ssh and https repository urls for previews', () => {
  const candidates = getRepositoryUrlCandidates('packages/superdoc');
  assert.ok(
    candidates.includes('git+https://github.com/superdoc-dev/superdoc.git'),
    'packages/superdoc/package.json repository url must be included',
  );
  assert.ok(
    candidates.includes('https://github.com/superdoc-dev/superdoc.git'),
    'git+https package repository urls must normalize to https for git rewrites',
  );
  assert.ok(
    candidates.includes('git@github.com:superdoc-dev/superdoc.git'),
    'origin ssh urls must also be rewritten for preview remotes',
  );
});

test('semantic-release breaking parser ignores prose and requires explicit footer syntax', () => {
  const regex = strictBreakingParserOpts.notesPattern('BREAKING CHANGE|BREAKING-CHANGE');

  assert.match('BREAKING CHANGE: external adapters must register SelectionAdapter', regex);
  assert.match('BREAKING-CHANGE: external adapters must register SelectionAdapter', regex);
  assert.doesNotMatch('   breaking change for external adapter constructors', regex);
  assert.doesNotMatch('* breaking change for external adapter constructors', regex);
  assert.doesNotMatch('BREAKING CHANGE external adapters must register SelectionAdapter', regex);
});

test('release-local helper prunes local-only tags across all release namespaces', async () => {
  const content = await readRepoFile('scripts/release-local.mjs');
  assert.ok(
    content.includes('for (const pattern of ALL_TAG_PATTERNS)'),
    'scripts/release-local.mjs: must iterate every known release tag pattern',
  );
  assert.equal(
    content.includes('filter((p) => p !== ownTagPrefix)'),
    false,
    'scripts/release-local.mjs: must not skip the current package tag namespace',
  );
  assert.ok(
    content.includes("'v[0-9]*'"),
    'scripts/release-local.mjs: superdoc tag matching must not also match vscode release tags',
  );
  assert.ok(
    content.includes('pruneLocalOnlyReleaseTags({ allowRemoteFailure: isDryRunEnabled(semanticReleaseArgs) })'),
    'scripts/release-local.mjs: dry-run previews must treat remote tag pruning as best-effort',
  );
});

test('root release:dry-run script uses the local preview helper', async () => {
  const content = await readRepoFile('package.json');
  assert.ok(
    content.includes(
      '"release:dry-run": "pnpm run build:superdoc && pnpm run type-check && node scripts/release-local-superdoc.mjs --dry-run"',
    ),
    'package.json: release:dry-run must delegate to the local preview helper',
  );
});

test('superdoc releaserc uses preview mode to avoid AI notes and side-effect plugins', async () => {
  const content = await readRepoFile('packages/superdoc/.releaserc.cjs');
  assert.ok(
    content.includes("const isLocalPreview = process.env.SUPERDOC_RELEASE_PREVIEW === '1'"),
    'packages/superdoc/.releaserc.cjs: must detect local preview mode',
  );
  assert.ok(
    content.includes('const notesPlugin =') &&
      content.includes('isLocalPreview || isPrerelease ? createReleaseNotesGenerator()'),
    'packages/superdoc/.releaserc.cjs: preview mode must fall back to conventional release notes',
  );
  assert.ok(
    content.includes('if (!isLocalPreview) {'),
    'packages/superdoc/.releaserc.cjs: preview mode must gate side-effect plugins',
  );
});

test('stable orchestrator prunes before snapshot and reports would-release previews', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assertOrder(
    content,
    '  pruneLocalOnlyReleaseTags();',
    '  const tagsBefore = new Set(listTags(pkg.tagPattern));',
    'scripts/release-local-stable.mjs',
  );
  assert.ok(
    content.includes("'would-release'"),
    'scripts/release-local-stable.mjs: dry-run previews must be reported as would-release',
  );
});

test('stable orchestrator releases superdoc, cli, then sdk in order', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assertOrder(content, "name: 'superdoc'", "name: 'cli'", 'scripts/release-local-stable.mjs (superdoc before cli)');
  assertOrder(content, "name: 'cli'", "name: 'sdk'", 'scripts/release-local-stable.mjs (cli before sdk)');
});

test('stable workflow isolates skip-ci writebacks from the shared stable queue', async () => {
  const content = await readRepoFile('.github/workflows/release-stable.yml');
  assert.equal(
    content.includes('    paths:'),
    false,
    '.github/workflows/release-stable.yml: stable releases must run on every push, not a filtered path subset',
  );
  assert.ok(
    content.includes("contains(github.event.head_commit.message, '[skip ci]')"),
    '.github/workflows/release-stable.yml: concurrency must detect [skip ci] writeback pushes',
  );
  assert.ok(
    content.includes("format('release-stable-skip-{0}', github.run_id)"),
    '.github/workflows/release-stable.yml: skip-ci writebacks must use a separate concurrency group',
  );
  assert.ok(
    content.includes(
      "if: github.event_name == 'workflow_dispatch' || !contains(github.event.head_commit.message, '[skip ci]')",
    ),
    '.github/workflows/release-stable.yml: skip-ci writeback runs must still no-op when they start',
  );
});

test('stable release workflows and commit filters include shared workspace coverage', async () => {
  const workflowFiles = [
    '.github/workflows/release-superdoc.yml',
    '.github/workflows/release-esign.yml',
    '.github/workflows/release-react.yml',
    '.github/workflows/release-template-builder.yml',
    '.github/workflows/release-vscode-ext.yml',
    '.github/workflows/release-cli.yml',
    '.github/workflows/release-sdk.yml',
  ];

  for (const file of workflowFiles) {
    const content = await readRepoFile(file);
    assert.ok(content.includes("'shared/**'"), `${file}: shared workspace changes must trigger release workflows`);
  }

  const releasercFiles = [
    'packages/superdoc/.releaserc.cjs',
    'packages/esign/.releaserc.cjs',
    'packages/react/.releaserc.cjs',
    'packages/template-builder/.releaserc.cjs',
    'apps/vscode-ext/.releaserc.cjs',
    'apps/cli/.releaserc.cjs',
    'packages/sdk/.releaserc.cjs',
  ];

  for (const file of releasercFiles) {
    const content = await readRepoFile(file);
    assert.ok(content.includes("'shared'"), `${file}: semantic-release must analyze shared workspace changes`);
  }
});

test('stable orchestrator recovers incomplete merged tags and defers stale checkouts', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assert.ok(
    content.includes("? 'resumed'"),
    'scripts/release-local-stable.mjs: recovered tagged releases must be reported as resumed when no new release is cut',
  );
  assert.ok(
    content.includes('listMergedTags(pkg.tagPattern, branchRef)[0]'),
    'scripts/release-local-stable.mjs: recovery must inspect the latest merged tag for each package, not only tags at HEAD',
  );
  assert.ok(
    content.includes("run('git', ['worktree', 'add', '--detach', worktreeRoot, tag])"),
    'scripts/release-local-stable.mjs: recovering older partial releases must use a tagged worktree snapshot',
  );
  assert.ok(
    content.includes('ensureGitHubRelease'),
    'scripts/release-local-stable.mjs: reruns must repair missing GitHub releases, not only package publishes',
  );
  assert.ok(
    content.includes('sdk_python_snapshot_companion_dir'),
    'scripts/release-local-stable.mjs: SDK recovery must expose snapshot Python artifacts for workflow publishing',
  );
  assert.ok(
    content.includes('npm-publish-package.cjs'),
    'scripts/release-local-stable.mjs: reruns must have a generic npm resume path',
  );
  assert.ok(
    content.includes('sdk-release-publish.mjs'),
    'scripts/release-local-stable.mjs: SDK reruns must resume npm publish explicitly',
  );
  assert.ok(
    content.includes(": 'deferred'"),
    'scripts/release-local-stable.mjs: stale checkout races must defer instead of failing',
  );
  assert.ok(
    content.includes('StableBranchAdvancedError'),
    'scripts/release-local-stable.mjs: must detect when stable advances during the run',
  );
  assert.ok(
    content.includes('Current run stopped before publishing from a stale checkout.'),
    'scripts/release-local-stable.mjs: deferred runs must explain why they stopped',
  );
});

test('stable dry runs skip incomplete-release recovery side effects', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assert.ok(
    content.includes('if (!isDryRun) {'),
    'scripts/release-local-stable.mjs: dry runs must gate recovery behind !isDryRun',
  );
  assertOrder(
    content,
    '  if (!isDryRun) {',
    '      recoveredRelease = await maybeRecoverIncompleteRelease(pkg, branchRef);',
    'scripts/release-local-stable.mjs',
  );
});

test('stable workflow publishes recovered SDK Python snapshots before any head-tag SDK publish', async () => {
  const content = await readRepoFile('.github/workflows/release-stable.yml');
  assertOrder(
    content,
    '- name: Publish recovered SDK companion Python packages to PyPI',
    '- name: Build and verify Python SDK',
    '.github/workflows/release-stable.yml',
  );
  assert.ok(
    content.includes('id: stable_release'),
    '.github/workflows/release-stable.yml: stable orchestrator step must expose recovery outputs',
  );
  assert.ok(
    content.includes("if: steps.stable_release.outputs.sdk_python_snapshot_companion_dir != ''"),
    '.github/workflows/release-stable.yml: recovered SDK snapshot companion wheels must publish even when the sdk tag is not at HEAD',
  );
  assert.ok(
    content.includes("if: steps.stable_release.outputs.sdk_python_snapshot_main_dir != ''"),
    '.github/workflows/release-stable.yml: recovered SDK snapshot root wheel must publish even when the sdk tag is not at HEAD',
  );
  assert.ok(
    content.includes("if: steps.sdk_release.outputs.release_present == 'true'"),
    '.github/workflows/release-stable.yml: SDK Python publish must still key off the sdk tag at HEAD',
  );
  assert.equal(
    content.includes('Resume Node SDK publish for existing release tag'),
    false,
    '.github/workflows/release-stable.yml: SDK npm resume now belongs to the stable orchestrator',
  );
});

test('publish helpers only treat real 404s as missing versions and keep dist-tags consistent', async () => {
  const genericHelper = await readRepoFile('scripts/npm-publish-package.cjs');
  const superdocHelper = await readRepoFile('scripts/publish-superdoc.cjs');
  const cliPublish = await readRepoFile('apps/cli/scripts/publish.js');
  const sdkPublish = await readRepoFile('packages/sdk/scripts/publish-node-sdk.mjs');

  for (const [file, content] of [
    ['scripts/npm-publish-package.cjs', genericHelper],
    ['scripts/publish-superdoc.cjs', superdocHelper],
  ]) {
    assert.ok(
      content.includes('E404|Not found|not found|No match found'),
      `${file}: missing-version checks must distinguish true 404s from other npm lookup failures`,
    );
  }

  assert.ok(
    cliPublish.includes('already published, ensuring dist-tag'),
    'apps/cli/scripts/publish.js: reruns must reapply dist-tags for already-published CLI packages',
  );
  assert.ok(
    sdkPublish.includes('already published, ensuring dist-tag'),
    'packages/sdk/scripts/publish-node-sdk.mjs: reruns must reapply dist-tags for already-published SDK packages',
  );
});
