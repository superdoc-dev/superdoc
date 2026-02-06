#!/usr/bin/env tsx

/**
 * Set the superdoc version in the harness package.
 *
 * Usage:
 *   pnpm version <version>           # npm version (e.g., 1.4.0, 1.4.0-next.3)
 *   pnpm version <path>              # Local path (directory or tarball, already built/packed)
 *   pnpm version local               # Build + pack local repo superdoc, install tarball
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
import { findWorkspaceRoot } from './workspace-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const workspaceRoot = findWorkspaceRoot(rootDir) ?? rootDir;
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

function findRepoRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, 'packages', 'superdoc', 'package.json');
    if (fs.existsSync(candidate)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function packLocalSuperdoc(): { tarballPath: string; superdocDir: string } {
  const repoRoot = findRepoRoot(rootDir);
  if (!repoRoot) {
    throw new Error('Could not find repo root with packages/superdoc. Use a path or npm version instead.');
  }
  const superdocDir = path.join(repoRoot, 'packages', 'superdoc');
  console.log(colors.info(`Packing local superdoc from ${superdocDir}...`));
  const packResult = spawnSync('pnpm', ['--dir', superdocDir, 'run', 'pack:es'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PNPM_LOG_LEVEL: 'error',
      NPM_CONFIG_LOGLEVEL: 'error',
    },
  });
  if (packResult.error) {
    throw new Error(`pnpm pack failed: ${packResult.error.message}`);
  }
  if (packResult.status !== 0) {
    throw new Error(`pnpm pack exited with code ${packResult.status}`);
  }
  const tarballPath = path.join(superdocDir, 'superdoc.tgz');
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`Expected tarball not found at ${tarballPath}`);
  }
  return { tarballPath, superdocDir };
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

  const resolvedPath = path.resolve(_rootDir, input);
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

  const normalizedInput = input.toLowerCase();
  let result: ResolveResult;
  if (WORKSPACE_SPECIFIERS.has(normalizedInput)) {
    try {
      const { tarballPath, superdocDir } = packLocalSuperdoc();
      const relativeTarballPath = path.relative(harnessDir, tarballPath) || '.';
      result = {
        specifier: `file:${toPosixPath(relativeTarballPath)}`,
        isFile: true,
        installPath: superdocDir,
      };
      console.log(colors.success(`Packed local tarball: ${tarballPath}`));
    } catch (error) {
      console.error(colors.error(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  } else {
    result = resolveSpecifier(input);
  }

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
      const tarballPath = path.join(installPath, 'superdoc.tgz');
      if (fs.existsSync(tarballPath)) {
        const relativeTarballPath = path.relative(harnessDir, tarballPath);
        finalSpecifier = `file:${toPosixPath(relativeTarballPath)}`;
        console.log(colors.info(`Using existing tarball: ${tarballPath}`));
      } else {
        console.log(colors.warning('Using local superdoc path; make sure it is already built/packed.'));
      }
    } else if (isTarball) {
      console.log(colors.info(`Using tarball: ${installPath}`));
    }
  }

  // Update package.json with final specifier (tarball path for local)
  pkg.dependencies.superdoc = finalSpecifier;
  fs.writeFileSync(harnessPkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(colors.success(`Updated packages/harness superdoc dependency to "${finalSpecifier}"`));

  if (isFile) {
    const installedPath = path.join(harnessDir, 'node_modules', 'superdoc');
    if (fs.existsSync(installedPath)) {
      fs.rmSync(installedPath, { recursive: true, force: true });
      console.log(colors.muted('Cleared cached superdoc install.'));
    }
  }

  console.log('');
  console.log(colors.info('Installing...'));

  const installResult = spawnSync(
    'pnpm',
    ['--filter', '@superdoc-testing/harness', 'install', '--no-frozen-lockfile', '--loglevel', 'error'],
    {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PNPM_IGNORE_PEER_DEPENDENCIES: '1',
        PNPM_LOG_LEVEL: 'error',
        NPM_CONFIG_LOGLEVEL: 'error',
        PNPM_LINK_WORKSPACE_PACKAGES: 'false',
        PNPM_PREFER_WORKSPACE_PACKAGES: 'false',
      },
    },
  );

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
