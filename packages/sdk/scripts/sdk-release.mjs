#!/usr/bin/env node

import { execFile, execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const CLI_APP_DIR = path.join(REPO_ROOT, 'apps/cli');
const SUPERDOC_PACKAGE_DIR = path.join(REPO_ROOT, 'packages/superdoc');
const NODE_SDK_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/node');
const PYTHON_SDK_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/python');
const COMPANION_DIST_DIR = path.join(PYTHON_SDK_DIR, 'companion-dist');
const NPM_CACHE_DIR = path.join(REPO_ROOT, '.cache', 'npm');

const STAGE_COMPANION_SCRIPT = path.join(__dirname, 'stage-python-companion-cli.mjs');

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

async function cleanPythonBuildArtifacts() {
  await rm(path.join(PYTHON_SDK_DIR, 'dist'), { recursive: true, force: true });
  await rm(path.join(PYTHON_SDK_DIR, 'build'), { recursive: true, force: true });
  await rm(COMPANION_DIST_DIR, { recursive: true, force: true });
  await rm(path.join(PYTHON_SDK_DIR, 'superdoc_sdk.egg-info'), { recursive: true, force: true });
  try { await rm(path.join(PYTHON_SDK_DIR, 'setup.py'), { force: true }); } catch { /* noop */ }
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

  // --- Node SDK ---
  // Build before validate: validation check 13 asserts CJS artifacts exist in the pack tarball.
  console.log('\n--- Node SDK ---');
  await run('pnpm', ['run', 'build'], { cwd: NODE_SDK_DIR });

  await run('node', [path.join(REPO_ROOT, 'packages/sdk/scripts/sdk-validate.mjs')]);

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

  // --- Python SDK (build only — publish via release-sdk.yml workflow) ---
  console.log('\n--- Python SDK (build only — publish via release-sdk.yml workflow) ---');
  await run('pnpm', ['run', 'build:es'], { cwd: SUPERDOC_PACKAGE_DIR });
  await run('pnpm', ['--prefix', CLI_APP_DIR, 'run', 'build:native:all']);
  await run('pnpm', ['--prefix', CLI_APP_DIR, 'run', 'build:stage']);
  await run('node', [STAGE_COMPANION_SCRIPT]);

  // build-python-sdk.mjs handles symlink save/restore internally.
  try {
    execFileSync('node', [path.join(__dirname, 'build-python-sdk.mjs')], {
      cwd: REPO_ROOT, stdio: 'inherit', env: process.env,
    });
  } finally {
    await cleanPythonBuildArtifacts();
  }

  console.log(`\nSDK release${dryRun ? ' dry-run' : ''} complete.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
