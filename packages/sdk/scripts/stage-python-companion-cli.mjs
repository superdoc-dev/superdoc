#!/usr/bin/env node

import { access, chmod, copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON_CLI_PLATFORM_TARGETS } from './python-embedded-cli-targets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

const CLI_PLATFORMS_ROOT = path.join(REPO_ROOT, 'apps/cli/platforms');
const PYTHON_PLATFORMS_ROOT = path.join(REPO_ROOT, 'packages/sdk/langs/python/platforms');
const CLI_MANIFEST_PATH = path.join(REPO_ROOT, 'apps/cli/artifacts/manifest.json');

const MIN_BINARY_SIZE_BYTES = 1_000_000; // 1 MB — sanity check

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the CLI build manifest and normalize its targets array into a
 * { [targetId]: { sha256 } } map for O(1) lookups during staging.
 *
 * Manifest shape (from build-native-cli.js):
 *   { targets: [{ target: "darwin-arm64", sha256: "abc...", ... }] }
 */
async function loadManifestChecksums(manifestFilePath) {
  try {
    const raw = await readFile(manifestFilePath, 'utf8');
    const manifest = JSON.parse(raw);
    if (!Array.isArray(manifest?.targets)) return null;

    const map = {};
    for (const entry of manifest.targets) {
      if (entry.target && entry.sha256) {
        map[entry.target] = { sha256: entry.sha256 };
      }
    }
    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}

async function computeSha256(filePath) {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

export async function stageCompanionBinary(target, { cliPlatformsRoot = CLI_PLATFORMS_ROOT, platformsRoot = PYTHON_PLATFORMS_ROOT, manifest = null } = {}) {
  const sourcePath = path.join(cliPlatformsRoot, target.sourcePackage, 'bin', target.binaryName);

  if (!(await fileExists(sourcePath))) {
    throw new Error(
      `Missing CLI binary for ${target.id}: ${sourcePath}\n` +
        'Build and stage CLI artifacts first: pnpm --prefix apps/cli run build:native:all && pnpm --prefix apps/cli run build:stage',
    );
  }

  // Integrity check: file size
  const fileStat = await stat(sourcePath);
  if (fileStat.size < MIN_BINARY_SIZE_BYTES) {
    throw new Error(
      `CLI binary for ${target.id} is suspiciously small (${fileStat.size} bytes, minimum ${MIN_BINARY_SIZE_BYTES}). ` +
        'This may be a stub or empty file.',
    );
  }

  // Integrity check: SHA256 checksum against manifest (if available)
  if (manifest?.[target.id]?.sha256) {
    const actualHash = await computeSha256(sourcePath);
    const expectedHash = manifest[target.id].sha256;
    if (actualHash !== expectedHash) {
      throw new Error(
        `SHA256 mismatch for ${target.id}: expected ${expectedHash}, got ${actualHash}`,
      );
    }
  }

  // Copy binary into companion package (preserve tracked .gitkeep/.gitignore)
  const destDir = path.join(platformsRoot, target.companionPypiName, target.companionModuleName, 'bin');
  await mkdir(destDir, { recursive: true });

  const destPath = path.join(destDir, target.binaryName);
  await rm(destPath, { force: true });
  await copyFile(sourcePath, destPath);

  if (!target.binaryName.endsWith('.exe')) {
    try {
      await chmod(destPath, 0o755);
    } catch {
      // Non-fatal; runtime will surface execution errors if permissions are invalid.
    }
  }

  console.log(`  Staged ${target.id}: ${path.relative(REPO_ROOT, destPath)} (${(fileStat.size / 1e6).toFixed(1)} MB)`);
}

export async function stageAllCompanionBinaries({
  targets = PYTHON_CLI_PLATFORM_TARGETS,
  cliPlatformsRoot = CLI_PLATFORMS_ROOT,
  platformsRoot = PYTHON_PLATFORMS_ROOT,
  manifestPath = CLI_MANIFEST_PATH,
} = {}) {
  const manifest = manifestPath ? await loadManifestChecksums(manifestPath) : null;

  for (const target of targets) {
    await stageCompanionBinary(target, { cliPlatformsRoot, platformsRoot, manifest });
  }

  console.log(`Staged ${targets.length} platform binaries into companion packages.`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  await stageAllCompanionBinaries();
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
