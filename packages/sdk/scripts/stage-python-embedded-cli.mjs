#!/usr/bin/env node

import { access, chmod, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON_EMBEDDED_CLI_TARGETS } from './python-embedded-cli-targets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

const CLI_PLATFORMS_ROOT = path.join(REPO_ROOT, 'apps/cli/platforms');
const PYTHON_VENDOR_ROOT = path.join(REPO_ROOT, 'packages/sdk/langs/python/superdoc/_vendor');
const PYTHON_VENDOR_CLI_ROOT = path.join(PYTHON_VENDOR_ROOT, 'cli');

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureInitFile(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  if (!(await fileExists(filePath))) {
    await writeFile(filePath, '', 'utf8');
  }
}

export async function stageTargetBinary(target, { cliPlatformsRoot = CLI_PLATFORMS_ROOT, pythonVendorCliRoot = PYTHON_VENDOR_CLI_ROOT } = {}) {
  const sourcePath = path.join(cliPlatformsRoot, target.sourcePackage, 'bin', target.binaryName);
  if (!(await fileExists(sourcePath))) {
    throw new Error(
      `Missing CLI binary for ${target.id}: ${sourcePath}\n` +
      'Build and stage CLI artifacts first: pnpm --prefix apps/cli run build:native:all && pnpm --prefix apps/cli run build:stage',
    );
  }

  const targetDir = path.join(pythonVendorCliRoot, target.id);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  const destinationPath = path.join(targetDir, target.binaryName);
  await copyFile(sourcePath, destinationPath);

  if (!target.binaryName.endsWith('.exe')) {
    try {
      await chmod(destinationPath, 0o755);
    } catch {
      // Non-fatal; runtime will surface execution errors if permissions are invalid.
    }
  }

  console.log(`Staged ${target.id}: ${path.relative(REPO_ROOT, destinationPath)}`);
}

export async function stagePythonEmbeddedCli({
  targets = PYTHON_EMBEDDED_CLI_TARGETS,
  cliPlatformsRoot = CLI_PLATFORMS_ROOT,
  pythonVendorRoot = PYTHON_VENDOR_ROOT,
  pythonVendorCliRoot = PYTHON_VENDOR_CLI_ROOT,
} = {}) {
  await ensureInitFile(path.join(pythonVendorRoot, '__init__.py'));
  await ensureInitFile(path.join(pythonVendorCliRoot, '__init__.py'));

  for (const target of targets) {
    await stageTargetBinary(target, { cliPlatformsRoot, pythonVendorCliRoot });
  }

  console.log(`Staged ${targets.length} platform binaries for Python SDK.`);
}

async function main() {
  await stagePythonEmbeddedCli();
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
