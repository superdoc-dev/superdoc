#!/usr/bin/env node

/**
 * Publish Node SDK platform packages and root package to npm.
 *
 * Publishes in order:
 *   1. All @superdoc-dev/sdk-* platform packages
 *   2. @superdoc-dev/sdk root package
 *
 * Supports:
 *   --tag <tag>    npm dist-tag (default: latest)
 *   --dry-run      validate without publishing
 *
 * All publish steps are idempotent — already-published versions are skipped.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SDK_NODE_ROOT = path.join(REPO_ROOT, 'packages/sdk/langs/node');

const npmCacheDir = path.join(REPO_ROOT, '.cache', 'npm');

const PLATFORM_PACKAGES = [
  '@superdoc-dev/sdk-darwin-arm64',
  '@superdoc-dev/sdk-darwin-x64',
  '@superdoc-dev/sdk-linux-x64',
  '@superdoc-dev/sdk-linux-arm64',
  '@superdoc-dev/sdk-windows-x64',
];

const MAIN_PACKAGE = '@superdoc-dev/sdk';

const PACKAGE_DIR_BY_NAME = {
  '@superdoc-dev/sdk-darwin-arm64': path.join(SDK_NODE_ROOT, 'platforms/sdk-darwin-arm64'),
  '@superdoc-dev/sdk-darwin-x64': path.join(SDK_NODE_ROOT, 'platforms/sdk-darwin-x64'),
  '@superdoc-dev/sdk-linux-x64': path.join(SDK_NODE_ROOT, 'platforms/sdk-linux-x64'),
  '@superdoc-dev/sdk-linux-arm64': path.join(SDK_NODE_ROOT, 'platforms/sdk-linux-arm64'),
  '@superdoc-dev/sdk-windows-x64': path.join(SDK_NODE_ROOT, 'platforms/sdk-windows-x64'),
  '@superdoc-dev/sdk': SDK_NODE_ROOT,
};

function getPackageVersion(packageName) {
  const pkgDir = PACKAGE_DIR_BY_NAME[packageName];
  if (!pkgDir) throw new Error(`No package directory mapping for ${packageName}`);

  const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  if (!pkg.version) throw new Error(`Failed to read version for ${packageName}`);
  return pkg.version;
}

function createNpmEnv(baseEnv, authToken) {
  return {
    ...baseEnv,
    npm_config_cache: npmCacheDir,
    ...(authToken ? { NODE_AUTH_TOKEN: authToken } : {}),
  };
}

function isAlreadyPublished(packageName, version, authToken, baseEnv = process.env) {
  const result = spawnSync('npm', ['view', `${packageName}@${version}`, 'version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: createNpmEnv(baseEnv, authToken),
  });

  if (result.error) throw result.error;
  if (result.status === 0) return true;

  const stderr = (result.stderr ?? '').toString();
  if (stderr.includes('E404') || stderr.includes('Not found') || stderr.includes('not found')) {
    return false;
  }

  const details = (stderr || (result.stdout ?? '').toString()).trim() || `exit status ${result.status ?? 'unknown'}`;
  throw new Error(`Failed to check published version for ${packageName}@${version}: ${details}`);
}

function runNpmPublish(packageName, tag, dryRun, authToken, baseEnv = process.env) {
  const pkgDir = PACKAGE_DIR_BY_NAME[packageName];
  if (!pkgDir) throw new Error(`No package directory mapping for ${packageName}`);

  const version = getPackageVersion(packageName);
  if (!dryRun && isAlreadyPublished(packageName, version, authToken, baseEnv)) {
    console.log(`Skipping ${packageName}@${version} (already published).`);
    return;
  }

  const args = ['publish', '--access', 'public', '--tag', tag, '--no-git-checks'];
  if (dryRun) args.push('--dry-run');

  console.log(`Publishing ${packageName}@${version} (${tag})${dryRun ? ' [dry-run]' : ''}...`);

  // Run prepack for root package (copies tools directory)
  if (packageName === MAIN_PACKAGE) {
    const prepack = spawnSync('npm', ['run', 'prepack'], {
      cwd: pkgDir,
      stdio: 'inherit',
      env: createNpmEnv(baseEnv, authToken),
    });
    if (prepack.status !== 0) {
      throw new Error(`Prepack failed for ${packageName}`);
    }
  }

  const result = spawnSync('pnpm', args, {
    cwd: pkgDir,
    stdio: 'inherit',
    env: createNpmEnv(baseEnv, authToken),
  });

  if (result.status !== 0) {
    throw new Error(`Publish failed for ${packageName}`);
  }
}

function parseArgs(argv) {
  const tag = (() => {
    const idx = argv.indexOf('--tag');
    return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : 'latest';
  })();
  const dryRun = argv.includes('--dry-run');
  const authToken = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN ?? '';

  if (!dryRun && !authToken) {
    throw new Error('Missing npm auth token. Set NPM_TOKEN or NODE_AUTH_TOKEN.');
  }

  return { tag, dryRun, authToken };
}

function main() {
  const { tag, dryRun, authToken } = parseArgs(process.argv.slice(2));
  mkdirSync(npmCacheDir, { recursive: true });

  console.log(`\nPublishing Node SDK packages (tag: ${tag})...\n`);

  for (const packageName of PLATFORM_PACKAGES) {
    runNpmPublish(packageName, tag, dryRun, authToken);
  }
  runNpmPublish(MAIN_PACKAGE, tag, dryRun, authToken);

  console.log('\nNode SDK publish complete.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
