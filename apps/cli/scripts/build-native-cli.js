import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cliRoot, ensureNoUnknownFlags, getOptionalFlagValue, isDirectExecution, repoRoot } from './utils.js';

const cliEntry = path.join(cliRoot, 'src/index.ts');
const cliPackagePath = path.join(cliRoot, 'package.json');
const artifactsRoot = path.join(cliRoot, 'artifacts');
const manifestPath = path.join(artifactsRoot, 'manifest.json');
const allowedFlags = new Set(['--all', '--targets']);

/**
 * Supported Bun native build targets and output metadata.
 *
 * @type {Record<string, { bunTarget: string; binaryName: string }>}
 */
export const TARGETS = {
  'darwin-arm64': { bunTarget: 'bun-darwin-arm64', binaryName: 'superdoc' },
  'darwin-x64': { bunTarget: 'bun-darwin-x64', binaryName: 'superdoc' },
  'linux-x64': { bunTarget: 'bun-linux-x64', binaryName: 'superdoc' },
  'linux-arm64': { bunTarget: 'bun-linux-arm64', binaryName: 'superdoc' },
  'windows-x64': { bunTarget: 'bun-windows-x64', binaryName: 'superdoc.exe' },
};

/**
 * Resolves a runtime platform/arch pair to a supported target id.
 *
 * @param {NodeJS.Platform} [platform=process.platform] - Host platform.
 * @param {string} [arch=process.arch] - Host architecture.
 * @returns {string} Target id for the host.
 * @throws {Error} If the host combination is unsupported.
 */
export function resolveHostTargetId(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (platform === 'win32' && arch === 'x64') return 'windows-x64';

  throw new Error(`Unsupported host platform for default target selection: ${platform}/${arch}`);
}

/**
 * Resolves requested build targets from CLI args.
 *
 * @param {string[]} argv - CLI args.
 * @returns {string[]} Target ids to build.
 * @throws {Error} If provided targets are invalid.
 */
export function resolveRequestedTargets(argv) {
  const all = argv.includes('--all');
  const targetArg = getOptionalFlagValue(argv, '--targets');

  if (all && targetArg) {
    throw new Error('Use either --all or --targets, not both.');
  }

  if (all) {
    return Object.keys(TARGETS);
  }

  if (targetArg) {
    const requested = targetArg
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!requested.length) {
      throw new Error('--targets was provided but no targets were parsed.');
    }

    for (const target of requested) {
      if (!TARGETS[target]) {
        throw new Error(`Unknown target "${target}". Supported: ${Object.keys(TARGETS).join(', ')}`);
      }
    }

    return requested;
  }

  return [resolveHostTargetId()];
}

function computeSha256(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function runBunBuild(targetId, hostTarget) {
  const config = TARGETS[targetId];
  const targetDir = path.join(artifactsRoot, targetId);
  const outPath = path.join(targetDir, config.binaryName);

  mkdirSync(targetDir, { recursive: true });

  const args = ['build', cliEntry, '--compile', '--outfile', outPath];

  // Cross-target builds require --target, host target can use native compile.
  if (targetId !== hostTarget) {
    args.push('--target', config.bunTarget);
  }

  const result = spawnSync('bun', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      BUN_INSTALL_CACHE_DIR: process.env.BUN_INSTALL_CACHE_DIR ?? path.join(repoRoot, '.bun-cache'),
    },
  });

  if (result.status !== 0) {
    throw new Error(`bun build failed for target ${targetId}`);
  }

  if (!existsSync(outPath)) {
    throw new Error(`Expected build output is missing for ${targetId}: ${outPath}`);
  }

  return {
    targetId,
    binaryName: config.binaryName,
    outputPath: outPath,
  };
}

async function writeManifest(entries) {
  const cliPackageRaw = readFileSync(cliPackagePath, 'utf8');
  const cliPackage = JSON.parse(cliPackageRaw);

  const manifest = {
    createdAt: new Date().toISOString(),
    cliVersion: cliPackage.version,
    targets: entries.map((entry) => ({
      target: entry.targetId,
      binaryName: entry.binaryName,
      relativePath: path.relative(artifactsRoot, entry.outputPath),
      sha256: computeSha256(entry.outputPath),
    })),
  };

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, manifestPath)}`);
}

/**
 * Builds native artifacts and writes the build manifest.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - CLI args.
 * @returns {Promise<void>}
 */
export async function main(argv = process.argv.slice(2)) {
  ensureNoUnknownFlags(argv, allowedFlags);
  const targets = resolveRequestedTargets(argv);
  const hostTarget = resolveHostTargetId();

  const entries = [];
  for (const targetId of targets) {
    console.log(`Building native CLI for ${targetId}...`);
    entries.push(runBunBuild(targetId, hostTarget));
  }

  await writeManifest(entries);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
