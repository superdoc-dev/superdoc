#!/usr/bin/env node

/**
 * Full generation DAG — produces all derived artifacts from source-of-truth inputs.
 *
 * Phases (sequential — each depends on the previous):
 *   1. docapi:sync             → packages/document-api/generated/** + apps/docs/document-api/reference/**
 *   2. cli:export-sdk-contract → apps/cli/generated/sdk-contract.json
 *   3. docs:sync-engine        → SDK overview operations table in apps/docs/document-engine/sdks.mdx
 *   4. sdk codegen             → packages/sdk/langs/{node,python}/…/generated/** + packages/sdk/tools/*.json
 *
 * Before generation, gitignored output directories are cleaned to prevent stale file accumulation.
 * apps/docs/document-api/reference/ is NOT cleaned here — it stays committed (Mintlify deploys from git)
 * and docapi:sync handles its contents idempotently.
 */

import { execFile } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

async function run(command, args) {
  console.log(`  > ${command} ${args.join(' ')}`);
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

/**
 * Remove all .json files from a directory while preserving non-json files
 * (e.g. __init__.py in packages/sdk/tools/).
 */
async function cleanJsonFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return; // directory doesn't exist yet
  }
  await Promise.all(
    entries
      .filter((name) => name.endsWith('.json'))
      .map((name) => rm(path.join(dir, name), { force: true })),
  );
}

async function clean() {
  console.log('Cleaning gitignored generated output directories...');
  await Promise.all([
    rm(path.join(REPO_ROOT, 'packages/document-api/generated'), { recursive: true, force: true }),
    rm(path.join(REPO_ROOT, 'apps/cli/generated'), { recursive: true, force: true }),
    rm(path.join(REPO_ROOT, 'packages/sdk/langs/node/src/generated'), { recursive: true, force: true }),
    rm(path.join(REPO_ROOT, 'packages/sdk/langs/python/superdoc/generated'), { recursive: true, force: true }),
    cleanJsonFiles(path.join(REPO_ROOT, 'packages/sdk/tools')),
    // Note: apps/docs/document-api/reference/ is NOT cleaned — it stays committed
    // (Mintlify deploys from git) and docapi:sync handles its contents idempotently.
  ]);
}

async function main() {
  console.log('generate:all — producing all derived artifacts...\n');

  // Clean stale outputs
  await clean();

  // Phase 1-2: Document API contract outputs + reference docs
  console.log('\n--- Phase 1: docapi:sync ---');
  await run('pnpm', ['run', 'docapi:sync']);

  // Phase 3: CLI SDK contract export
  console.log('\n--- Phase 2: cli:export-sdk-contract ---');
  await run('bun', [path.join(REPO_ROOT, 'apps/cli/scripts/export-sdk-contract.ts')]);

  // Phase 4: Docs — SDK overview operations table
  console.log('\n--- Phase 3: docs:sync-engine ---');
  await run('pnpm', ['exec', 'tsx', path.join(REPO_ROOT, 'apps/docs/scripts/generate-sdk-overview.ts')]);

  // Phase 5: SDK codegen (Node + Python clients + tool catalogs)
  console.log('\n--- Phase 4: sdk codegen ---');
  await run('node', [path.join(REPO_ROOT, 'packages/sdk/codegen/src/generate-all.mjs')]);

  console.log('\ngenerate:all complete.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
