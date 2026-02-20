#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, rm, cp, symlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const NODE_SDK_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/node');
const PYTHON_SDK_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/python');
const TOOLS_SOURCE = path.join(REPO_ROOT, 'packages/sdk/tools');
const NPM_CACHE_DIR = path.join(REPO_ROOT, '.cache', 'npm');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');

function parseArgValue(name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

async function run(command, args, { cwd = REPO_ROOT, env = {} } = {}) {
  console.log(`  > ${command} ${args.join(' ')}`);
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    env: { ...process.env, ...env },
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

/**
 * Replace a symlink with a real copy of the tools directory for packaging,
 * then restore the symlink when done.
 */
async function withMaterializedTools(symlinkPath, relativeTarget, fn) {
  let wasSymlink = false;
  try {
    const stat = await lstat(symlinkPath);
    wasSymlink = stat.isSymbolicLink();
  } catch {
    // path doesn't exist — nothing to restore
  }

  if (wasSymlink) {
    await rm(symlinkPath, { recursive: true, force: true });
  }
  await cp(TOOLS_SOURCE, symlinkPath, { recursive: true });
  // Remove Python-only __init__.py from Node copies
  try { await rm(path.join(symlinkPath, '__init__.py'), { force: true }); } catch { /* noop */ }

  try {
    await fn();
  } finally {
    if (wasSymlink) {
      await rm(symlinkPath, { recursive: true, force: true });
      await symlink(relativeTarget, symlinkPath);
    }
  }
}

async function main() {
  const distTag = parseArgValue('--tag') ?? process.env.RELEASE_DIST_TAG ?? 'latest';

  if (!dryRun) {
    const npmToken = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN;
    if (!npmToken) {
      throw new Error('Missing npm auth token. Set NODE_AUTH_TOKEN or NPM_TOKEN before sdk:release.');
    }
  }

  console.log(`SDK release pipeline${dryRun ? ' (dry-run)' : ''}...`);

  // Shared steps
  await run('node', [path.join(REPO_ROOT, 'packages/sdk/scripts/sync-sdk-version.mjs')]);
  await run('node', [path.join(REPO_ROOT, 'scripts/generate-all.mjs')]);
  await run('node', [path.join(REPO_ROOT, 'packages/sdk/scripts/sdk-validate.mjs')]);

  // --- Node SDK ---
  console.log('\n--- Node SDK ---');
  await run('pnpm', ['run', 'build'], { cwd: NODE_SDK_DIR });

  await mkdir(NPM_CACHE_DIR, { recursive: true });

  const publishArgs = [
    'publish',
    '--access',
    'public',
    '--tag',
    distTag,
    '--no-git-checks',
  ];
  if (dryRun) publishArgs.push('--dry-run');

  await run('pnpm', publishArgs, {
    cwd: NODE_SDK_DIR,
    env: {
      npm_config_cache: NPM_CACHE_DIR,
      NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN ?? '',
    },
  });

  // --- Python SDK ---
  // Python publishing is handled by the release-sdk.yml workflow via PyPI trusted publishing (OIDC).
  // This script only builds the wheel for local verification.
  console.log('\n--- Python SDK (build only — publish via release-sdk.yml workflow) ---');
  const pythonToolsSymlink = path.join(PYTHON_SDK_DIR, 'superdoc', 'tools');

  await withMaterializedTools(pythonToolsSymlink, '../../../tools', async () => {
    await rm(path.join(PYTHON_SDK_DIR, 'dist'), { recursive: true, force: true });
    await rm(path.join(PYTHON_SDK_DIR, 'build'), { recursive: true, force: true });

    await run('python3', ['-m', 'build'], { cwd: PYTHON_SDK_DIR });
    console.log('  Python wheel built. Use the release-sdk.yml workflow to publish to PyPI.');

    // Clean build artifacts
    await rm(path.join(PYTHON_SDK_DIR, 'dist'), { recursive: true, force: true });
    await rm(path.join(PYTHON_SDK_DIR, 'build'), { recursive: true, force: true });
    await rm(path.join(PYTHON_SDK_DIR, 'superdoc_sdk.egg-info'), { recursive: true, force: true });
    try { await rm(path.join(PYTHON_SDK_DIR, 'setup.py'), { force: true }); } catch { /* noop */ }
  });

  console.log(`\nSDK release${dryRun ? ' dry-run' : ''} complete.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
