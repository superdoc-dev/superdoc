#!/usr/bin/env node

/**
 * Combined stable orchestrator — releases superdoc then CLI in sequence.
 *
 * Usage:
 *   pnpm run release:local [-- --dry-run]
 *   node scripts/release-local-stable.mjs [--dry-run] [--branch=<name>]
 *
 * Flags:
 *   --branch=<name>  Override the expected branch (default: stable)
 *   All other flags are forwarded to both semantic-release invocations.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTags, pruneLocalOnlyReleaseTags, runSemanticRelease } from './release-local.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function getCurrentBranch() {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
}

// ---------------------------------------------------------------------------
// Parse own flags vs forwarded flags
// ---------------------------------------------------------------------------

let expectedBranch = 'stable';
const forwardedArgs = [];

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--branch=')) {
    expectedBranch = arg.slice('--branch='.length);
  } else {
    forwardedArgs.push(arg);
  }
}

// ---------------------------------------------------------------------------
// Branch guard
// ---------------------------------------------------------------------------

const currentBranch = getCurrentBranch();
if (currentBranch !== expectedBranch) {
  console.error(`Expected branch ${expectedBranch} but on ${currentBranch}`);
  console.error('Use --branch=<name> to override.');
  process.exit(1);
}

const isDryRun = forwardedArgs.includes('--dry-run') || forwardedArgs.includes('-d');

// ---------------------------------------------------------------------------
// Release pipeline
// ---------------------------------------------------------------------------

const packages = [
  { name: 'superdoc', packageCwd: 'packages/superdoc', tagPrefix: 'v' },
  { name: 'cli', packageCwd: 'apps/cli', tagPrefix: 'cli-v' },
];

/**
 * @typedef {object} PackageResult
 * @property {'released' | 'would-release' | 'no-op' | 'FAILED (partial)' | 'FAILED' | 'skipped'} status
 * @property {string[]} newTags - Tags created during this release attempt.
 */

/** @type {Map<string, PackageResult>} */
const results = new Map();

let hasFailed = false;

for (const pkg of packages) {
  if (hasFailed) {
    results.set(pkg.name, { status: 'skipped', newTags: [] });
    continue;
  }

  // Remove stale local-only tags first, including tags in the current package
  // namespace, before snapshotting. Otherwise a leftover local tag can skew
  // semantic-release's lastRelease lookup or mask a newly created tag.
  pruneLocalOnlyReleaseTags();

  // Snapshot tags before release to detect new tags. On real releases
  // semantic-release creates+pushes the tag before publish plugins run, so a
  // publish-time failure can still leave behind a real release tag.
  const tagsBefore = new Set(listTags(`${pkg.tagPrefix}*`));

  try {
    const runResult = runSemanticRelease(pkg.packageCwd, forwardedArgs);

    const tagsAfter = new Set(listTags(`${pkg.tagPrefix}*`));
    const newTags = [...tagsAfter].filter((t) => !tagsBefore.has(t));
    const status = runResult.dryRun
      ? (runResult.wouldRelease ? 'would-release' : 'no-op')
      : (newTags.length > 0 ? 'released' : 'no-op');
    results.set(pkg.name, { status, newTags });
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : String(error);
    console.error(`\n${pkg.name} release failed:\n${message}`);

    // Check whether a tag was created before the failure (partial release).
    const tagsAfter = new Set(listTags(`${pkg.tagPrefix}*`));
    const newTags = [...tagsAfter].filter((t) => !tagsBefore.has(t));
    const status = newTags.length > 0 ? 'FAILED (partial)' : 'FAILED';
    results.set(pkg.name, { status, newTags });
    hasFailed = true;
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n--- Release Summary ---');
for (const [name, { status, newTags }] of results) {
  const tagInfo = newTags.length > 0 ? `  [${newTags.join(', ')}]` : '';
  console.log(`  ${name.padEnd(12)} ${status}${tagInfo}`);
}

if (hasFailed) {
  const partials = [...results.entries()].filter(([, r]) => r.status === 'FAILED (partial)');
  const released = [...results.entries()].filter(([, r]) => r.status === 'released');
  const tagsToReview = [...partials, ...released].flatMap(([, r]) => r.newTags);

  if (tagsToReview.length > 0) {
    console.log(`\nTags created before the failure: ${tagsToReview.join(', ')}`);
    console.log('Review these tags and decide whether manual rollback is needed.');
  }
  process.exitCode = 1;
}

// Remind operator about @semantic-release/git behavior on stable
const anyReleased = [...results.values()].some((r) => r.status === 'released');
if (anyReleased && !isDryRun) {
  console.log(
    '\n@semantic-release/git automatically pushes version commits and tags on the stable branch.',
  );
}
