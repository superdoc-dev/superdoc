#!/usr/bin/env node

/**
 * Layout comparison orchestrator.
 *
 * Wraps `compare-layout-snapshots.mjs` with:
 *  - Auth preflight (wrangler token / S3 env vars)
 *  - Corpus readiness check
 *  - Interactive reference version selection
 *  - Clean progress output
 *
 * Usage:
 *   pnpm test:layout                              # interactive
 *   pnpm test:layout -- --reference 1.16.0        # specific version
 *   pnpm test:layout -- --match tables --limit 5  # filtered
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { intro, outro, select, text, log, cancel, isCancel } from '@clack/prompts';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const COMPARE_SCRIPT = path.join(REPO_ROOT, 'tests/layout/compare-layout-snapshots.mjs');
const REPORTS_ROOT = path.join(REPO_ROOT, 'tests', 'layout', 'reports');
const CORPUS_ROOT = process.env.SUPERDOC_CORPUS_ROOT
  ? path.resolve(process.env.SUPERDOC_CORPUS_ROOT)
  : path.join(REPO_ROOT, 'test-corpus');

const WRANGLER_CONFIG_PATHS =
  process.platform === 'darwin'
    ? [path.join(os.homedir(), 'Library/Preferences/.wrangler/config/default.toml')]
    : [path.join(os.homedir(), '.config/.wrangler/config/default.toml')];

const S3_ENV_KEYS = [
  'SUPERDOC_CORPUS_R2_ACCESS_KEY_ID',
  'SD_TESTING_R2_ACCESS_KEY_ID',
];

const NPM_PACKAGE = 'superdoc';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    reference: '',
    matches: [],
    limit: 0,
    interactive: true,
    help: false,
    passthrough: [],
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--reference' && i + 1 < argv.length) {
      args.reference = argv[++i];
    } else if (arg === '--match' && i + 1 < argv.length) {
      args.matches.push(argv[++i]);
    } else if (arg === '--limit' && i + 1 < argv.length) {
      args.limit = Number(argv[++i]);
    } else if (arg === '--no-interactive') {
      args.interactive = false;
    } else if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else {
      args.passthrough.push(arg);
    }
    i++;
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  pnpm test:layout [options]

Options:
  --reference <version>   Compare against a specific npm version (e.g., 1.16.0)
  --match <pattern>       Filter docs by path substring (repeatable)
  --limit <n>             Compare at most n documents
  --no-interactive        Skip interactive prompts (use defaults)
  -h, --help              Show this help

Examples:
  pnpm test:layout                                    # interactive, compare against npm@next
  pnpm test:layout -- --reference 1.16.0              # compare against stable
  pnpm test:layout -- --match tables --limit 5        # just table docs, first 5
  pnpm test:layout -- --reference 1.16.0 --match list # lists only, against 1.16.0

All unrecognized flags are passed through to compare-layout-snapshots.mjs.
  `.trim());
}

// ---------------------------------------------------------------------------
// Auth check (informational — never blocks execution)
// ---------------------------------------------------------------------------

function hasAuth() {
  // S3 env vars (CI path)
  for (const key of S3_ENV_KEYS) {
    if (process.env[key]) return true;
  }
  // Wrangler TOML (local dev path)
  for (const configPath of WRANGLER_CONFIG_PATHS) {
    if (fs.existsSync(configPath)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Corpus check
// ---------------------------------------------------------------------------

function checkCorpus() {
  if (!fs.existsSync(CORPUS_ROOT)) {
    return { exists: false, count: 0 };
  }
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.name.endsWith('.docx')) count++;
    }
  };
  try {
    walk(CORPUS_ROOT);
  } catch {
    // If walk fails, just report 0
  }
  return { exists: true, count };
}

// ---------------------------------------------------------------------------
// npm dist-tag resolution
// ---------------------------------------------------------------------------

async function fetchDistTags() {
  try {
    const res = await fetch(`https://registry.npmjs.org/-/package/${NPM_PACKAGE}/dist-tags`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Interactive reference selection
// ---------------------------------------------------------------------------

function exitIfCancelled(value) {
  if (isCancel(value)) {
    cancel('Cancelled.');
    process.exit(0);
  }
  return value;
}

async function selectReference() {
  const tags = await fetchDistTags();
  if (!tags) {
    log.warn('Could not fetch npm versions. Using default (npm@next).');
    return '';
  }

  const nextVersion = tags.next || '';
  const latestVersion = tags.latest || '';

  const options = [];
  if (nextVersion) {
    options.push({
      value: nextVersion,
      label: `npm@next (${nextVersion})`,
      hint: 'recommended',
    });
  }
  if (latestVersion) {
    options.push({
      value: latestVersion,
      label: `npm@latest (${latestVersion})`,
    });
  }
  options.push({
    value: '__custom__',
    label: 'Enter a specific version',
  });

  const selected = exitIfCancelled(
    await select({
      message: 'Compare against:',
      options,
    }),
  );

  if (selected === '__custom__') {
    const version = exitIfCancelled(
      await text({
        message: 'npm version:',
        placeholder: '1.16.0',
        validate: (v) => {
          if (!v?.trim()) return 'Version is required';
        },
      }),
    );
    return version.trim();
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  intro('SuperDoc Layout Comparison');

  // 1. Corpus check (informational — compare script handles download)
  const corpus = checkCorpus();
  if (corpus.exists) {
    log.success(`Corpus: ${corpus.count} documents`);
  } else if (hasAuth()) {
    log.info('Corpus not found locally — will be downloaded during comparison');
  } else {
    log.warn('Corpus not found and no auth detected. Download may fail.');
    log.info('  Local: npx wrangler login');
    log.info('  CI:    set SUPERDOC_CORPUS_R2_ACCESS_KEY_ID + SUPERDOC_CORPUS_R2_SECRET_ACCESS_KEY');
  }

  // 2. Resolve reference
  let reference = args.reference;
  if (!reference && args.interactive && process.stdout.isTTY) {
    reference = await selectReference();
  }

  // 3. Build child args
  const childArgs = ['--no-visual-on-change'];
  if (reference) childArgs.push('--reference', reference);
  for (const m of args.matches) childArgs.push('--match', m);
  if (args.limit) childArgs.push('--limit', String(args.limit));
  childArgs.push(...args.passthrough);

  // 4. Run comparison
  const label = reference ? `superdoc@${reference}` : 'npm@next (default)';
  const filters = [];
  if (args.matches.length) filters.push(`matching "${args.matches.join('", "')}"`);
  if (args.limit) filters.push(`limit ${args.limit}`);
  const filterLabel = filters.length ? ` (${filters.join(', ')})` : '';

  log.step(`Comparing against ${label}${filterLabel}...`);
  console.log(''); // blank line before compare output

  const result = spawnSync('bun', [COMPARE_SCRIPT, ...childArgs], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  console.log(''); // blank line after compare output
  const exitCode = result.status ?? 1;

  if (exitCode === 0) {
    outro('No layout changes found.');
  } else {
    // Check if there are unique (non-widespread) changes worth visualizing
    const reportDir = findLatestReportDir();
    const summary = reportDir ? readSummary(reportDir) : null;
    const uniqueCount = summary?.uniqueChangeDocCount ?? 0;

    if (uniqueCount > 0) {
      log.warn(`Layout changes detected in ${uniqueCount} document${uniqueCount === 1 ? '' : 's'}.`);
      log.info('To visually compare changed docs:');
      log.info('  pnpm test:visual');
    }

    outro('Done. See report above for details.');
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
