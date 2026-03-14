import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLBACK_CLI_PACKAGE_VERSION = '0.0.0';

let cachedCliPackageVersion: string | null = null;

function resolveCliPackagePath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, '../../package.json');
}

function parsePackageVersion(rawPackageJson: string): string | null {
  try {
    const parsed = JSON.parse(rawPackageJson) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Keep fallback behavior below when package.json is invalid.
  }

  return null;
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

  try {
    const packageJson = readFileSync(resolveCliPackagePath(), 'utf8');
    const version = parsePackageVersion(packageJson);
    cachedCliPackageVersion = version ?? FALLBACK_CLI_PACKAGE_VERSION;
    return cachedCliPackageVersion;
  } catch {
    cachedCliPackageVersion = FALLBACK_CLI_PACKAGE_VERSION;
    return cachedCliPackageVersion;
  }
}
