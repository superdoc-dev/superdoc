import { chmodSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuperDocCliError } from './errors.js';

const require = createRequire(import.meta.url);

type SupportedTarget = 'darwin-arm64' | 'darwin-x64' | 'linux-x64' | 'linux-arm64' | 'windows-x64';

const TARGET_TO_PACKAGE: Record<SupportedTarget, string> = {
  'darwin-arm64': '@superdoc-dev/sdk-darwin-arm64',
  'darwin-x64': '@superdoc-dev/sdk-darwin-x64',
  'linux-x64': '@superdoc-dev/sdk-linux-x64',
  'linux-arm64': '@superdoc-dev/sdk-linux-arm64',
  'windows-x64': '@superdoc-dev/sdk-windows-x64',
};

const TARGET_TO_DIR: Record<SupportedTarget, string> = {
  'darwin-arm64': 'sdk-darwin-arm64',
  'darwin-x64': 'sdk-darwin-x64',
  'linux-x64': 'sdk-linux-x64',
  'linux-arm64': 'sdk-linux-arm64',
  'windows-x64': 'sdk-windows-x64',
};

function resolveTarget(): SupportedTarget | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (platform === 'win32' && arch === 'x64') return 'windows-x64';

  return null;
}

function binaryNameForTarget(target: SupportedTarget): string {
  return target === 'windows-x64' ? 'superdoc.exe' : 'superdoc';
}

function ensureExecutable(binaryPath: string): void {
  if (process.platform === 'win32') return;
  try {
    chmodSync(binaryPath, 0o755);
  } catch {
    // Non-fatal: if chmod fails, spawn() will surface the real execution error.
  }
}

function resolveFromPlatformPackage(target: SupportedTarget): string | null {
  const pkg = TARGET_TO_PACKAGE[target];
  const binaryName = binaryNameForTarget(target);

  try {
    return require.resolve(`${pkg}/bin/${binaryName}`);
  } catch {
    return null;
  }
}

function resolveFromWorkspaceFallback(target: SupportedTarget): string | null {
  const binaryName = binaryNameForTarget(target);
  const dirName = TARGET_TO_DIR[target];
  const filePath = path.resolve(fileURLToPath(new URL('../../platforms', import.meta.url)), dirName, 'bin', binaryName);
  if (!existsSync(filePath)) return null;
  return filePath;
}

/**
 * Resolve the path to the embedded SuperDoc CLI binary for the current platform.
 */
export function resolveEmbeddedCliBinary(): string {
  const target = resolveTarget();
  if (!target) {
    throw new SuperDocCliError('No embedded SuperDoc CLI binary is available for this platform.', {
      code: 'UNSUPPORTED_PLATFORM',
      details: {
        platform: process.platform,
        arch: process.arch,
      },
    });
  }

  const platformPackagePath = resolveFromPlatformPackage(target);
  const resolvedPath = platformPackagePath ?? resolveFromWorkspaceFallback(target);

  if (!resolvedPath) {
    throw new SuperDocCliError('Embedded SuperDoc CLI binary is missing for this platform.', {
      code: 'CLI_BINARY_MISSING',
      details: {
        target,
        packageName: TARGET_TO_PACKAGE[target],
      },
    });
  }

  ensureExecutable(resolvedPath);
  return resolvedPath;
}
