import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_PACKAGE_NAME = '@superdoc-dev/cli';
const FALLBACK_CLI_PACKAGE_VERSION = '0.0.0';

let cachedCliPackageVersion: string | null = null;

type CliPackageJson = {
  name?: unknown;
  version?: unknown;
};

function parsePackageJson(rawPackageJson: string): CliPackageJson | null {
  try {
    return JSON.parse(rawPackageJson) as CliPackageJson;
  } catch {
    return null;
  }
}

function isSupportedCliPackageName(name: unknown): boolean {
  return typeof name === 'string' && (name === CLI_PACKAGE_NAME || name.startsWith(`${CLI_PACKAGE_NAME}-`));
}

function resolveCliPackagePath(moduleUrl: string): string | null {
  let currentDir = dirname(fileURLToPath(moduleUrl));

  while (true) {
    const packageJsonPath = resolve(currentDir, 'package.json');

    try {
      const rawPackageJson = readFileSync(packageJsonPath, 'utf8');
      const parsed = parsePackageJson(rawPackageJson);
      if (isSupportedCliPackageName(parsed?.name)) {
        return packageJsonPath;
      }
    } catch {
      // Continue walking up until a matching CLI or platform-package manifest is found.
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function parsePackageVersion(rawPackageJson: string): string | null {
  const parsed = parsePackageJson(rawPackageJson);
  if (typeof parsed?.version === 'string' && parsed.version.length > 0) {
    return parsed.version;
  }

  return null;
}

/**
 * Resolves the CLI package version by walking up from a given module URL
 * until a package.json for the main CLI package or a published platform package is found.
 *
 * @param moduleUrl - The `import.meta.url` of the calling module
 * @returns The resolved version string, or `'0.0.0'` if not found
 */
export function resolveCliPackageVersionFromModuleUrl(moduleUrl: string): string {
  try {
    const packageJsonPath = resolveCliPackagePath(moduleUrl);
    if (!packageJsonPath) {
      return FALLBACK_CLI_PACKAGE_VERSION;
    }

    const packageJson = readFileSync(packageJsonPath, 'utf8');
    return parsePackageVersion(packageJson) ?? FALLBACK_CLI_PACKAGE_VERSION;
  } catch {
    return FALLBACK_CLI_PACKAGE_VERSION;
  }
}

/**
 * Resolves the installed CLI package version from the nearest package.json.
 *
 * @returns Installed CLI package version, or a safe fallback when unavailable.
 */
export function resolveCliPackageVersion(): string {
  if (cachedCliPackageVersion) {
    return cachedCliPackageVersion;
  }

  cachedCliPackageVersion = resolveCliPackageVersionFromModuleUrl(import.meta.url);
  return cachedCliPackageVersion;
}
