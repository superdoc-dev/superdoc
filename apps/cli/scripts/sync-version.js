import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cliRoot, isDirectExecution } from './utils.js';

const CLI_PACKAGE = path.join(cliRoot, 'package.json');

const PLATFORM_PACKAGES = [
  path.join(cliRoot, 'platforms/cli-darwin-arm64/package.json'),
  path.join(cliRoot, 'platforms/cli-darwin-x64/package.json'),
  path.join(cliRoot, 'platforms/cli-linux-x64/package.json'),
  path.join(cliRoot, 'platforms/cli-linux-arm64/package.json'),
  path.join(cliRoot, 'platforms/cli-windows-x64/package.json'),
];

const PLATFORM_PACKAGE_NAMES = [
  '@superdoc-dev/cli-darwin-arm64',
  '@superdoc-dev/cli-darwin-x64',
  '@superdoc-dev/cli-linux-x64',
  '@superdoc-dev/cli-linux-arm64',
  '@superdoc-dev/cli-windows-x64',
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/**
 * Applies workspace protocol specs to platform optional dependencies.
 *
 * @param {Record<string, string> | undefined} optionalDependencies - Existing optional dependencies.
 * @param {string[]} packageNames - Platform package names to update.
 * @returns {Record<string, string>} Updated optionalDependencies object.
 */
export function syncOptionalDependencyVersions(optionalDependencies, packageNames) {
  const synced = { ...(optionalDependencies ?? {}) };
  for (const packageName of packageNames) {
    synced[packageName] = 'workspace:*';
  }
  return synced;
}

/**
 * Synchronizes root and platform package versions.
 *
 * @returns {Promise<void>}
 */
export async function main() {
  const cliPkg = await readJson(CLI_PACKAGE);
  const version = cliPkg.version;

  if (!version || typeof version !== 'string') {
    throw new Error(`Missing or invalid version in ${CLI_PACKAGE}`);
  }

  // Sync optionalDependencies in main CLI package
  cliPkg.optionalDependencies = syncOptionalDependencyVersions(cliPkg.optionalDependencies, PLATFORM_PACKAGE_NAMES);
  await writeJson(CLI_PACKAGE, cliPkg);

  // Sync version in each platform package
  for (const filePath of PLATFORM_PACKAGES) {
    const pkg = await readJson(filePath);
    pkg.version = version;
    await writeJson(filePath, pkg);
  }

  console.log(`Synchronized CLI package versions to ${version}`);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
