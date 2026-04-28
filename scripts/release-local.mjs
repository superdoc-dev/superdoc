#!/usr/bin/env node

/**
 * Generic reusable local semantic-release runner.
 *
 * Exports helpers used by the thin per-package wrappers
 * (release-local-superdoc.mjs, release-local-cli.mjs) and
 * the combined stable orchestrator (release-local-stable.mjs).
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Detect the current git branch. Used to set GITHUB_REF_NAME so that
 * .releaserc.cjs files see the same branch locally as they do in CI.
 * Without this, the `isPrerelease` check in each releaserc is always
 * false locally, causing @semantic-release/git to be added on main
 * where CI would not include it.
 */
function getCurrentBranch() {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
}

function getGitHead(cwd = REPO_ROOT) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Allowlist of every release tag pattern used across the monorepo.
 * Used by pruneLocalOnlyReleaseTags to avoid leaking local-only
 * tags from any package namespace, including the current one, into
 * semantic-release's version detection.
 *
 * MAINTENANCE: when adding a new releasable package with its own
 * tagFormat in .releaserc.*, add its pattern here too. You can find
 * all current tagFormat values with:
 *   grep -r 'tagFormat' --include='*.cjs' --include='*.js' --include='*.mjs' .
 */
const ALL_TAG_PATTERNS = [
  'v[0-9]*', // superdoc  (packages/superdoc/.releaserc.cjs)
  'cli-v*', // CLI       (apps/cli/.releaserc.cjs)
  'create-v*', // Create
  'sdk-v*', // SDK
  'react-v*', // React
  'vscode-v*', // VS Code
  'mcp-v*', // MCP
  'esign-v*', // esign
  'template-builder-v*', // template-builder
];

export function run(command, args, options = {}) {
  const { capture = false, env = process.env, cwd = REPO_ROOT } = options;
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

export function listTags(pattern) {
  const output = run('git', ['tag', '--list', pattern], { capture: true }).trim();
  return output
    ? output
        .split('\n')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
}

export function getRemoteTags(options = {}) {
  const { allowFailure = false } = options;
  let output = '';
  try {
    output = run('git', ['ls-remote', '--tags', 'origin'], { capture: true }).trim();
  } catch (error) {
    if (!allowFailure) throw error;
    const details = error && typeof error.stderr === 'string' ? error.stderr.trim() : '';
    console.warn(
      `[release-local] Skipping local-only tag pruning because remote tags could not be read${details ? `: ${details}` : '.'}`,
    );
    return null;
  }

  if (!output) return new Set();

  const tags = output
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter((ref) => ref && ref.startsWith('refs/tags/'))
    .map((ref) => ref.replace(/^refs\/tags\//, ''))
    .map((tag) => tag.replace(/\^\{\}$/, ''));

  return new Set(tags);
}

/**
 * Prune local-only tags across all known release namespaces.
 *
 * This intentionally includes the package being released. A stale local-only
 * tag in the current namespace can skew semantic-release's lastRelease lookup
 * even if it was left behind by a failed or interrupted run.
 */
export function pruneLocalOnlyReleaseTags(options = {}) {
  const { allowRemoteFailure = false } = options;
  const pruned = [];
  const remoteTags = getRemoteTags({ allowFailure: allowRemoteFailure });
  if (remoteTags == null) return;

  for (const pattern of ALL_TAG_PATTERNS) {
    const tags = listTags(pattern);
    for (const tag of tags) {
      if (remoteTags.has(tag)) continue;
      run('git', ['tag', '-d', tag]);
      pruned.push(tag);
    }
  }

  if (pruned.length > 0) {
    console.log(`Pruned ${pruned.length} local-only foreign tags before release: ${pruned.join(', ')}`);
  }
}

function isDryRunEnabled(extraArgs) {
  return extraArgs.includes('--dry-run') || extraArgs.includes('-d');
}

function isReleaseBranchName(branch) {
  return branch === 'stable' || branch === 'main' || /^\d+\.\d+\.x$/.test(branch);
}

function listOriginBranches() {
  const output = run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], {
    capture: true,
  }).trim();

  return output
    ? output
        .split('\n')
        .map((ref) => ref.trim().replace(/^origin\//, ''))
        .filter(Boolean)
    : [];
}

export function listReleaseBranches() {
  return listOriginBranches().filter(isReleaseBranchName);
}

export function detectPreviewTargetFromBranchName(currentBranch, releaseBranches = []) {
  const sortedBranches = [...releaseBranches].sort((left, right) => right.length - left.length);
  for (const branch of sortedBranches) {
    const escaped = escapeRegExp(branch);
    const patterns = [
      new RegExp(`(?:^|[/-])into-${escaped}(?:$|[/-])`),
      new RegExp(`(?:^|[/-])to-${escaped}(?:$|[/-])`),
      new RegExp(`(?:^|[/-])target-${escaped}(?:$|[/-])`),
    ];

    if (patterns.some((pattern) => pattern.test(currentBranch))) {
      return branch;
    }
  }

  return null;
}

function scoreReleaseBranch(branch) {
  try {
    const output = run('git', ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`], {
      capture: true,
    }).trim();
    const [left, right] = output.split(/\s+/).map((value) => Number.parseInt(value, 10));
    if (Number.isNaN(left) || Number.isNaN(right)) return null;
    return { branch, left, right };
  } catch {
    return null;
  }
}

export function inferPreviewTargetBranch({ currentBranch, releaseBranches = listReleaseBranches(), previewBranchOverride } = {}) {
  if (previewBranchOverride) return previewBranchOverride;
  if (releaseBranches.includes(currentBranch)) return currentBranch;

  const namedTarget = detectPreviewTargetFromBranchName(currentBranch, releaseBranches);
  if (namedTarget) return namedTarget;

  const scoredBranches = releaseBranches
    .map((branch) => scoreReleaseBranch(branch))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.left !== right.left) return left.left - right.left;
      if (left.right !== right.right) return left.right - right.right;
      return releaseBranches.indexOf(left.branch) - releaseBranches.indexOf(right.branch);
    });

  return scoredBranches[0]?.branch ?? currentBranch;
}

export function splitPreviewArgs(extraArgs = []) {
  const semanticReleaseArgs = [];
  let previewBranchOverride;

  for (let index = 0; index < extraArgs.length; index += 1) {
    const arg = extraArgs[index];
    if (arg === '--preview-branch') {
      if (index + 1 >= extraArgs.length) {
        throw new Error('--preview-branch requires a branch name');
      }
      previewBranchOverride = extraArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--preview-branch=')) {
      previewBranchOverride = arg.slice('--preview-branch='.length);
      continue;
    }

    semanticReleaseArgs.push(arg);
  }

  return { semanticReleaseArgs, previewBranchOverride };
}

export function buildSemanticReleaseEnv({ branch, extraArgs = [], baseEnv = process.env }) {
  const env = {
    ...baseEnv,
    LEFTHOOK: '0',
    // Mirror CI: .releaserc.cjs files read GITHUB_REF_NAME to decide
    // whether to include @semantic-release/git (stable-only plugin).
    GITHUB_REF_NAME: branch,
  };

  if (isDryRunEnabled(extraArgs)) {
    env.SUPERDOC_RELEASE_PREVIEW = baseEnv.SUPERDOC_RELEASE_PREVIEW || '1';
  }

  return env;
}

export function buildSemanticReleaseArgs({ packageCwd, extraArgs = [] }) {
  return ['--prefix', packageCwd, 'exec', 'semantic-release', '--no-ci', ...extraArgs];
}

function capture(command, args, options = {}) {
  const { env = process.env, cwd = REPO_ROOT } = options;
  try {
    return {
      stdout: execFileSync(command, args, {
        cwd,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      stderr: '',
      error: null,
    };
  } catch (error) {
    return {
      stdout: typeof error.stdout === 'string' ? error.stdout : String(error.stdout ?? ''),
      stderr: typeof error.stderr === 'string' ? error.stderr : String(error.stderr ?? ''),
      error,
    };
  }
}

function parseDiffEntry(line) {
  const parts = line.split('\t');
  const statusCode = parts[0] ?? '';
  const status = statusCode[0];

  if (status === 'R' || status === 'C') {
    return {
      status,
      oldPath: parts[1],
      path: parts[2],
    };
  }

  return {
    status,
    path: parts[1],
  };
}

function copyPathIntoPreview(relativePath, previewRoot) {
  if (!relativePath) return;
  const source = resolve(REPO_ROOT, relativePath);
  const destination = resolve(previewRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { force: true, recursive: true });
}

function removePathFromPreview(relativePath, previewRoot) {
  if (!relativePath) return;
  rmSync(resolve(previewRoot, relativePath), { force: true, recursive: true });
}

function overlayWorkingTree(previewRoot) {
  const diffOutput = run('git', ['diff', '--name-status', '--find-renames', 'HEAD'], { capture: true }).trim();
  if (diffOutput) {
    for (const line of diffOutput.split('\n').filter(Boolean)) {
      const entry = parseDiffEntry(line);
      switch (entry.status) {
        case 'D':
          removePathFromPreview(entry.path, previewRoot);
          break;
        case 'R':
        case 'C':
          if (entry.oldPath && entry.oldPath !== entry.path) {
            removePathFromPreview(entry.oldPath, previewRoot);
          }
          copyPathIntoPreview(entry.path, previewRoot);
          break;
        default:
          copyPathIntoPreview(entry.path, previewRoot);
          break;
      }
    }
  }

  const untrackedOutput = run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { capture: true });
  if (!untrackedOutput) return;

  for (const relativePath of untrackedOutput.split('\0').filter(Boolean)) {
    copyPathIntoPreview(relativePath, previewRoot);
  }
}

function ensurePreviewNodeModules(previewRoot) {
  const source = resolve(REPO_ROOT, 'node_modules');
  const destination = resolve(previewRoot, 'node_modules');
  if (!existsSync(source) || existsSync(destination)) return;
  symlinkSync(source, destination, 'dir');
}

function addRepositoryUrlCandidates(url, candidates) {
  if (!url) return;
  candidates.add(url);

  if (url.startsWith('git+')) {
    addRepositoryUrlCandidates(url.slice(4), candidates);
  }

  const sshMatch = /^(?:ssh:\/\/)?git@([^/:]+)[:/](.+?)(?:\.git)?$/.exec(url);
  if (sshMatch) {
    const [, host, repositoryPath] = sshMatch;
    candidates.add(`https://${host}/${repositoryPath}`);
    candidates.add(`https://${host}/${repositoryPath}.git`);
  }

  if (url.startsWith('https://') || url.startsWith('http://')) {
    const withoutGitSuffix = url.replace(/\.git$/, '');
    candidates.add(withoutGitSuffix);
    candidates.add(`${withoutGitSuffix}.git`);
  }
}

export function getRepositoryUrlCandidates(packageCwd) {
  const candidates = new Set();

  try {
    addRepositoryUrlCandidates(run('git', ['remote', 'get-url', 'origin'], { capture: true }).trim(), candidates);
  } catch {
    // origin is not guaranteed in every checkout; package metadata is the main source
  }

  const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, packageCwd, 'package.json'), 'utf8'));
  if (typeof packageJson.repository === 'string') {
    addRepositoryUrlCandidates(packageJson.repository, candidates);
  } else if (packageJson.repository && typeof packageJson.repository.url === 'string') {
    addRepositoryUrlCandidates(packageJson.repository.url, candidates);
  }

  return [...candidates];
}

function configurePreviewRepositoryUrlRewrite(previewRoot, packageCwd, previewRemote) {
  for (const candidate of getRepositoryUrlCandidates(packageCwd)) {
    run('git', ['config', '--add', `url.${previewRemote}.insteadOf`, candidate], { cwd: previewRoot });
  }
}

function createPreviewWorkspace({ packageCwd, targetBranch }) {
  const previewRoot = mkdtempSync(join(tmpdir(), 'sd-release-preview-'));
  const previewRemote = resolve(previewRoot, 'remote.git');
  const previewWorktree = resolve(previewRoot, 'worktree');
  const head = getGitHead();

  run('git', ['clone', '--bare', '--quiet', '--shared', REPO_ROOT, previewRemote]);
  run('git', ['--git-dir', previewRemote, 'update-ref', `refs/heads/${targetBranch}`, head]);

  run('git', ['clone', '--quiet', '--shared', REPO_ROOT, previewWorktree]);
  run('git', ['checkout', '--quiet', '-B', targetBranch, head], { cwd: previewWorktree });

  overlayWorkingTree(previewWorktree);
  ensurePreviewNodeModules(previewWorktree);
  configurePreviewRepositoryUrlRewrite(previewWorktree, packageCwd, previewRemote);

  return { previewRoot, previewWorktree };
}

export function inferDryRunWouldRelease(output) {
  return output.includes('The next release version is ');
}

/**
 * Run semantic-release for a given package directory.
 *
 * @param {string} packageCwd - Relative path from repo root (e.g. 'packages/superdoc').
 * @param {string[]} extraArgs - Additional CLI flags forwarded to semantic-release.
 */
export function runSemanticRelease(packageCwd, extraArgs = []) {
  const currentBranch = getCurrentBranch();
  const { semanticReleaseArgs, previewBranchOverride } = splitPreviewArgs(extraArgs);
  const dryRun = isDryRunEnabled(semanticReleaseArgs);

  if (!dryRun && previewBranchOverride) {
    throw new Error('--preview-branch is only supported with --dry-run');
  }

  const branch = dryRun
    ? inferPreviewTargetBranch({
        currentBranch,
        previewBranchOverride,
      })
    : currentBranch;
  const env = buildSemanticReleaseEnv({ branch, extraArgs: semanticReleaseArgs });
  const args = buildSemanticReleaseArgs({ packageCwd, extraArgs: semanticReleaseArgs });

  if (!dryRun) {
    run('pnpm', args, { env });
    return { dryRun: false, wouldRelease: false };
  }

  if (branch !== currentBranch) {
    console.log(`[release-local] Dry-run preview target: ${branch} (from ${currentBranch})`);
  }

  const { previewRoot, previewWorktree } = createPreviewWorkspace({ packageCwd, targetBranch: branch });

  try {
    // In dry-run mode semantic-release skips prepare/publish/tag creation, so
    // infer whether a release is pending from its preview output instead of tags.
    const { stdout, stderr, error } = capture('pnpm', args, { env, cwd: previewWorktree });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    if (error) throw error;

    const combinedOutput = `${stdout}\n${stderr}`;
    return {
      dryRun: true,
      wouldRelease: inferDryRunWouldRelease(combinedOutput),
    };
  } finally {
    rmSync(previewRoot, { force: true, recursive: true });
  }
}

/**
 * Main entry point for releasing a single package locally.
 *
 * @param {object} options
 * @param {string} options.packageCwd - Relative path from repo root.
 * @param {string[]} [options.extraArgs] - Additional CLI flags forwarded to semantic-release.
 */
export function releasePackage({ packageCwd, extraArgs = [] }) {
  const { semanticReleaseArgs } = splitPreviewArgs(extraArgs);
  pruneLocalOnlyReleaseTags({ allowRemoteFailure: isDryRunEnabled(semanticReleaseArgs) });
  return runSemanticRelease(packageCwd, extraArgs);
}
