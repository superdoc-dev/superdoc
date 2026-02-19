import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cliRoot, ensureNoUnknownFlags, getOptionalFlagValue, isDirectExecution, repoRoot } from './utils.js';

const npmCacheDir = path.join(repoRoot, '.cache', 'npm');
const allowedFlags = new Set(['--tag', '--dry-run']);

const PLATFORM_PACKAGES = [
  '@superdoc-dev/cli-darwin-arm64',
  '@superdoc-dev/cli-darwin-x64',
  '@superdoc-dev/cli-linux-x64',
  '@superdoc-dev/cli-linux-arm64',
  '@superdoc-dev/cli-windows-x64',
];
const MAIN_PACKAGE = '@superdoc-dev/cli';

const PACKAGE_DIR_BY_NAME = {
  '@superdoc-dev/cli-darwin-arm64': path.join(cliRoot, 'platforms/cli-darwin-arm64'),
  '@superdoc-dev/cli-darwin-x64': path.join(cliRoot, 'platforms/cli-darwin-x64'),
  '@superdoc-dev/cli-linux-x64': path.join(cliRoot, 'platforms/cli-linux-x64'),
  '@superdoc-dev/cli-linux-arm64': path.join(cliRoot, 'platforms/cli-linux-arm64'),
  '@superdoc-dev/cli-windows-x64': path.join(cliRoot, 'platforms/cli-windows-x64'),
  '@superdoc-dev/cli': cliRoot,
};

function getPackageVersion(packageName) {
  const pkgDir = PACKAGE_DIR_BY_NAME[packageName];
  if (!pkgDir) {
    throw new Error(`No package directory mapping found for ${packageName}`);
  }

  const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  if (!pkg.version) {
    throw new Error(`Failed to read version for ${packageName}`);
  }
  return pkg.version;
}

function createNpmEnv(baseEnv, authToken) {
  return {
    ...baseEnv,
    npm_config_cache: npmCacheDir,
    ...(authToken ? { NODE_AUTH_TOKEN: authToken } : {}),
  };
}

/**
 * Checks whether a package version is already published to npm.
 *
 * @param {string} packageName - Package name.
 * @param {string} version - Version to check.
 * @param {string} authToken - npm token.
 * @param {NodeJS.ProcessEnv} [baseEnv=process.env] - Base environment for the command.
 * @param {typeof spawnSync} [spawn=spawnSync] - Command runner (injectable for tests).
 * @returns {boolean} `true` if published, otherwise `false`.
 * @throws {Error} If the check fails for reasons other than a not-found response.
 */
export function isAlreadyPublished(packageName, version, authToken, baseEnv = process.env, spawn = spawnSync) {
  const result = spawn('npm', ['view', `${packageName}@${version}`, 'version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: createNpmEnv(baseEnv, authToken),
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    return true;
  }

  const stderr = (result.stderr ?? '').toString();
  if (stderr.includes('E404') || stderr.includes('Not found') || stderr.includes('not found')) {
    return false;
  }

  const stdout = (result.stdout ?? '').toString();
  const details = (stderr || stdout).trim() || `exit status ${result.status ?? 'unknown'}`;
  throw new Error(`Failed to check published version for ${packageName}@${version}: ${details}`);
}

function runPnpmPublish(packageName, tag, dryRun, authToken, baseEnv = process.env) {
  const pkgDir = PACKAGE_DIR_BY_NAME[packageName];
  if (!pkgDir) {
    throw new Error(`No package directory mapping found for ${packageName}`);
  }

  const version = getPackageVersion(packageName);
  if (!dryRun && isAlreadyPublished(packageName, version, authToken, baseEnv)) {
    console.log(`Skipping ${packageName}@${version} (already published).`);
    return;
  }

  const args = ['publish', '--access', 'public', '--tag', tag, '--no-git-checks'];
  if (dryRun) args.push('--dry-run');

  console.log(`Publishing ${packageName} (${tag})${dryRun ? ' [dry-run]' : ''}...`);
  const result = spawnSync('pnpm', args, {
    cwd: pkgDir,
    stdio: 'inherit',
    env: createNpmEnv(baseEnv, authToken),
  });

  if (result.status !== 0) {
    throw new Error(`Publish failed for ${packageName}`);
  }
}

/**
 * Parses and validates publish-script CLI options.
 *
 * @param {string[]} argv - CLI args.
 * @param {NodeJS.ProcessEnv} [env=process.env] - Environment used to resolve auth tokens.
 * @returns {{ tag: string; dryRun: boolean; authToken: string }}
 * @throws {Error} If options are invalid or auth is missing for non-dry runs.
 */
export function resolvePublishOptions(argv, env = process.env) {
  ensureNoUnknownFlags(argv, allowedFlags);
  const tag = getOptionalFlagValue(argv, '--tag') ?? 'latest';
  const dryRun = argv.includes('--dry-run');
  const authToken = env.NODE_AUTH_TOKEN ?? env.NPM_TOKEN ?? '';

  if (!dryRun && !authToken) {
    throw new Error('Missing npm auth token. Set NPM_TOKEN or NODE_AUTH_TOKEN in your environment.');
  }

  return { tag, dryRun, authToken };
}

/**
 * Publishes platform packages and the root CLI package.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - CLI args.
 * @param {NodeJS.ProcessEnv} [env=process.env] - Environment for publish commands.
 * @returns {void}
 */
export function main(argv = process.argv.slice(2), env = process.env) {
  const { tag, dryRun, authToken } = resolvePublishOptions(argv, env);
  mkdirSync(npmCacheDir, { recursive: true });

  for (const packageName of PLATFORM_PACKAGES) {
    runPnpmPublish(packageName, tag, dryRun, authToken, env);
  }
  runPnpmPublish(MAIN_PACKAGE, tag, dryRun, authToken, env);
}

if (isDirectExecution(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
