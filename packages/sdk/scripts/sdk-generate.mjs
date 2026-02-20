#!/usr/bin/env node

/**
 * SDK generation pipeline.
 *
 * Normal mode:
 *   1. Run cli:export-sdk-contract (writes sdk-contract.json)
 *   2. Run codegen generate-all.mjs (writes generated client + tool catalog files)
 *
 * Check mode (--check):
 *   1. Run cli:export-sdk-contract --check
 *   2. Re-generate to a temp directory and byte-compare with on-disk artifacts
 *   3. Exit 0 only if all artifacts are current
 */

import { execFile } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const checkMode = process.argv.includes('--check');

async function run(command, args, { cwd = REPO_ROOT } = {}) {
  console.log(`  > ${command} ${args.join(' ')}`);
  const { stdout, stderr } = await execFileAsync(command, args, { cwd, env: process.env });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

/**
 * Recursively collect all files under `dir`, returning paths relative to `dir`.
 */
async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const nested of await collectFiles(full)) {
        files.push(path.join(entry.name, nested));
      }
    } else {
      files.push(entry.name);
    }
  }
  return files.sort();
}

/**
 * Compare generated artifacts against checked-in versions.
 * Returns an array of mismatched relative paths.
 */
async function diffGeneratedArtifacts(tempRoot) {
  const drifted = [];

  // Artifact groups: [tempSubDir, repoSubDir]
  const artifactDirs = [
    [path.join(tempRoot, 'node-generated'), path.join(REPO_ROOT, 'packages/sdk/langs/node/src/generated')],
    [path.join(tempRoot, 'python-generated'), path.join(REPO_ROOT, 'packages/sdk/langs/python/superdoc/generated')],
    [path.join(tempRoot, 'tools'), path.join(REPO_ROOT, 'packages/sdk/tools')],
  ];

  for (const [tempDir, repoDir] of artifactDirs) {
    let tempFiles = [];
    let repoFiles = [];
    try {
      tempFiles = await collectFiles(tempDir);
    } catch {
      // temp dir may not exist for some groups
    }
    try {
      repoFiles = await collectFiles(repoDir);
    } catch {
      // repo dir may not exist
    }

    // Forward check: every generated file must match repo
    for (const relPath of tempFiles) {
      // Skip __init__.py and other non-generated files
      if (relPath === '__init__.py') continue;

      const tempFile = path.join(tempDir, relPath);
      const repoFile = path.join(repoDir, relPath);

      let tempContent, repoContent;
      try {
        [tempContent, repoContent] = await Promise.all([
          readFile(tempFile, 'utf8'),
          readFile(repoFile, 'utf8'),
        ]);
      } catch {
        drifted.push(relPath);
        continue;
      }

      if (tempContent !== repoContent) {
        drifted.push(relPath);
      }
    }

    // Reverse check: repo files absent from generated output are stale
    const tempFileSet = new Set(tempFiles);
    for (const relPath of repoFiles) {
      if (relPath === '__init__.py') continue;
      if (!tempFileSet.has(relPath)) {
        drifted.push(`${relPath} (stale — no longer generated)`);
      }
    }
  }

  return drifted;
}

async function main() {
  if (checkMode) {
    console.log('SDK generate --check: verifying generated artifacts are current...');

    // Step 1: Verify CLI contract is current
    await run('bun', [
      path.join(REPO_ROOT, 'apps/cli/scripts/export-sdk-contract.ts'),
      '--check',
    ]);

    // Step 2: Re-generate to temp dir and byte-compare
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sdk-check-'));
    try {
      // Set env to redirect codegen output to temp dir
      const env = {
        ...process.env,
        SDK_CODEGEN_OUTPUT_ROOT: tempDir,
      };
      await execFileAsync('node', [
        path.join(REPO_ROOT, 'packages/sdk/codegen/src/generate-all.mjs'),
      ], { cwd: REPO_ROOT, env });

      const drifted = await diffGeneratedArtifacts(tempDir);
      if (drifted.length > 0) {
        throw new Error(`Generated artifacts are stale:\n    ${drifted.join('\n    ')}\n\n  Run 'pnpm run generate:all' to update.`);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    console.log('SDK generate --check passed.');
  } else {
    console.log('SDK generate: producing generated artifacts...');

    // Step 1: Export CLI contract
    await run('bun', [
      path.join(REPO_ROOT, 'apps/cli/scripts/export-sdk-contract.ts'),
    ]);

    // Step 2: Run codegen
    await run('node', [
      path.join(REPO_ROOT, 'packages/sdk/codegen/src/generate-all.mjs'),
    ]);

    console.log('SDK generate complete.');
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
