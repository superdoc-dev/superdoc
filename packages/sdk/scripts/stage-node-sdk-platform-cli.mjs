#!/usr/bin/env node

/**
 * Stage CLI binaries into Node SDK platform packages.
 *
 * Copies built CLI binaries from apps/cli/platforms/cli-*/bin/
 * into packages/sdk/langs/node/platforms/sdk-*/bin/
 * with integrity validation (size + SHA256 checksum).
 */

import { access, chmod, copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

const CLI_PLATFORMS_ROOT = path.join(REPO_ROOT, 'apps/cli/platforms');
const NODE_SDK_PLATFORMS_ROOT = path.join(REPO_ROOT, 'packages/sdk/langs/node/platforms');
const CLI_MANIFEST_PATH = path.join(REPO_ROOT, 'apps/cli/artifacts/manifest.json');

const MIN_BINARY_SIZE_BYTES = 1_000_000; // 1 MB sanity check

/**
 * Maps CLI platform source packages to Node SDK platform target directories.
 */
const NODE_SDK_PLATFORM_TARGETS = [
  { id: 'darwin-arm64', sourcePackage: 'cli-darwin-arm64', sdkPackage: 'sdk-darwin-arm64', binaryName: 'superdoc' },
  { id: 'darwin-x64', sourcePackage: 'cli-darwin-x64', sdkPackage: 'sdk-darwin-x64', binaryName: 'superdoc' },
  { id: 'linux-x64', sourcePackage: 'cli-linux-x64', sdkPackage: 'sdk-linux-x64', binaryName: 'superdoc' },
  { id: 'linux-arm64', sourcePackage: 'cli-linux-arm64', sdkPackage: 'sdk-linux-arm64', binaryName: 'superdoc' },
  { id: 'windows-x64', sourcePackage: 'cli-windows-x64', sdkPackage: 'sdk-windows-x64', binaryName: 'superdoc.exe' },
];

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

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

async function stageBinary(target, manifest) {
  const sourcePath = path.join(CLI_PLATFORMS_ROOT, target.sourcePackage, 'bin', target.binaryName);

  if (!(await fileExists(sourcePath))) {
    throw new Error(
      `Missing CLI binary for ${target.id}: ${sourcePath}\n` +
        'Build and stage CLI artifacts first: pnpm --prefix apps/cli run build:native:all && pnpm --prefix apps/cli run build:stage',
    );
  }

  const fileStat = await stat(sourcePath);
  if (fileStat.size < MIN_BINARY_SIZE_BYTES) {
    throw new Error(
      `CLI binary for ${target.id} is suspiciously small (${fileStat.size} bytes, minimum ${MIN_BINARY_SIZE_BYTES}).`,
    );
  }

  if (manifest?.[target.id]?.sha256) {
    const actualHash = await computeSha256(sourcePath);
    const expectedHash = manifest[target.id].sha256;
    if (actualHash !== expectedHash) {
      throw new Error(`SHA256 mismatch for ${target.id}: expected ${expectedHash}, got ${actualHash}`);
    }
  }

  const destDir = path.join(NODE_SDK_PLATFORMS_ROOT, target.sdkPackage, 'bin');
  await mkdir(destDir, { recursive: true });

  const destPath = path.join(destDir, target.binaryName);
  await rm(destPath, { force: true });
  await copyFile(sourcePath, destPath);

  if (!target.binaryName.endsWith('.exe')) {
    try {
      await chmod(destPath, 0o755);
    } catch {
      // Non-fatal
    }
  }

  console.log(`  Staged ${target.id}: ${path.relative(REPO_ROOT, destPath)} (${(fileStat.size / 1e6).toFixed(1)} MB)`);
}

async function main() {
  console.log('Staging CLI binaries into Node SDK platform packages...\n');

  const manifest = await loadManifestChecksums(CLI_MANIFEST_PATH);

  for (const target of NODE_SDK_PLATFORM_TARGETS) {
    await stageBinary(target, manifest);
  }

  console.log(`\nStaged ${NODE_SDK_PLATFORM_TARGETS.length} platform binaries into Node SDK packages.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
