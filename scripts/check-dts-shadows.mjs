#!/usr/bin/env node
// CI gate: forbid sibling .ts + .d.ts files in packages/*/src/.
//
// Hand-maintained .d.ts files next to .ts source override TS inference
// silently, drift from the source, and ship phantom APIs that compile but
// fail at runtime. The .ts source is the only source of truth.
//
// Tracking: SD-2922.
//
// AIDEV-NOTE: The collaboration-yjs allowlist is load-bearing. tsup's --dts
// generator uses the src/.d.ts files as compilation leaves; removing them
// breaks the build until tsup is reconfigured. Treat the entry below as a
// scoped exception, not a precedent. See SD-2922 for the follow-up.

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN = 'packages';

const ALLOWLIST_PREFIXES = ['packages/collaboration-yjs/'];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;
    if (entry.name === 'dist') continue;
    if (entry.name === 'generated') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

const violations = [];
for (const file of walk(join(ROOT, SCAN))) {
  if (!file.endsWith('.d.ts')) continue;
  const ts = file.replace(/\.d\.ts$/, '.ts');
  try {
    statSync(ts);
  } catch {
    continue;
  }
  const rel = relative(ROOT, file);
  if (ALLOWLIST_PREFIXES.some((p) => rel.startsWith(p))) continue;
  violations.push(rel);
}

const print = (s) => process.stdout.write(`${s}\n`);

if (violations.length === 0) {
  print('check-dts-shadows: OK');
  process.exit(0);
}

print(`check-dts-shadows: ${violations.length} violation(s)`);
print('');
print('Hand-written .d.ts files next to .ts source override TS inference');
print('and silently drift from the source. Delete the .d.ts; TypeScript');
print('will infer types from the .ts file directly. See SD-2922.');
print('');
for (const v of violations) print(`  ${v}`);
process.exit(1);
