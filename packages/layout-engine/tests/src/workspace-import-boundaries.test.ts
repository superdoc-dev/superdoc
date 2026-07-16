/**
 * Workspace import boundary guardrails (R1/R2).
 *
 * Two escape modes recur in this repo's history (SD-609, SD-2836, SD-3222,
 * v2 restructures — roughly one cleanup event per quarter before these
 * guards):
 *   R1: relative imports that climb out of the importing package's root into
 *       a sibling package (`../../super-editor/src/...`).
 *   R2: package-specifier imports of another workspace package's internals
 *       (`@superdoc/foo/src/...`, `superdoc/dist/...`).
 *
 * Scope: runtime source of the product slice (packages/, apps/, shared/).
 * Tests, scripts, dist, examples, demos, and fixtures are out of scope —
 * generated re-exports in scripts (e.g. superdoc's ensure-types.cjs) are
 * intentionally not scanned.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// packages/layout-engine/tests/src → superdoc/public
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../../');
const PRODUCT_SLICE = ['packages', 'apps', 'shared'];

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue'];
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'test',
  'tests',
  '__tests__',
  '__mocks__',
  'test-utils',
  '__test-utils__',
  'e2e-tests',
  'fixtures',
  'scripts',
  'demo',
  'demos',
  'examples',
  '.tmp',
]);

// R1 exceptions. Each entry is `<file relative to workspace root>|<specifier>`
// so a new escape in an allowlisted file still fails. This list only shrinks.
const R1_ALLOWLIST = new Set([
  // Intentional per the adjacent comment: consume the editor stylesheet from
  // source so monorepo dev gets CSS live reload; the named ./style.css export
  // resolves to dist. Remove once a dev-only alias maps the package specifier
  // to source (SD-3580).
  'packages/superdoc/src/SuperDoc.vue|../../super-editor/src/style.css',
  // Dev-only panel; toolbarIcons has no named export today and adding an
  // unnamed wildcard subpath import would fight the exports-narrowing
  // ratchet. Remove once super-editor names a toolbar-icons export (SD-3580).
  'packages/superdoc/src/dev/components/SuperdocDev.vue|../../../../super-editor/src/editors/v1/components/toolbar/toolbarIcons',
]);

function collectSources(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        SOURCE_EXTS.some((ext) => entry.name.endsWith(ext)) &&
        !/\.(test|spec|stories|bench)\.(m|c)?[jt]sx?$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.config.js') &&
        !entry.name.endsWith('.config.ts') &&
        !entry.name.endsWith('.config.mjs')
      ) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

function stripComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Every import/export/require specifier in the file, static or dynamic. */
function extractSpecifiers(src: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /import\s*['"]([^'"]+)['"]/g, // side-effect imports (CSS etc.)
    /import\s*\(\s*['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(src)) !== null) specifiers.push(match[1]);
  }
  return specifiers;
}

/** Nearest ancestor directory (within the workspace) containing package.json. */
function packageRootOf(file: string): string | null {
  let dir = path.dirname(file);
  while (dir.length >= WORKSPACE_ROOT.length) {
    if (dir !== WORKSPACE_ROOT && fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (dir === WORKSPACE_ROOT) break;
    dir = path.dirname(dir);
  }
  return null;
}

interface Violation {
  file: string;
  specifier: string;
}

function formatViolations(violations: Violation[]): string {
  return violations.map((v) => `  ${v.file}\n    → ${v.specifier}`).join('\n');
}

describe('workspace import boundaries', () => {
  const allFiles = PRODUCT_SLICE.flatMap((slice) => collectSources(path.join(WORKSPACE_ROOT, slice)));

  it('sanity check: the product slice yields a plausible source set', () => {
    // Guards that scan zero files pass vacuously; fail loudly if the layout
    // of the repo changes underneath this test.
    expect(allFiles.length).toBeGreaterThan(1000);
    expect(allFiles.some((f) => f.endsWith('.vue'))).toBe(true);
    expect(allFiles.some((f) => f.endsWith('.js'))).toBe(true);
  });

  it('R2: no package imports another workspace package via /src or /dist internals', () => {
    // `superdoc` (unscoped) is also a workspace package; match it and both
    // @superdoc/@superdoc-dev scopes.
    const deepImport = /^(?:@superdoc(?:-dev)?\/[^/]+|superdoc)\/(?:src|dist)(?:\/|$)/;
    const violations: Violation[] = [];
    for (const file of allFiles) {
      const src = stripComments(fs.readFileSync(file, 'utf-8'));
      for (const spec of extractSpecifiers(src)) {
        if (deepImport.test(spec)) {
          violations.push({ file: path.relative(WORKSPACE_ROOT, file), specifier: spec });
        }
      }
    }
    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} deep workspace import(s). Import through the package's declared\n` +
          `exports instead; if the symbol is not exported, add a named export entry.\n\n` +
          formatViolations(violations),
      );
    }
  });

  it('R1: no relative import escapes its own package root', () => {
    const violations: Violation[] = [];
    for (const file of allFiles) {
      const pkgRoot = packageRootOf(file);
      if (!pkgRoot) continue;
      const src = stripComments(fs.readFileSync(file, 'utf-8'));
      for (const spec of extractSpecifiers(src)) {
        if (!spec.startsWith('.')) continue;
        const resolved = path.resolve(path.dirname(file), spec);
        if (resolved === pkgRoot || resolved.startsWith(pkgRoot + path.sep)) continue;
        const rel = path.relative(WORKSPACE_ROOT, file).split(path.sep).join('/');
        if (R1_ALLOWLIST.has(`${rel}|${spec}`)) continue;
        violations.push({ file: rel, specifier: spec });
      }
    }
    if (violations.length > 0) {
      expect.fail(
        `Found ${violations.length} relative import(s) escaping their package root. Import the sibling\n` +
          `package through its workspace specifier and declared exports instead.\n\n` +
          formatViolations(violations),
      );
    }
  });

  it('R1 allowlist entries still exist (the list only shrinks)', () => {
    const stale: string[] = [];
    for (const entry of R1_ALLOWLIST) {
      const [rel, spec] = entry.split('|');
      const abs = path.join(WORKSPACE_ROOT, rel);
      if (!fs.existsSync(abs)) {
        stale.push(entry);
        continue;
      }
      const src = stripComments(fs.readFileSync(abs, 'utf-8'));
      if (!extractSpecifiers(src).includes(spec)) stale.push(entry);
    }
    if (stale.length > 0) {
      expect.fail(`R1 allowlist entries no longer match and must be pruned:\n${stale.map((s) => `  ${s}`).join('\n')}`);
    }
  });
});
