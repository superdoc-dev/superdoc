#!/usr/bin/env tsx

/**
 * Set the superdoc version in the harness package.
 *
 * Usage:
 *   pnpm version <version>           # npm version (e.g., 1.4.0, 1.4.0-next.3)
 *   pnpm version <path>              # Local path (directory or tarball, already built/packed)
 *   pnpm version local               # Use workspace superdoc (monorepo)
 *   pnpm version ~/dev/superdoc      # Monorepo root (auto-finds packages/superdoc)
 *
 * Examples:
 *   pnpm version 1.4.0
 *   pnpm version 1.4.0-next.3
 *   pnpm version local
 *   pnpm version ../superdoc
 *   pnpm version ~/dev/superdoc
 *   pnpm version ./superdoc-1.4.0.tgz
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { colors } from './terminal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const harnessPkgPath = path.resolve(rootDir, 'packages/harness/package.json');
const harnessDir = path.dirname(harnessPkgPath);

/** Minimal fs interface for dependency injection */
export interface FsLike {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  statSync?(path: string): { isDirectory(): boolean };
}

/** Result from resolveSpecifier */
export interface ResolveResult {
  specifier: string;
  isFile: boolean;
  installPath: string | null;
  error?: string;
}

/** Options for resolveSpecifier */
export interface ResolveOptions {
  rootDir?: string;
  harnessDir?: string;
  deps?: {
    fs?: FsLike;
  };
}

const WORKSPACE_SPECIFIERS = new Set(['local', 'workspace']);

function findWorkspaceRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const marker = path.join(current, 'pnpm-workspace.yaml');
    if (fs.existsSync(marker)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Convert a path to POSIX format (forward slashes).
 */
export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

/**
 * Check if a directory contains the superdoc package.
 */
export function isSuperdocPackage(dir: string, deps: { fs?: FsLike } = {}): boolean {
  const _fs = deps.fs || fs;
  const pkgPath = path.join(dir, 'package.json');
  if (!_fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(_fs.readFileSync(pkgPath, 'utf8'));
    return pkg.name === 'superdoc';
  } catch {
    return false;
  }
}

/**
 * Resolve the input to a package specifier.
 */
export function resolveSpecifier(input: string, options: ResolveOptions = {}): ResolveResult {
  const _rootDir = options.rootDir || rootDir;
  const _harnessDir = options.harnessDir || harnessDir;
  const _fs = options.deps?.fs || fs;
  const normalizedInput = input.toLowerCase();

  if (WORKSPACE_SPECIFIERS.has(normalizedInput)) {
    return {
      specifier: 'workspace:*',
      isFile: false,
      installPath: null,
    };
  }

  const resolvedPath = path.resolve(_rootDir, input);
  const workspaceRoot = findWorkspaceRoot(_rootDir);
  const isInWorkspace = (value: string): boolean =>
    Boolean(workspaceRoot) && value.startsWith(`${workspaceRoot}${path.sep}`);

  // Handle explicit file: prefix
  if (input.startsWith('file:')) {
    const rawPath = input.slice('file:'.length);
    const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(_rootDir, rawPath);
    return {
      specifier: input,
      isFile: true,
      installPath: _fs.existsSync(resolved) ? resolved : null,
    };
  }

  // Handle path that exists on filesystem
  if (_fs.existsSync(resolvedPath)) {
    const stat = (_fs as typeof fs).statSync(resolvedPath);

    if (stat.isDirectory()) {
      // Check if this is the superdoc package directory itself
      if (isSuperdocPackage(resolvedPath, { fs: _fs })) {
        if (isInWorkspace(resolvedPath)) {
          return {
            specifier: 'workspace:*',
            isFile: false,
            installPath: resolvedPath,
          };
        }
        const relativePath = path.relative(_harnessDir, resolvedPath) || '.';
        return {
          specifier: `file:${toPosixPath(relativePath)}`,
          isFile: true,
          installPath: resolvedPath,
        };
      }

      // Check packages/superdoc subdirectory (monorepo root)
      const packagesSuperdocDir = path.join(resolvedPath, 'packages', 'superdoc');
      if (isSuperdocPackage(packagesSuperdocDir, { fs: _fs })) {
        if (isInWorkspace(packagesSuperdocDir)) {
          return {
            specifier: 'workspace:*',
            isFile: false,
            installPath: packagesSuperdocDir,
          };
        }
        const relativePath = path.relative(_harnessDir, packagesSuperdocDir) || '.';
        return {
          specifier: `file:${toPosixPath(relativePath)}`,
          isFile: true,
          installPath: packagesSuperdocDir,
        };
      }

      return {
        specifier: input,
        isFile: false,
        installPath: null,
        error: `No superdoc package found in "${resolvedPath}" or "${resolvedPath}/packages/superdoc".`,
      };
    }

    // It's a file (tarball)
    const relativePath = path.relative(_harnessDir, resolvedPath) || '.';
    return {
      specifier: `file:${toPosixPath(relativePath)}`,
      isFile: true,
      installPath: resolvedPath,
    };
  }

  // Assume it's an npm version string
  return {
    specifier: input,
    isFile: false,
    installPath: null,
  };
}

/**
 * Main function - runs when script is executed directly.
 */
function main(): void {
  const [, , input] = process.argv;

  if (!input) {
    console.error(colors.error('Usage: pnpm version <semver|path-to-superdoc>'));
    console.error(colors.muted(''));
    console.error(colors.muted('Examples:'));
    console.error(colors.muted('  pnpm version 1.4.0'));
    console.error(colors.muted('  pnpm version ../superdoc'));
    console.error(colors.muted('  pnpm version local'));
    console.error(colors.muted('  pnpm version ~/dev/superdoc'));
    process.exit(1);
  }

  if (!fs.existsSync(harnessPkgPath)) {
    console.error(colors.error(`Could not find harness package.json at ${harnessPkgPath}`));
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(harnessPkgPath, 'utf8'));

  // Ensure superdoc is in dependencies (move from peerDeps if needed)
  if (!pkg.dependencies) {
    pkg.dependencies = {};
  }

  const result = resolveSpecifier(input);

  if (result.error) {
    console.error(colors.error(result.error));
    console.error(
      colors.warning('Ensure the path points to the superdoc package (or packages/superdoc in a monorepo).'),
    );
    process.exit(1);
  }

  const { specifier, isFile, installPath } = result;

  if (installPath) {
    console.log(colors.info(`Found superdoc at: ${installPath}`));
  }

  // Update package.json
  pkg.dependencies.superdoc = specifier;

  // Remove from peerDependencies if present (we're installing it now)
  if (pkg.peerDependencies?.superdoc) {
    delete pkg.peerDependencies.superdoc;
    if (Object.keys(pkg.peerDependencies).length === 0) {
      delete pkg.peerDependencies;
    }
  }

  let finalSpecifier = specifier;
  if (isFile && installPath) {
    const exists = fs.existsSync(installPath);
    const isDir = exists && fs.statSync(installPath).isDirectory();
    const isTarball = exists && !isDir && installPath.endsWith('.tgz');

    if (isDir) {
      const workspaceRoot = findWorkspaceRoot(rootDir);
      const isWithinWorkspace = Boolean(workspaceRoot) && installPath.startsWith(`${workspaceRoot}${path.sep}`);

      if (isWithinWorkspace) {
        console.log(colors.info(`Using workspace path: ${installPath}`));
      } else {
        const tarballPath = path.join(installPath, 'superdoc.tgz');
        if (fs.existsSync(tarballPath)) {
          const relativeTarballPath = path.relative(harnessDir, tarballPath);
          finalSpecifier = `file:${toPosixPath(relativeTarballPath)}`;
          console.log(colors.info(`Using existing tarball: ${tarballPath}`));
        } else {
          console.log(colors.warning('Using local superdoc path; make sure it is already built/packed.'));
        }
      }
    } else if (isTarball) {
      console.log(colors.info(`Using tarball: ${installPath}`));
    }
  }

  // Update package.json with final specifier (tarball path for local)
  pkg.dependencies.superdoc = finalSpecifier;
  fs.writeFileSync(harnessPkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(colors.success(`Updated packages/harness superdoc dependency to "${finalSpecifier}"`));

  // Install the package
  console.log('');
  console.log(colors.info('Installing...'));

  if (isFile) {
    // Remove any previous install so local builds are reapplied
    const installedPath = path.join(harnessDir, 'node_modules', 'superdoc');
    fs.rmSync(installedPath, { recursive: true, force: true });

    // Also remove pnpm lockfile entry to force re-resolution
    const lockfilePath = path.join(rootDir, 'pnpm-lock.yaml');
    if (fs.existsSync(lockfilePath)) {
      let lockContent = fs.readFileSync(lockfilePath, 'utf8');
      // Remove superdoc entries from lockfile to force fresh install
      lockContent = lockContent.replace(/^\s*superdoc[@:].*$/gm, '');
      lockContent = lockContent.replace(/^\s*'superdoc[@:].*$/gm, '');
      fs.writeFileSync(lockfilePath, lockContent, 'utf8');
    }
  }

  const installResult = spawnSync('pnpm', ['--filter', '@superdoc-testing/harness', 'install', '--loglevel', 'error'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PNPM_IGNORE_PEER_DEPENDENCIES: '1',
      PNPM_LOG_LEVEL: 'error',
      NPM_CONFIG_LOGLEVEL: 'error',
    },
  });

  if (installResult.error) {
    console.error(colors.error(`pnpm install failed: ${installResult.error.message}`));
    process.exit(1);
  }

  if (installResult.status !== 0) {
    console.error(colors.error(`pnpm install exited with code ${installResult.status}`));
    process.exit(installResult.status ?? 1);
  }

  console.log('');
  console.log(
    colors.success(`Superdoc ${isFile ? `(local: ${finalSpecifier})` : finalSpecifier} installed successfully.`),
  );
}

// Run main() only when executed directly (not when imported for testing)
const isMain = process.argv[1]?.includes('set-superdoc-version');
if (isMain) {
  main();
}
