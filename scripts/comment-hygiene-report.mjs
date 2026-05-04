#!/usr/bin/env node
// Report-only comment hygiene check. Prints findings; always exits 0.
//
// Tracking: SD-2922 (.d.ts shadows), SD-2923 (comment hygiene).
// AIDEV-NOTE: This script is intentionally non-blocking. Flipping it to
// failing CI is gated on the loaded-term taxonomy in comment-policy.md
// being adopted across the codebase. Do not change the exit code without
// updating SD-2923.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

// AIDEV-NOTE: Required for the "always exits 0" contract. Without this,
// `node scripts/comment-hygiene-report.mjs | head` triggers EPIPE on
// stdout, which Node turns into a non-zero exit and a stack trace.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

const ROOT = process.cwd();
const SCAN_ROOTS = ['packages', 'shared'];
const SKIP_DIR_NAMES = new Set([
  'node_modules', 'dist', 'build', 'coverage', 'generated', '__mocks__',
  '.next', '.turbo', '.cache',
]);
const SKIP_FILE_PATTERNS = [/\.test\./, /\.spec\./, /\.snap$/];
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue']);
const SAMPLE = 10;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      yield* walk(join(dir, entry.name));
    } else if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

function isSourceFile(p) {
  if (SKIP_FILE_PATTERNS.some((rx) => rx.test(p))) return false;
  return SOURCE_EXTS.has(extname(p));
}

// Cheap export extraction. Misses some edge cases (default exports of
// expressions, namespace re-exports), but matches the same heuristic on
// both sides of the diff so divergence is symmetric.
function extractExports(src) {
  const names = new Set();
  const re1 =
    /^[ \t]*export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  let m;
  while ((m = re1.exec(src)) !== null) names.add(m[1]);
  const re2 = /^[ \t]*export\s*\{([^}]+)\}/gm;
  while ((m = re2.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const asMatch = cleaned.match(/\bas\s+([A-Za-z_][A-Za-z0-9_]*)/);
      const name = asMatch ? asMatch[1] : cleaned.split(/\s+/)[0];
      if (name) names.add(name);
    }
  }
  return names;
}

function diffSiblings(files) {
  const divergences = [];
  for (const ts of files) {
    if (!ts.endsWith('.ts') || ts.endsWith('.d.ts')) continue;
    if (!ts.includes(`${'/'}src${'/'}`)) continue;
    const dts = ts.replace(/\.ts$/, '.d.ts');
    let dtsContent;
    try {
      dtsContent = readFileSync(dts, 'utf8');
    } catch {
      continue;
    }
    const tsContent = readFileSync(ts, 'utf8');
    const tsExports = extractExports(tsContent);
    const dtsExports = extractExports(dtsContent);
    const phantom = [...dtsExports].filter((n) => !tsExports.has(n)).sort();
    const missing = [...tsExports].filter((n) => !dtsExports.has(n)).sort();
    if (phantom.length || missing.length) {
      divergences.push({ ts: relative(ROOT, ts), phantom, missing });
    }
  }
  return divergences;
}

function scanOrphanMarkers(file, src) {
  const hits = [];
  src.split(/\r?\n/).forEach((line, idx) => {
    if (!/(?:\/\/|\/\*|\*|<!--|#)\s*.*\b(TODO|FIXME|HACK|XXX)\b/.test(line)) return;
    if (/[A-Z]+-\d+/.test(line)) return;
    hits.push({ file, line: idx + 1, text: line.trim().slice(0, 200) });
  });
  return hits;
}

function scanUndatedDeprecated(file, src) {
  const hits = [];
  const lines = src.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!/@deprecated/.test(line)) return;
    const windowText = lines.slice(idx, idx + 4).join(' ');
    const hasReplace = /\breplaceWith\b/.test(windowText);
    const hasRemovalDecision = /(removeIn|compat-indefinitely)/.test(windowText);
    if (hasReplace && hasRemovalDecision) return;
    hits.push({ file, line: idx + 1, text: line.trim().slice(0, 200) });
  });
  return hits;
}

const CANDIDATE_KEYWORDS =
  /\b(must|never|MUST|NEVER|security|SECURITY|source of truth|invariant|do not|never call|critical|CRITICAL)\b/;

function scanAidevCandidates(file, src) {
  const hits = [];
  src.split(/\r?\n/).forEach((line, idx) => {
    if (!/^\s*(?:\/\/|\*|\/\*|<!--|#)/.test(line)) return;
    if (/AIDEV-NOTE/.test(line)) return;
    if (!CANDIDATE_KEYWORDS.test(line)) return;
    hits.push({ file, line: idx + 1, text: line.trim().slice(0, 200) });
  });
  return hits;
}

const allFiles = [];
for (const root of SCAN_ROOTS) {
  for (const f of walk(join(ROOT, root))) {
    if (isSourceFile(f) || f.endsWith('.d.ts')) allFiles.push(f);
  }
}

const orphanHits = [];
const deprecatedHits = [];
const aidevHits = [];

for (const f of allFiles) {
  let content;
  try {
    content = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  orphanHits.push(...scanOrphanMarkers(relative(ROOT, f), content));
  deprecatedHits.push(...scanUndatedDeprecated(relative(ROOT, f), content));
  aidevHits.push(...scanAidevCandidates(relative(ROOT, f), content));
}

const divergences = diffSiblings(allFiles);

const today = new Date().toISOString().slice(0, 10);

const print = (s = '') => process.stdout.write(`${s}\n`);

print(`# Comment hygiene report - ${today}`);
print(`Tracking: SD-2922 (.d.ts shadows), SD-2923 (comment hygiene).`);
print(`Policy: comment-policy.md`);
print('');
print(`Report-only. Always exits 0.`);
print('');

print(`## .ts/.d.ts sibling divergences  (${divergences.length} files)`);
if (divergences.length === 0) {
  print(`  none`);
} else {
  print(`  Tracking: SD-2922.`);
  for (const d of divergences.slice(0, SAMPLE)) {
    print(`  ${d.ts}`);
    if (d.phantom.length) print(`    phantom (.d.ts only): ${d.phantom.join(', ')}`);
    if (d.missing.length) print(`    missing (.ts only):   ${d.missing.join(', ')}`);
  }
  if (divergences.length > SAMPLE) {
    print(`  ... and ${divergences.length - SAMPLE} more.`);
  }
}
print('');

print(`## Orphan TODO / FIXME / HACK / XXX  (${orphanHits.length} hits)`);
print(`  Markers without an XX-NNNN issue id on the same line.`);
if (orphanHits.length === 0) {
  print(`  none`);
} else {
  for (const h of orphanHits.slice(0, SAMPLE)) {
    print(`  ${h.file}:${h.line}  ${h.text}`);
  }
  if (orphanHits.length > SAMPLE) print(`  ... and ${orphanHits.length - SAMPLE} more.`);
}
print('');

print(`## @deprecated without replaceWith / removeIn / compat-indefinitely  (${deprecatedHits.length} hits)`);
print(`  Window: same line + 3 following lines.`);
if (deprecatedHits.length === 0) {
  print(`  none`);
} else {
  for (const h of deprecatedHits.slice(0, SAMPLE)) {
    print(`  ${h.file}:${h.line}  ${h.text}`);
  }
  if (deprecatedHits.length > SAMPLE) print(`  ... and ${deprecatedHits.length - SAMPLE} more.`);
}
print('');

print(`## AIDEV-NOTE candidates  (${aidevHits.length} hits)`);
print(`  Comment lines mentioning must/never/security/source-of-truth/invariant/critical`);
print(`  without an AIDEV-NOTE anchor. Likely already-good invariants worth tagging.`);
if (aidevHits.length === 0) {
  print(`  none`);
} else {
  for (const h of aidevHits.slice(0, SAMPLE)) {
    print(`  ${h.file}:${h.line}  ${h.text}`);
  }
  if (aidevHits.length > SAMPLE) print(`  ... and ${aidevHits.length - SAMPLE} more.`);
}
print('');

print(`## Summary`);
print(`  .ts/.d.ts divergences: ${divergences.length}`);
print(`  orphan TODO/FIXME:     ${orphanHits.length}`);
print(`  undated @deprecated:   ${deprecatedHits.length}`);
print(`  AIDEV-NOTE candidates: ${aidevHits.length}`);
