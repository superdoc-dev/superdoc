#!/usr/bin/env node
/**
 * SD-3176: no-growth gate for `@superdoc/super-editor` package-level exports map.
 *
 * Snapshots the keys of `packages/super-editor/package.json#exports`. New
 * subpath entries (e.g. a fresh `./foo`) fail CI. Removing entries also fails
 * the diff so the change gets explicit reviewer attention.
 *
 * Companion to `snapshot-superdoc-legacy-exports.mjs`, which catches growth
 * of resolved named exports through `superdoc/super-editor` and the three
 * other legacy subpaths.
 *
 * Usage:
 *   node snapshot-super-editor-package-exports.mjs --check
 *   node snapshot-super-editor-package-exports.mjs --write
 *
 * `--write` regenerates the snapshot. Only run it when the change is
 * intentional and tied to SD-3175 (path-as-contract facade umbrella).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const PKG = resolve(REPO_ROOT, 'packages', 'super-editor', 'package.json');
const SNAPSHOT = resolve(HERE, 'snapshots', 'super-editor-package-exports.txt');

const args = process.argv.slice(2);
const mode = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : null;
if (!mode) {
  console.error('Usage: snapshot-super-editor-package-exports.mjs --write | --check');
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
if (!pkg.exports || typeof pkg.exports !== 'object') {
  console.error(`[SD-3176] ${PKG} has no exports map.`);
  process.exit(1);
}

const current = Object.keys(pkg.exports).sort().join('\n') + '\n';

if (mode === 'write') {
  writeFileSync(SNAPSHOT, current, 'utf8');
  console.log(`[SD-3176] Wrote ${SNAPSHOT}`);
  process.exit(0);
}

let baseline;
try {
  baseline = readFileSync(SNAPSHOT, 'utf8');
} catch (err) {
  console.error(`[SD-3176] Snapshot not found: ${SNAPSHOT}`);
  console.error('Run with --write to seed the baseline.');
  process.exit(1);
}

if (baseline === current) {
  console.log('[SD-3176] super-editor package exports map: no growth.');
  process.exit(0);
}

const baseSet = new Set(baseline.split('\n').filter(Boolean));
const curSet = new Set(current.split('\n').filter(Boolean));
const added = [...curSet].filter((k) => !baseSet.has(k));
const removed = [...baseSet].filter((k) => !curSet.has(k));

console.error('[SD-3176] @superdoc/super-editor package.json#exports drifted:');
if (added.length) console.error('  added:   ' + added.join(', '));
if (removed.length) console.error('  removed: ' + removed.join(', '));
console.error('');
console.error('Per SD-3175 (path-as-contract facade), @superdoc/super-editor is legacy compatibility surface');
console.error('and must not grow. If this change is intentional (e.g. an approved compat shim), regenerate:');
console.error('  node tests/consumer-typecheck/snapshot-super-editor-package-exports.mjs --write');
console.error('and link the PR to SD-3175 or a child ticket for reviewer sign-off.');
process.exit(1);
