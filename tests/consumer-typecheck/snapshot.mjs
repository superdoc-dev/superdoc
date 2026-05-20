#!/usr/bin/env node
/**
 * SD-3213b unified snapshot CLI.
 *
 * One entry point that routes to family modules under ./snapshot/. Each
 * family module exports `FAMILY`, `DESCRIPTION`, and `run({ mode })`
 * returning `{ code: number }`.
 *
 * Usage:
 *   node tests/consumer-typecheck/snapshot.mjs --all --check
 *   node tests/consumer-typecheck/snapshot.mjs --all --write
 *   node tests/consumer-typecheck/snapshot.mjs --family root --check
 *   node tests/consumer-typecheck/snapshot.mjs --family legacy --check
 *   node tests/consumer-typecheck/snapshot.mjs --family super-editor-package --check
 *
 * --check (default) compares against committed snapshots and exits non-zero
 * on drift. --write regenerates snapshots in place.
 *
 * CI workflows call `snapshot.mjs --all --check`. The packed-tarball fixture
 * must be installed first (the legacy and root families need it); the
 * typecheck-matrix step in CI handles that.
 */
import * as superEditorPackage from './snapshot/super-editor-package-exports.mjs';
import * as legacy from './snapshot/legacy-exports.mjs';
import * as root from './snapshot/root-exports.mjs';

const FAMILIES = [superEditorPackage, legacy, root];
const FAMILY_BY_NAME = new Map(FAMILIES.map((m) => [m.FAMILY, m]));

function printUsage() {
  console.error('Usage:');
  console.error('  node tests/consumer-typecheck/snapshot.mjs --all --check');
  console.error('  node tests/consumer-typecheck/snapshot.mjs --all --write');
  console.error('  node tests/consumer-typecheck/snapshot.mjs --family <name> --check');
  console.error('  node tests/consumer-typecheck/snapshot.mjs --family <name> --write');
  console.error('');
  console.error('Families:');
  for (const m of FAMILIES) {
    console.error(`  ${m.FAMILY.padEnd(24)} ${m.DESCRIPTION}`);
  }
}

function parseArgs(argv) {
  const args = { all: false, family: null, mode: 'check' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--family') args.family = argv[++i];
    else if (a === '--check') args.mode = 'check';
    else if (a === '--write') args.mode = 'write';
    else if (a === '-h' || a === '--help') args.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      args.invalid = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.invalid) {
    printUsage();
    process.exit(args.invalid ? 2 : 0);
  }

  if (args.all && args.family) {
    console.error('--all and --family are mutually exclusive.');
    printUsage();
    process.exit(2);
  }

  if (!args.all && !args.family) {
    console.error('Specify either --all or --family <name>.');
    printUsage();
    process.exit(2);
  }

  const targets = args.all
    ? FAMILIES
    : [FAMILY_BY_NAME.get(args.family)].filter(Boolean);

  if (args.family && targets.length === 0) {
    console.error(`Unknown family: ${args.family}`);
    printUsage();
    process.exit(2);
  }

  let exitCode = 0;
  for (const mod of targets) {
    console.log(`\n=== [${mod.FAMILY}] ${mod.DESCRIPTION} ===`);
    const { code } = mod.run({ mode: args.mode });
    if (code !== 0) exitCode = code;
  }
  process.exit(exitCode);
}

main();
