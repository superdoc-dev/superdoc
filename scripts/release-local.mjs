#!/usr/bin/env node

/**
 * Generic reusable local semantic-release runner.
 *
 * Exports helpers used by the thin per-package wrappers
 * (release-local-superdoc.mjs, release-local-cli.mjs) and
 * the combined stable orchestrator (release-local-stable.mjs).
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
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

/**
 * Allowlist of every tag prefix used across the monorepo.
 * Used by pruneLocalOnlyReleaseTags to avoid leaking local-only
 * tags from any package namespace, including the current one, into
 * semantic-release's version detection.
 *
 * MAINTENANCE: when adding a new releasable package with its own
 * tagFormat in .releaserc.*, add its prefix here too. You can find
 * all current tagFormat values with:
 *   grep -r 'tagFormat' --include='*.cjs' --include='*.js' --include='*.mjs' .
 */
const ALL_TAG_PREFIXES = [
  'v',                   // superdoc  (packages/superdoc/.releaserc.cjs)
  'cli-v',              // CLI       (apps/cli/.releaserc.cjs)
  'sdk-v',              // SDK
  'react-v',            // React
  'vscode-v',           // VS Code
  'mcp-v',              // MCP
  'esign-v',            // esign
  'template-builder-v', // template-builder
];

export function run(command, args, options = {}) {
  const { capture = false, env = process.env } = options;
  return execFileSync(command, args, {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

export function listTags(pattern) {
  const output = run('git', ['tag', '--list', pattern], { capture: true }).trim();
  return output ? output.split('\n').map((tag) => tag.trim()).filter(Boolean) : [];
}

export function getRemoteTags() {
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

/**
 * Prune local-only tags across all known release namespaces.
 *
 * This intentionally includes the package being released. A stale local-only
 * tag in the current namespace can skew semantic-release's lastRelease lookup
 * even if it was left behind by a failed or interrupted run.
 */
export function pruneLocalOnlyReleaseTags() {
  const pruned = [];
  const remoteTags = getRemoteTags();

  for (const prefix of ALL_TAG_PREFIXES) {
    const tags = listTags(`${prefix}*`);
    for (const tag of tags) {
      if (remoteTags.has(tag)) continue;
      run('git', ['tag', '-d', tag]);
      pruned.push(tag);
    }
  }

  if (pruned.length > 0) {
    console.log(
      `Pruned ${pruned.length} local-only foreign tags before release: ${pruned.join(', ')}`,
    );
  }
}

function isDryRunEnabled(extraArgs) {
  return extraArgs.includes('--dry-run') || extraArgs.includes('-d');
}

function capture(command, args, env) {
  try {
    return {
      stdout: execFileSync(command, args, {
        cwd: REPO_ROOT,
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
  const branch = getCurrentBranch();
  const env = {
    ...process.env,
    LEFTHOOK: '0',
    // Mirror CI: .releaserc.cjs files read GITHUB_REF_NAME to decide
    // whether to include @semantic-release/git (stable-only plugin).
    GITHUB_REF_NAME: process.env.GITHUB_REF_NAME || branch,
  };
  const args = ['--prefix', packageCwd, 'exec', 'semantic-release', '--no-ci', ...extraArgs];

  if (!isDryRunEnabled(extraArgs)) {
    run('pnpm', args, { env });
    return { dryRun: false, wouldRelease: false };
  }

  // In dry-run mode semantic-release skips prepare/publish/tag creation, so
  // infer whether a release is pending from its preview output instead of tags.
  const { stdout, stderr, error } = capture('pnpm', args, env);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (error) throw error;

  const combinedOutput = `${stdout}\n${stderr}`;
  return {
    dryRun: true,
    wouldRelease: inferDryRunWouldRelease(combinedOutput),
  };
}

/**
 * Main entry point for releasing a single package locally.
 *
 * @param {object} options
 * @param {string} options.packageCwd - Relative path from repo root.
 * @param {string[]} [options.extraArgs] - Additional CLI flags forwarded to semantic-release.
 */
export function releasePackage({ packageCwd, extraArgs = [] }) {
  pruneLocalOnlyReleaseTags();
  return runSemanticRelease(packageCwd, extraArgs);
}
