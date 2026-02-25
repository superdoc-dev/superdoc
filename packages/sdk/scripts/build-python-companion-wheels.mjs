#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PYTHON_CLI_PLATFORM_TARGETS } from './python-embedded-cli-targets.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const PYTHON_PLATFORMS_ROOT = path.join(REPO_ROOT, 'packages/sdk/langs/python/platforms');
const COMPANION_DIST_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/python/companion-dist');

async function buildCompanionWheel(target) {
  const packageDir = path.join(PYTHON_PLATFORMS_ROOT, target.companionPypiName);
  const outDir = path.join(packageDir, 'dist');

  // Clean previous build artifacts
  await rm(outDir, { recursive: true, force: true });
  await rm(path.join(packageDir, 'build'), { recursive: true, force: true });

  console.log(`  Building ${target.companionPypiName}...`);
  const { stdout, stderr } = await execFileAsync('python3', ['-m', 'build', '--outdir', outDir], {
    cwd: packageDir,
    env: process.env,
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());

  return outDir;
}

async function collectWheels(outDirs) {
  await rm(COMPANION_DIST_DIR, { recursive: true, force: true });
  await mkdir(COMPANION_DIST_DIR, { recursive: true });

  let count = 0;
  for (const outDir of outDirs) {
    const entries = await readdir(outDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.whl')) {
        await cp(path.join(outDir, entry.name), path.join(COMPANION_DIST_DIR, entry.name));
        count++;
      }
    }
  }

  console.log(`Collected ${count} companion wheels into ${path.relative(REPO_ROOT, COMPANION_DIST_DIR)}/`);
}

export async function buildAllCompanionWheels(targets = PYTHON_CLI_PLATFORM_TARGETS) {
  const outDirs = [];

  for (const target of targets) {
    const outDir = await buildCompanionWheel(target);
    outDirs.push(outDir);
  }

  await collectWheels(outDirs);
}

async function main() {
  await buildAllCompanionWheels();
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
