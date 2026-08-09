#!/usr/bin/env node
/**
 * v2-only source guard.
 *
 * Fails when active `superdoc/public` consumer surfaces (apps, docs, examples,
 * demos, the published `superdoc` package source, and build/workspace config)
 * reference the v1 `super-editor` editor as a live public surface.
 *
 * Why this exists
 * ---------------
 * The public repository has one document editor lifecycle: v2. The
 * `superdoc@2` package consumes the separate `@superdoc/docx-engine` runtime; no public
 * consumer should depend on, instantiate, or document the v1
 * `super-editor` editor (`@superdoc/super-editor`, `Editor.open`, `SuperEditor`,
 * `PresentationEditor`, the `superdoc/super-editor` subpath, the removed legacy
 * `superdoc/*` subpaths, or `editors/v1`).
 *
 * Scope decision
 * --------------
 * The guard scans the surfaces a customer or downstream consumer sees, plus
 * the build/workspace config that decides whether v1 stays wired. It does not
 * scan unrelated historical architecture notes or tests unless those tests are
 * the explicit public contract absence checks.
 *
 * Allowlist policy
 * ----------------
 * The allowlist is intentionally minimal: the guard's own files, negative
 * contract tests that PROVE v1 imports fail to resolve, and explicit migration
 * notes. It must never allowlist active docs, examples, demos, package source,
 * CLI, or MCP.
 *
 * Run directly:
 *   node scripts/check-v2-only-source.mjs
 *   pnpm run check:v2-only-source
 */

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Forbidden v1 markers. Each entry has a stable id (for messages/allowlist
 * reasoning) and a matcher. Matchers are deliberately specific so the guard
 * does not flag unrelated identifiers.
 */
const FORBIDDEN = [
  { id: 'pkg-super-editor', re: /@superdoc\/super-editor/, label: '@superdoc/super-editor package import/dependency' },
  { id: 'subpath-super-editor', re: /\bsuperdoc\/super-editor\b/, label: 'superdoc/super-editor subpath' },
  { id: 'editor-open', re: /\bEditor\.open\b/, label: 'Editor.open() v1 lifecycle call' },
  { id: 'SuperEditor', re: /\bSuperEditor\b/, label: 'SuperEditor v1 surface' },
  { id: 'PresentationEditor', re: /\bPresentationEditor\b/, label: 'PresentationEditor v1 surface' },
  { id: 'packages-super-editor', re: /packages\/super-editor/, label: 'packages/super-editor path reference' },
  { id: 'editors-v1', re: /\beditors\/v1\b/, label: 'editors/v1 path reference' },
  // Removed legacy public superdoc/* subpaths (import specifiers only).
  // NOTE: `superdoc/ui` and `superdoc/ui/react` are intentionally NOT listed —
  // they are restored as v2-native public custom-UI entries
  // (packages/superdoc/src/public/ui.ts / ui-react.ts), not the removed v1
  // editor UI subpaths.
  {
    id: 'legacy-subpath',
    re: /['"`]superdoc\/(super-editor|types|converter|docx-zipper|file-zipper|headless-toolbar(\/(react|vue))?)['"`]/,
    label: 'removed legacy superdoc/* subpath import',
  },
];

/**
 * Directories (relative to repo root) whose ACTIVE source the guard scans.
 * The published package source is scanned; the internal v1 engine and the
 * layout-engine rendering pipeline are not (see "Scope decision" above).
 */
const SCAN_DIRS = [
  'apps/cli/src',
  'apps/mcp/src',
  'apps/docs/content',
  'examples',
  'demos',
  'packages/superdoc/src',
];

/**
 * Individual config/workspace files the guard scans. These decide whether v1
 * stays wired into builds, tests, lint, and resolution.
 */
const SCAN_FILES = [
  'apps/cli/package.json',
  'apps/mcp/package.json',
  'packages/superdoc/package.json',
  'vite.sourceResolve.ts',
  'tsconfig.references.json',
];

const SCANNED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.cts', '.mts',
  '.js', '.jsx', '.cjs', '.mjs',
  '.vue', '.mdx', '.md', '.json', '.css',
]);

/**
 * Path segments that are never scanned regardless of where they appear.
 */
const ALWAYS_IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '__snapshots__',
  '__tests__',
  'fixtures',
  'fixtures-cli',
]);

/**
 * Minimal allowlist. Keyed by repo-relative path. Each entry documents WHY the
 * file is permitted to mention a v1 marker. Limited to: the guard itself,
 * negative contract tests, and explicit migration notes.
 */
const ALLOWLIST = new Map([
  ['scripts/check-v2-only-source.mjs', 'the guard itself defines the forbidden markers'],
]);

/**
 * Allowlisted path PREFIXES (directories) for negative-test fixtures that must
 * reference removed v1 subpaths to prove they fail to resolve, and for the
 * migration guide, whose whole subject is which v1 APIs are gone and what
 * replaced them. A migration guide that could not name a removed API would
 * have nothing to say.
 */
const ALLOWLIST_PREFIXES = [
  'tests/consumer-typecheck/negative/',
  'apps/docs/content/docs/editor/migrate-from-v1/',
];

const findings = [];

function shouldScanFile(absPath) {
  const relPath = relative(REPO_ROOT, absPath).split(sep).join('/');
  const basename = relPath.slice(relPath.lastIndexOf('/') + 1);
  if (basename === 'AGENTS.md') return false;
  if (basename.endsWith('.test.ts') || basename.endsWith('.test.js') || basename.endsWith('.test.mjs')) return false;
  if (basename.endsWith('.spec.ts') || basename.endsWith('.spec.js') || basename.endsWith('.spec.mjs')) return false;

  const ext = absPath.slice(absPath.lastIndexOf('.'));
  return SCANNED_EXTENSIONS.has(ext);
}

function isAllowlisted(relPath) {
  if (ALLOWLIST.has(relPath)) return true;
  return ALLOWLIST_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function scanFileContent(absPath) {
  const relPath = relative(REPO_ROOT, absPath).split(sep).join('/');
  if (isAllowlisted(relPath)) return;

  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  lines.forEach((line, index) => {
    for (const marker of FORBIDDEN) {
      if (marker.re.test(line)) {
        findings.push({
          file: relPath,
          line: index + 1,
          marker: marker.id,
          label: marker.label,
          text: line.trim().slice(0, 160),
        });
      }
    }
  });
}

function walk(absDir) {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (ALWAYS_IGNORED_DIRS.has(entry.name)) continue;
      walk(abs);
    } else if (entry.isFile() && shouldScanFile(abs)) {
      scanFileContent(abs);
    }
  }
}

for (const dir of SCAN_DIRS) {
  const abs = resolve(REPO_ROOT, dir);
  try {
    if (statSync(abs).isDirectory()) walk(abs);
  } catch {
    /* directory may not exist after relocation; that is fine */
  }
}

for (const file of SCAN_FILES) {
  const abs = resolve(REPO_ROOT, file);
  try {
    if (statSync(abs).isFile()) scanFileContent(abs);
  } catch {
    /* file may have been removed by the cleanup; that is fine */
  }
}

if (findings.length === 0) {
  console.log('[check:v2-only-source] OK — no v1 super-editor references in active public surfaces.');
  process.exit(0);
}

console.error('[check:v2-only-source] FAIL — active public surfaces still reference v1 super-editor:');
console.error('');
const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}
for (const [file, fileFindings] of [...byFile.entries()].sort()) {
  console.error(`  ${file}`);
  for (const f of fileFindings) {
    console.error(`    :${f.line}  [${f.marker}] ${f.text}`);
  }
}
console.error('');
console.error(`Total: ${findings.length} reference(s) across ${byFile.size} file(s).`);
console.error('Port the consumer to v2 (or fail closed) and remove the v1 reference.');
console.error('Allowlist (minimal) lives in scripts/check-v2-only-source.mjs; do not add active source.');
process.exit(1);
