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
import { shouldRecoverPackageRelease } from '../release-recovery-state.mjs';

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

test('stable orchestrator releases tools chain (CLI, SDK, MCP) and core chain (superdoc, react, vscode-ext) in order', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assertOrder(content, "name: 'cli'", "name: 'sdk'", 'scripts/release-local-stable.mjs (cli before sdk)');
  assertOrder(content, "name: 'sdk'", "name: 'mcp'", 'scripts/release-local-stable.mjs (sdk before mcp)');
  assertOrder(content, "name: 'superdoc'", "name: 'react'", 'scripts/release-local-stable.mjs (superdoc before react)');
  assertOrder(content, "name: 'react'", "name: 'vscode-ext'", 'scripts/release-local-stable.mjs (react before vscode-ext)');
  assert.ok(
    content.includes("name: 'superdoc'"),
    'scripts/release-local-stable.mjs: orchestrator must release superdoc so the v* tag drives docs-stable promotion in the same workflow',
  );
  assert.ok(
    content.includes("name: 'react'"),
    'scripts/release-local-stable.mjs: orchestrator must release react after superdoc so consumers see them ship together',
  );
  assert.ok(
    content.includes("name: 'vscode-ext'") && content.includes("vsCodeExtensionId: 'superdoc-dev.superdoc-vscode-ext'"),
    'scripts/release-local-stable.mjs: orchestrator must release vscode-ext with its marketplace extension id so publishComplete checks the marketplace, not npm',
  );
  assert.equal(
    content.includes("name: 'esign'") || content.includes("name: 'template-builder'"),
    false,
    'scripts/release-local-stable.mjs: esign and template-builder are not yet brought into the orchestrator',
  );
});

test('stable tooling bundle emits SDK release coordinates so Python publish does not depend on HEAD', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assert.ok(
    content.includes("setStepOutput('sdk_release_present'"),
    'scripts/release-local-stable.mjs: must emit sdk_release_present after the bundle runs',
  );
  assert.ok(
    content.includes('recordSdkReleaseOutputs'),
    'scripts/release-local-stable.mjs: must record SDK release outputs from the SDK result, not from HEAD',
  );

  const workflow = await readRepoFile('.github/workflows/release-stable.yml');
  assert.equal(
    workflow.includes("git tag --points-at HEAD --list 'sdk-v*'"),
    false,
    '.github/workflows/release-stable.yml: must not detect SDK at HEAD - MCP commits land on top after the bundle runs',
  );
  assert.ok(
    workflow.includes("steps.stable_release.outputs.sdk_release_present == 'true'"),
    '.github/workflows/release-stable.yml: Python publish must gate on the orchestrator output, not a HEAD lookup',
  );
});

test('stable release workflows serialize on the shared release-stable concurrency group', async () => {
  // All stable release workflows must share `release-stable` so
  // @semantic-release/git pushes to `stable` queue instead of racing on
  // `git push origin stable`. Per-workflow groups parallelize and leave
  // npm/PyPI tarballs published with no corresponding tag/commit pushed.
  const stableWorkflows = [
    '.github/workflows/release-stable.yml',
    '.github/workflows/release-superdoc.yml',
    '.github/workflows/release-react.yml',
    '.github/workflows/release-esign.yml',
    '.github/workflows/release-template-builder.yml',
    '.github/workflows/release-vscode-ext.yml',
  ];

  for (const file of stableWorkflows) {
    const content = await readRepoFile(file);
    assert.ok(
      content.includes("'release-stable'"),
      `${file}: stable runs must use the shared 'release-stable' concurrency group`,
    );
  }

  const bundle = await readRepoFile('.github/workflows/release-stable.yml');
  assert.equal(
    bundle.includes('    paths:'),
    false,
    '.github/workflows/release-stable.yml: tooling bundle must run on every stable push, not a filtered path subset',
  );
  assert.ok(
    bundle.includes("contains(github.event.head_commit.message, '[skip ci]')"),
    '.github/workflows/release-stable.yml: concurrency must detect [skip ci] writeback pushes',
  );
  assert.ok(
    bundle.includes('id-token: write'),
    '.github/workflows/release-stable.yml: must request id-token: write so SDK PyPI OIDC publish works',
  );
  assert.ok(
    bundle.includes(
      "if: github.event_name == 'workflow_dispatch' || !contains(github.event.head_commit.message, '[skip ci]')",
    ),
    '.github/workflows/release-stable.yml: skip-ci writeback runs must still no-op when they start',
  );

  // Per-package workflows that still auto-fire on stable directly.
  // superdoc, react, and vscode-ext are excluded because release-stable.yml
  // drives their stable releases now. The remaining workflows have not yet
  // been brought into the orchestrator.
  const perPackageStableWorkflows = [
    '.github/workflows/release-esign.yml',
    '.github/workflows/release-template-builder.yml',
  ];
  for (const file of perPackageStableWorkflows) {
    const content = await readRepoFile(file);
    assert.ok(
      /branches:\s*\n\s*-\s*main\s*\n\s*-\s*stable/.test(content),
      `${file}: must trigger on push to both main and stable`,
    );
  }

  // Workflows that no longer auto-fire on stable - the orchestrator is
  // their single stable release path.
  const orchestratorOnlyOnStable = [
    '.github/workflows/release-superdoc.yml',
    '.github/workflows/release-react.yml',
    '.github/workflows/release-vscode-ext.yml',
  ];
  for (const file of orchestratorOnlyOnStable) {
    const content = await readRepoFile(file);
    assert.equal(
      /branches:\s*\n\s*-\s*main\s*\n\s*-\s*stable/.test(content),
      false,
      `${file}: stable releases are driven by release-stable.yml; this workflow only fires on main`,
    );
  }
});

test('release workflows queue (do not cancel) and use queue: max so multi-package stable pushes do not drop runs', async () => {
  // GitHub Actions default concurrency queue allows one running + one
  // pending per group. With three release workflows joining the shared
  // `release-stable` group on a stable push that touches multiple
  // wrapper packages, the third arrival is silently cancelled. queue: max
  // raises the pending limit; cancel-in-progress: false ensures release
  // runs are never cancelled by a newer release run (each merge is a
  // release-worthy state). queue: max cannot be combined with
  // cancel-in-progress: true (validation error).
  const releaseWorkflows = [
    '.github/workflows/release-cli.yml',
    '.github/workflows/release-create.yml',
    '.github/workflows/release-esign.yml',
    '.github/workflows/release-mcp.yml',
    '.github/workflows/release-react.yml',
    '.github/workflows/release-sdk.yml',
    '.github/workflows/release-stable.yml',
    '.github/workflows/release-superdoc.yml',
    '.github/workflows/release-template-builder.yml',
    '.github/workflows/release-vscode-ext.yml',
  ];

  for (const file of releaseWorkflows) {
    const content = await readRepoFile(file);
    assert.ok(
      /\n {2}cancel-in-progress: false\b/.test(content),
      `${file}: cancel-in-progress must be the literal \`false\` (not a branch-conditional expression) so release runs never get cancelled by newer release runs`,
    );
    assert.equal(
      /cancel-in-progress: \$\{\{/.test(content),
      false,
      `${file}: cancel-in-progress must not be a conditional expression; queue: max forbids cancel-in-progress: true on any branch`,
    );
    assert.ok(
      /\n {2}queue: max\b/.test(content),
      `${file}: must set queue: max so GitHub does not silently drop older pending stable releases when multiple release workflows fire on the same push`,
    );

    // Queued release runs may start against a stale checkout. Each workflow must
    // refresh to the current branch head before semantic-release runs, otherwise
    // @semantic-release/git push fails non-fast-forward against a branch that
    // moved while the run was queued. The stable-only refresh that predates
    // queue: max would leave main-firing queued runs against stale SHAs.
    assert.equal(
      /if: github\.ref_name == 'stable'\s*\n\s*run: \|\s*\n\s*git fetch origin/.test(content),
      false,
      `${file}: refresh step must not be gated on stable-only; queued main runs also need to refresh to avoid stale-checkout pushes`,
    );
    assert.ok(
      /git fetch origin "\$\{\{ github\.ref_name \}\}" --tags\s*\n\s*git checkout -B "\$\{\{ github\.ref_name \}\}" "origin\/\$\{\{ github\.ref_name \}\}"/.test(content) ||
        // release-stable.yml is stable-only and refreshes against the literal `stable` ref.
        /git fetch origin stable --tags\s*\n\s*git checkout -B stable origin\/stable/.test(content),
      `${file}: must refresh to the current branch head before semantic-release runs`,
    );
  }
});

test('stable-to-main sync waits for stable release completion', async () => {
  const workflow = await readRepoFile('.github/workflows/sync-patches.yml');

  assert.ok(
    workflow.includes('workflow_run:'),
    '.github/workflows/sync-patches.yml: must trigger from release workflow completion, not directly from stable pushes',
  );
  assert.ok(
    /workflows:\s*\n\s*-\s*"📦 Release stable tooling \(CLI\/SDK\/MCP\)"/.test(workflow),
    '.github/workflows/sync-patches.yml: must trigger after the stable release orchestrator completes',
  );
  assert.equal(
    /push:\s*\n\s*branches:\s*\n\s*-\s*stable/.test(workflow),
    false,
    '.github/workflows/sync-patches.yml: must not fire immediately on stable branch pushes',
  );
  assert.ok(
    workflow.includes("github.event.workflow_run.head_branch == 'stable'"),
    '.github/workflows/sync-patches.yml: must scope automatic syncs to stable release runs',
  );
  assert.ok(
    workflow.includes("github.event.workflow_run.conclusion == 'success'") &&
      workflow.includes("github.event.workflow_run.conclusion == 'failure'"),
    '.github/workflows/sync-patches.yml: must wait for release completion while still surfacing failed-release sync PRs for review',
  );
  assert.ok(
    workflow.includes('actions: read'),
    '.github/workflows/sync-patches.yml: must be able to inspect release workflow runs before syncing',
  );
  assert.ok(
    workflow.includes('Wait for stable release lane to drain') &&
      workflow.includes('"📦 Release esign"') &&
      workflow.includes('"📦 Release template-builder"'),
    '.github/workflows/sync-patches.yml: must wait for the remaining stable release workflows before syncing origin/stable',
  );
});

test('stable-to-main sync preserves stable release ancestry', async () => {
  const workflow = await readRepoFile('.github/workflows/sync-patches.yml');

  assert.equal(
    workflow.includes('git merge --squash'),
    false,
    '.github/workflows/sync-patches.yml: stable-to-main sync must not squash because semantic-release needs stable tags reachable from main',
  );
  assert.ok(
    workflow.includes('git merge --no-ff --no-edit origin/stable'),
    '.github/workflows/sync-patches.yml: stable-to-main sync must create a real merge commit',
  );
  assert.ok(
    workflow.includes('git merge-base --is-ancestor origin/stable origin/main') &&
      workflow.includes('git merge-base --is-ancestor origin/stable HEAD'),
    '.github/workflows/sync-patches.yml: sync must guard on and verify stable ancestry',
  );
  assert.ok(
    workflow.includes('release_artifact_only_conflict') &&
      workflow.includes('version-only') &&
      workflow.includes('git checkout --theirs "$f"'),
    '.github/workflows/sync-patches.yml: release artifact conflicts must resolve to stable only when the conflict is version-only',
  );
  assert.equal(
    workflow.includes('git add -A'),
    false,
    '.github/workflows/sync-patches.yml: sync must not commit unresolved conflict markers into review PRs',
  );
  assert.ok(
    workflow.includes("This PR must be merged with GitHub's merge-commit option"),
    '.github/workflows/sync-patches.yml: generated PRs must warn reviewers not to squash away stable ancestry',
  );
});

test('MCP releaserc builds the package before publish so the tarball ships dist/', async () => {
  const content = await readRepoFile('apps/mcp/.releaserc.cjs');
  assert.ok(
    content.includes("prepareCmd: 'pnpm run build'"),
    'apps/mcp/.releaserc.cjs: must build apps/mcp/dist before publish - the root pnpm run build does not produce it',
  );
});

test('stable recovery filters prerelease tags so *-next.* never resumes as @latest', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assert.ok(
    content.includes('listStableMergedTags') && content.includes("isPrereleaseTag"),
    'scripts/release-local-stable.mjs: must expose a stable-only tag filter that excludes -next.* prereleases',
  );
  assert.ok(
    content.includes("expectedBranch === 'stable'") && content.includes('listStableMergedTags(pkg.tagPattern, branchRef)'),
    'scripts/release-local-stable.mjs: stable recovery must consult the prerelease-filtered list',
  );
});

test('stable recovery tracks PyPI gaps when SDK PyPI publishing is enabled', async () => {
  assert.equal(
    shouldRecoverPackageRelease({
      publishComplete: true,
      githubComplete: true,
      pythonPublished: false,
      hasPythonPackages: false,
      tagAtHead: false,
    }),
    false,
    'missing PyPI packages must not trigger recovery when the descriptor is not tracking Python packages',
  );
  assert.equal(
    shouldRecoverPackageRelease({
      publishComplete: true,
      githubComplete: true,
      pythonPublished: false,
      hasPythonPackages: true,
      tagAtHead: false,
    }),
    true,
    'missing PyPI packages must trigger recovery once SDK PyPI tracking is restored',
  );
  assert.equal(
    shouldRecoverPackageRelease({
      publishComplete: false,
      githubComplete: true,
      pythonPublished: false,
      hasPythonPackages: false,
      tagAtHead: false,
    }),
    true,
    'npm publish gaps must still trigger recovery while SDK PyPI publishing is enabled',
  );
  assert.equal(
    shouldRecoverPackageRelease({
      publishComplete: true,
      githubComplete: false,
      pythonPublished: false,
      hasPythonPackages: false,
      tagAtHead: false,
    }),
    true,
    'GitHub release gaps must still trigger recovery while SDK PyPI publishing is enabled',
  );

  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assert.ok(
    content.includes('const SDK_PYPI_ENABLED = true'),
    'scripts/release-local-stable.mjs: must keep the SDK PyPI enabled state next to the recovery decision',
  );
  assert.ok(
    /name: 'sdk'[\s\S]*\.\.\.\(SDK_PYPI_ENABLED[\s\S]*pythonPackages: SDK_PYTHON_PACKAGES[\s\S]*preparePythonSnapshot: prepareSdkPythonSnapshot/.test(content),
    'scripts/release-local-stable.mjs: SDK Python tracking and snapshot recovery must move together behind SDK_PYPI_ENABLED',
  );
  assert.ok(
    /function prepareSdkPythonSnapshot[\s\S]*pnpm'[\s\S]*'run'[\s\S]*'generate:all'[\s\S]*build-python-sdk\.mjs/.test(content),
    'scripts/release-local-stable.mjs: recovered SDK Python snapshots must regenerate artifacts before building wheels',
  );
});

test('release configs suppress per-PR comment spam on prereleases', async () => {
  const releasercPaths = [
    'packages/superdoc/.releaserc.cjs',
    'packages/react/.releaserc.cjs',
    'packages/sdk/.releaserc.cjs',
    'packages/template-builder/.releaserc.cjs',
    'packages/esign/.releaserc.cjs',
    'apps/cli/.releaserc.cjs',
    'apps/mcp/.releaserc.cjs',
    'apps/vscode-ext/.releaserc.cjs',
    'apps/create/.releaserc.cjs',
  ];

  for (const releasercPath of releasercPaths) {
    const content = await readRepoFile(releasercPath);

    const usesGithubPlugin = content.includes("'@semantic-release/github'");
    const usesLinearPlugin = content.includes("'semantic-release-linear-app'");

    if (!usesGithubPlugin && !usesLinearPlugin) continue;

    assert.ok(
      content.includes('const shouldCommentOnRelease = !isPrerelease'),
      `${releasercPath}: must define shouldCommentOnRelease = !isPrerelease so the prerelease comment gate is consistent across configs`,
    );

    if (usesGithubPlugin) {
      assert.ok(
        content.includes('successCommentCondition: shouldCommentOnRelease ? undefined : false'),
        `${releasercPath}: @semantic-release/github must gate successCommentCondition through shouldCommentOnRelease so prereleases don't re-comment on every PR after a stable -> main sync`,
      );
    }

    if (usesLinearPlugin) {
      assert.ok(
        content.includes('addComment: shouldCommentOnRelease'),
        `${releasercPath}: semantic-release-linear-app addComment must be gated through shouldCommentOnRelease so prereleases don't post duplicate Linear comments after a stable -> main sync`,
      );
      assert.equal(
        content.includes('addComment: true'),
        false,
        `${releasercPath}: semantic-release-linear-app must not hardcode addComment: true`,
      );
    }
  }
});

test('release-state probes wrap fetch in bounded retry to absorb transient blips', async () => {
  const content = await readRepoFile('scripts/release-local-stable.mjs');
  assert.ok(
    content.includes('async function fetchWithRetry'),
    'scripts/release-local-stable.mjs: must define a fetchWithRetry helper',
  );
  // Only the helper itself should call bare `fetch(...)`; everywhere else must
  // route through fetchWithRetry. Allow exactly one bare-fetch occurrence (the
  // implementation inside fetchWithRetry).
  const bareFetchCount = (content.match(/[^.\w]fetch\(/g) ?? []).length;
  assert.equal(
    bareFetchCount,
    1,
    `scripts/release-local-stable.mjs: every release-state fetch must go through fetchWithRetry; found ${bareFetchCount} bare fetch(...) calls (expected 1, the one inside fetchWithRetry itself)`,
  );
  assert.ok(
    /fetchWithRetry\(\s*`https:\/\/api\.github\.com/.test(content),
    'scripts/release-local-stable.mjs: GitHub release probes must retry',
  );
  assert.ok(
    /fetchWithRetry\(\s*`https:\/\/pypi\.org\/pypi/.test(content),
    'scripts/release-local-stable.mjs: PyPI release probes must retry',
  );
});

test('docs promotion is keyed to a real superdoc tag from the orchestrator run', async () => {
  const promoteWorkflow = await readRepoFile('.github/workflows/promote-stable-docs.yml');
  const workflowRunBlock = promoteWorkflow.match(/workflow_run:[\s\S]*?workflow_dispatch:/)?.[0] ?? '';
  assert.ok(
    promoteWorkflow.includes('workflow_run:'),
    '.github/workflows/promote-stable-docs.yml: must trigger on workflow_run completion',
  );
  assert.ok(
    /workflows:\s*\n\s*-\s*"📦 Release stable tooling \(CLI\/SDK\/MCP\)"/.test(promoteWorkflow),
    '.github/workflows/promote-stable-docs.yml: must trigger off the stable orchestrator workflow',
  );
  assert.equal(
    /"📦 Release CLI"|"📦 Release SDK"|"📦 Release MCP"|"📦 Release react"|"📦 Release esign"|"📦 Release template-builder"|"📦 Release vscode-ext"/.test(workflowRunBlock),
    false,
    '.github/workflows/promote-stable-docs.yml: must trigger only off the orchestrator, not per-package workflows',
  );
  // Chain-independent failures (e.g. tools fail, superdoc releases) must
  // still promote docs. The git-tag detection is the source of truth.
  assert.ok(
    promoteWorkflow.includes("github.event.workflow_run.conclusion == 'success'") &&
      promoteWorkflow.includes("github.event.workflow_run.conclusion == 'failure'"),
    '.github/workflows/promote-stable-docs.yml: must accept both success and failure conclusions so a tools-chain failure does not block superdoc-driven docs promotion',
  );
  assert.ok(
    promoteWorkflow.includes("github.event.workflow_run.head_branch == 'stable'"),
    '.github/workflows/promote-stable-docs.yml: must scope promotion to stable',
  );
  assert.ok(
    promoteWorkflow.includes('Wait for stable release lane to drain') &&
      promoteWorkflow.includes('gh run list') &&
      promoteWorkflow.includes('"📦 Release stable tooling (CLI/SDK/MCP)" or .name == "📦 Release esign" or .name == "📦 Release template-builder"'),
    '.github/workflows/promote-stable-docs.yml: must wait for the stable release lane to drain before inspecting origin/stable',
  );
  assert.ok(
    promoteWorkflow.includes("git tag --merged origin/stable --list 'v[0-9]*'") &&
      promoteWorkflow.includes('git tag --merged "${HEAD_SHA}" --list'),
    '.github/workflows/promote-stable-docs.yml: must detect a real SuperDoc release (not a no-op) before pushing docs-stable',
  );
  // semantic-release pushes the v* tag during prepare, before publish runs.
  // A failed publish leaves the tag on origin without the npm tarball, so
  // tag presence alone is not sufficient evidence that the release shipped.
  assert.ok(
    promoteWorkflow.includes('npm view "superdoc@${version}"') &&
      promoteWorkflow.includes('npm view "@harbour-enterprises/superdoc@${version}"'),
    '.github/workflows/promote-stable-docs.yml: must verify npm publish completed for both superdoc and @harbour-enterprises/superdoc before promoting docs-stable, otherwise a tag-without-publish failure would advance docs to an unshipped version',
  );
  assert.ok(
    promoteWorkflow.includes('refs/heads/docs-stable'),
    '.github/workflows/promote-stable-docs.yml: must push to docs-stable',
  );
  assert.ok(
    promoteWorkflow.includes('git log --oneline origin/stable..origin/docs-stable -- apps/docs/'),
    '.github/workflows/promote-stable-docs.yml: must refuse to overwrite docs commits that exist only on docs-stable',
  );
  assert.ok(
    promoteWorkflow.includes('git push --force-with-lease=refs/heads/docs-stable:"${expected}" origin "${target}:refs/heads/docs-stable"'),
    '.github/workflows/promote-stable-docs.yml: must use force-with-lease when promoting the docs-stable pointer',
  );
});

test('docs promotion supports manual workflow_dispatch with optional sha input', async () => {
  const promoteWorkflow = await readRepoFile('.github/workflows/promote-stable-docs.yml');
  assert.ok(
    promoteWorkflow.includes('workflow_dispatch:'),
    '.github/workflows/promote-stable-docs.yml: must expose workflow_dispatch for manual promotion',
  );
  assert.ok(
    /sha:\s*\n\s*description:/.test(promoteWorkflow),
    '.github/workflows/promote-stable-docs.yml: must accept an optional sha input',
  );
  assert.ok(
    promoteWorkflow.includes("github.event_name == 'workflow_dispatch'"),
    '.github/workflows/promote-stable-docs.yml: job must allow workflow_dispatch in addition to workflow_run',
  );
  // Manual path must NOT depend on the auto-path detect step output, otherwise
  // a manual run would skip the push (detect only runs on workflow_run).
  assert.ok(
    /Push docs-stable \(manual\)[\s\S]*if:\s*github\.event_name == 'workflow_dispatch'/.test(promoteWorkflow),
    '.github/workflows/promote-stable-docs.yml: manual push step must gate on workflow_dispatch only, not on detect.outputs',
  );
  assert.ok(
    /Push docs-stable \(manual\)[\s\S]*git log --oneline "\$\{target\}"\.\.origin\/docs-stable -- apps\/docs\//.test(
      promoteWorkflow,
    ),
    '.github/workflows/promote-stable-docs.yml: manual promotion must guard against overwriting docs commits unique to docs-stable',
  );
  assert.ok(
    /Push docs-stable \(manual\)[\s\S]*git push --force-with-lease=refs\/heads\/docs-stable:"\$\{expected\}" origin "\$\{target\}:refs\/heads\/docs-stable"/.test(
      promoteWorkflow,
    ),
    '.github/workflows/promote-stable-docs.yml: manual promotion must use force-with-lease',
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
    content.includes('sdk-release-publish.mjs'),
    'scripts/release-local-stable.mjs: SDK reruns must resume npm publish explicitly',
  );
  assert.ok(
    content.includes('resumeMcpPublish') && content.includes('apps/mcp'),
    'scripts/release-local-stable.mjs: MCP reruns must have an explicit resume path',
  );
  assert.ok(
    content.includes('resumeCliPublish') && content.includes('apps/cli/scripts/publish.js'),
    'scripts/release-local-stable.mjs: CLI reruns must resume via its dedicated publish script',
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
