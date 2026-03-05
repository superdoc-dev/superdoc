#!/usr/bin/env node

/**
 * Visual (pixel) comparison for documents with layout changes.
 *
 * Reads the latest layout comparison report and runs pixel-level
 * before/after comparison for changed documents using devtools/visual-testing.
 *
 * Usage:
 *   pnpm test:visual                    # compare all changed docs from latest report
 *   pnpm test:visual -- --threshold 0   # exact pixel match
 *
 * Typically run after `pnpm test:layout` detects changes.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPORTS_ROOT = path.join(REPO_ROOT, 'tests', 'layout', 'reports');
const VISUAL_WORKDIR = path.join(REPO_ROOT, 'devtools', 'visual-testing');
const TARBALL_PATH = path.join(REPO_ROOT, 'packages', 'superdoc', 'superdoc.tgz');
const CORPUS_ROOT = process.env.SUPERDOC_CORPUS_ROOT
  ? path.resolve(process.env.SUPERDOC_CORPUS_ROOT)
  : path.join(REPO_ROOT, 'test-corpus');

function findLatestReportDir() {
  if (!fs.existsSync(REPORTS_ROOT)) return null;
  const entries = fs.readdirSync(REPORTS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  return entries.length > 0 ? path.join(REPORTS_ROOT, entries[0]) : null;
}

function readSummary(reportDir) {
  const summaryPath = path.join(reportDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch {
    return null;
  }
}

function ensureBuild() {
  if (fs.existsSync(TARBALL_PATH)) return;

  console.log('[visual] Building superdoc (pnpm pack:es)...');
  const result = spawnSync('pnpm', ['run', 'pack:es'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error('[visual] Build failed. Run pnpm pack:es manually to debug.');
    process.exit(1);
  }
}

function ensureDependencies() {
  const nodeModules = path.join(VISUAL_WORKDIR, 'node_modules');
  if (fs.existsSync(nodeModules)) return;

  console.log('[visual] Installing visual testing dependencies...');
  const result = spawnSync('pnpm', ['install'], {
    cwd: VISUAL_WORKDIR,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error('[visual] Failed to install dependencies.');
    process.exit(1);
  }
}

function main() {
  // Find latest layout report
  const reportDir = findLatestReportDir();
  if (!reportDir) {
    console.error('[visual] No layout report found. Run pnpm test:layout first.');
    process.exit(1);
  }

  const summary = readSummary(reportDir);
  if (!summary) {
    console.error(`[visual] Could not read summary.json from ${reportDir}`);
    process.exit(1);
  }

  // Get changed doc paths (non-widespread only)
  const changedDocPaths = summary.changedDocPaths ?? [];
  if (changedDocPaths.length === 0) {
    console.log('[visual] No changed documents found in latest layout report.');
    console.log('[visual] Run pnpm test:layout to generate a fresh comparison.');
    process.exit(0);
  }

  const reference = summary.referenceLabel;
  if (!reference) {
    console.error('[visual] No reference version found in layout report.');
    console.error('[visual] Re-run pnpm test:layout with a specific --reference version.');
    process.exit(1);
  }

  console.log(`[visual] Reference: superdoc@${reference}`);
  console.log(`[visual] Changed docs: ${changedDocPaths.length}`);
  for (const docPath of changedDocPaths) {
    console.log(`[visual]   ${docPath}`);
  }

  // Ensure visual testing workspace is ready
  if (!fs.existsSync(path.join(VISUAL_WORKDIR, 'package.json'))) {
    console.error(`[visual] Visual testing workspace not found: ${VISUAL_WORKDIR}`);
    process.exit(1);
  }
  ensureBuild();
  ensureDependencies();

  // Build compare:visual args
  const args = ['compare:visual', reference, '--local', '--docs', CORPUS_ROOT];
  for (const docPath of changedDocPaths) {
    args.push('--doc', docPath);
  }

  // Pass through any extra args from CLI
  const extraArgs = process.argv.slice(2);
  args.push(...extraArgs);

  console.log(`[visual] Running pixel comparison...`);
  console.log('');

  const result = spawnSync('pnpm', args, {
    cwd: VISUAL_WORKDIR,
    stdio: 'inherit',
    env: process.env,
  });

  console.log('');
  const exitCode = result.status ?? 1;

  if (exitCode === 0) {
    console.log('[visual] Pixel comparison complete. No visual differences found.');
  } else {
    console.log('[visual] Pixel comparison complete. See HTML report for differences.');
    console.log(`[visual] Report: ${path.join(VISUAL_WORKDIR, 'results')}`);
  }

  process.exit(exitCode);
}

main();
