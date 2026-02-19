import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { cliRoot, isDirectExecution } from './utils.js';

const artifactsRoot = path.join(cliRoot, 'artifacts');
const manifestPath = path.join(artifactsRoot, 'manifest.json');

const PLATFORM_DIRS = {
  'darwin-arm64': 'cli-darwin-arm64',
  'darwin-x64': 'cli-darwin-x64',
  'linux-x64': 'cli-linux-x64',
  'linux-arm64': 'cli-linux-arm64',
  'windows-x64': 'cli-windows-x64',
};

function requireFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Required file is missing: ${filePath}`);
  }
}

/**
 * Resolves an artifact manifest path and ensures it stays under artifacts root.
 *
 * @param {string} relativePath - Relative artifact path from manifest.
 * @returns {string} Absolute source path.
 * @throws {Error} If the path is invalid or escapes the artifacts directory.
 */
export function resolveArtifactSourcePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Invalid target relativePath in artifacts manifest.');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Artifact path must be relative: ${relativePath}`);
  }

  const resolvedPath = path.resolve(artifactsRoot, relativePath);
  const normalizedArtifactsRoot = path.resolve(artifactsRoot);

  if (resolvedPath === normalizedArtifactsRoot || !resolvedPath.startsWith(`${normalizedArtifactsRoot}${path.sep}`)) {
    throw new Error(`Artifact path escapes artifacts root: ${relativePath}`);
  }

  return resolvedPath;
}

/**
 * Validates a manifest-provided binary name before staging it to a package `bin/` directory.
 *
 * @param {unknown} binaryName - Candidate binary name from manifest.
 * @param {string} targetId - Target id for error context.
 * @returns {string} Safe binary filename.
 * @throws {Error} If the name is empty or contains path traversal/path separators.
 */
export function validateBinaryName(binaryName, targetId) {
  if (typeof binaryName !== 'string' || !binaryName) {
    throw new Error(`Invalid binaryName for target ${targetId}`);
  }

  if (
    binaryName === '.' ||
    binaryName === '..' ||
    path.isAbsolute(binaryName) ||
    binaryName.includes('/') ||
    binaryName.includes('\\')
  ) {
    throw new Error(`Invalid binaryName for target ${targetId}: ${binaryName}`);
  }

  return binaryName;
}

/**
 * Copies built artifacts into platform package `bin/` directories.
 *
 * @returns {Promise<void>}
 */
export async function main() {
  requireFile(manifestPath);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) {
    throw new Error('Artifacts manifest contains no targets. Run build:native:all first.');
  }

  for (const target of manifest.targets) {
    const targetId = target.target;
    const relativePath = target.relativePath;

    if (typeof targetId !== 'string' || typeof relativePath !== 'string') {
      throw new Error('Invalid target entry in artifacts manifest.');
    }

    const binaryName = validateBinaryName(target.binaryName, targetId);

    const sourcePath = resolveArtifactSourcePath(relativePath);
    requireFile(sourcePath);

    const platformDirName = PLATFORM_DIRS[targetId];
    if (!platformDirName) {
      throw new Error(`No platform package mapping for target ${targetId}`);
    }

    const destPath = path.join(cliRoot, 'platforms', platformDirName, 'bin', binaryName);
    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(sourcePath, destPath);
    console.log(`Staged binary for ${targetId}`);
  }
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
