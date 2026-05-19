#!/usr/bin/env node
// CI gate: forbid sibling .ts + .d.ts files in packages/.
//
// Hand-maintained .d.ts files next to .ts source override TS inference
// silently, drift from the source, and ship phantom APIs that compile but
// fail at runtime. The .ts source is the only source of truth.
//
// Tracking: SD-2922.
//
// AIDEV-NOTE: This gate only targets hand-written source declaration shadows:
// src/foo.d.ts next to src/foo.ts. Do not extend it to dist/ or generated
// declaration output. Public/generated types must come from the package
// build (tsup --dts, vite-plugin-dts, tsc --build emit to dist/). If a
// package intentionally needs source-side .d.ts shadows for its declaration
// build, allowlist that package prefix with a reason.
//
// AIDEV-NOTE: One adjacent danger case is not auto-checked: a package.json
// "types" or "exports.types" pointing at a hand-written src/*.d.ts. We
// manually verified at SD-2922 time that no package does this; either
// types resolve to src/*.ts (source-consumed internal) or to dist/*.d.ts
// (built public). If that pattern appears later, deleting the .d.ts will
// break the package's published types - audit before deletion.
//
// AIDEV-NOTE: The collaboration-yjs allowlist is load-bearing. tsup's --dts
// generator uses the src/.d.ts files as compilation leaves; removing them
// breaks the build until tsup is reconfigured. Treat the entry below as a
// scoped exception, not a precedent. See SD-2922 for the follow-up.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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
  // Normalize separators so the forward-slash ALLOWLIST_PREFIXES match on Windows,
  // where path.relative() returns backslash-separated paths.
  const rel = relative(ROOT, file).split(sep).join('/');
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
print(`Hand-written .d.ts files next to .ts source override TypeScript's`);
print('source inference and silently drift from the implementation.');
print('');
print('Either delete the .d.ts so TypeScript reads the .ts source directly,');
print('or, if this package intentionally needs source-side declaration');
print('shadows for its declaration build, add the package prefix to');
print('ALLOWLIST_PREFIXES in this script with a reason. See SD-2922.');
print('');
for (const v of violations) print(`  ${v}`);
process.exit(1);
