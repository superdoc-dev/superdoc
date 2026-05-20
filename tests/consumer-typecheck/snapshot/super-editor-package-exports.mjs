/**
 * SD-3176 family: no-growth gate for `@superdoc/super-editor`'s
 * package.json#exports keys.
 *
 * Extracted from the standalone `snapshot-super-editor-package-exports.mjs`
 * script during SD-3213b snapshot-script consolidation. The CLI entry point
 * is now `tests/consumer-typecheck/snapshot.mjs`; this file exposes a `run`
 * function that the CLI invokes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const PKG = resolve(REPO_ROOT, 'packages', 'super-editor', 'package.json');
const SNAPSHOT = resolve(HERE, '..', 'snapshots', 'super-editor-package-exports.txt');

export const FAMILY = 'super-editor-package';
export const DESCRIPTION = '@superdoc/super-editor package.json#exports keys (SD-3176)';

/**
 * @param {{ mode: 'check' | 'write' }} opts
 * @returns {{ code: number }}
 */
export function run({ mode }) {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  if (!pkg.exports || typeof pkg.exports !== 'object') {
    console.error(`[SD-3176] ${PKG} has no exports map.`);
    return { code: 1 };
  }
  const current = Object.keys(pkg.exports).sort().join('\n') + '\n';

  if (mode === 'write') {
    writeFileSync(SNAPSHOT, current, 'utf8');
    console.log(`[SD-3176] Wrote ${SNAPSHOT}`);
    return { code: 0 };
  }

  let baseline;
  try {
    baseline = readFileSync(SNAPSHOT, 'utf8');
  } catch (err) {
    console.error(`[SD-3176] Snapshot not found: ${SNAPSHOT}`);
    console.error('Run with --write to seed the baseline.');
    return { code: 1 };
  }

  if (baseline === current) {
    console.log('[SD-3176] super-editor package exports map: no growth.');
    return { code: 0 };
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
  console.error('  node tests/consumer-typecheck/snapshot.mjs --family super-editor-package --write');
  console.error('and link the PR to SD-3175 or a child ticket for reviewer sign-off.');
  return { code: 1 };
}
