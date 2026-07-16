/**
 * Architecture boundary guardrails.
 *
 * These tests enforce the one-way import flow of the layout-engine pipeline:
 *   super-converter → v1 layout-adapter (super-editor) → FlowBlock[]
 *                                                    ↓
 *                      layout-engine / layout-bridge → painter-dom
 *
 * Violations mean the pipeline has become circular or rendering logic has
 * leaked into data preparation (or vice versa).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LAYOUT_ENGINE_ROOT = path.resolve(__dirname, '../../');
// SD-3222: the v1 ProseMirror adapter now lives inside @superdoc/super-editor
// (it is v1 SuperEditor's projection from hidden PM state into FlowBlock[]),
// not in a standalone layout-engine package.
const V1_ADAPTER_ROOT = path.resolve(__dirname, '../../../super-editor/src/editors/v1/core/layout-adapter');
const V1_CORE_ROOT = path.resolve(__dirname, '../../../super-editor/src/editors/v1/core');
// Allowlist paths for guards I/J/K are relative to the super-editor package
// root so they survive moves of this test file.
const SUPER_EDITOR_ROOT = path.resolve(__dirname, '../../../super-editor');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect runtime source files, excluding tests and type-only
 * files. Defaults to .ts only (the layout packages); guards over super-editor
 * trees must pass ['.ts', '.js'] — the converter is mostly .js and a
 * .ts-only scan silently exempts it.
 */
function collectRuntimeSources(dir: string, exts: string[] = ['.ts']): string[] {
  const files: string[] = [];
  function walk(d: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        entry.name === 'test-utils' ||
        entry.name === '__test-utils__' ||
        entry.name === '__tests__' ||
        entry.name === '__mocks__' ||
        entry.name === 'node_modules'
      )
        continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        exts.some((ext) => entry.name.endsWith(ext)) &&
        !/\.(test|spec)\.[jt]sx?$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

/**
 * Ratchet helper: `pattern` may only match inside `allowlist` files, and each
 * allowlisted file is frozen at its current match COUNT — adding a call site
 * to a frozen legacy file fails, not just adding a new file. Fails on
 * (a) any match in a file not on the allowlist,
 * (b) an allowlisted file whose match count grew, and
 * (c) an allowlisted file whose count shrank or hit zero — update/prune the
 *     entry so the ratchet only tightens. Paths are relative to `relativeTo`.
 */
function checkRatchet(opts: {
  dirs: string[];
  exts: string[];
  pattern: RegExp;
  allowlist: Map<string, number>;
  relativeTo: string;
  ruleName: string;
  remedy: string;
}) {
  const actualCounts = new Map<string, number>();
  const violations: { file: string; line: string }[] = [];
  for (const dir of opts.dirs) {
    for (const file of collectRuntimeSources(dir, opts.exts)) {
      const rel = path.relative(opts.relativeTo, file).split(path.sep).join('/');
      const processed = preprocessSource(fs.readFileSync(file, 'utf-8'));
      const lines = processed.split('\n');
      const globalPattern = new RegExp(
        opts.pattern.source,
        opts.pattern.flags.includes('g') ? opts.pattern.flags : opts.pattern.flags + 'g',
      );
      let count = 0;
      let match: RegExpExecArray | null;
      while ((match = globalPattern.exec(processed)) !== null) {
        count += 1;
        if (!opts.allowlist.has(rel)) {
          const lineNo = processed.slice(0, match.index).split('\n').length;
          violations.push({ file: `${rel}:${lineNo}`, line: lines[lineNo - 1].trim() });
        }
        // A zero-width match would never advance lastIndex and hang the scan.
        if (match.index === globalPattern.lastIndex) globalPattern.lastIndex += 1;
      }
      if (count > 0) actualCounts.set(rel, count);
    }
  }
  for (const [rel, allowed] of opts.allowlist) {
    const actual = actualCounts.get(rel) ?? 0;
    if (actual > allowed) {
      violations.push({
        file: rel,
        line: `match count grew ${allowed} -> ${actual}: new call site(s) added to a frozen legacy file`,
      });
    }
  }
  if (violations.length > 0) {
    const details = violations.map((v) => `  ${v.file}\n    ${v.line}`).join('\n');
    expect.fail(`${opts.ruleName}: found ${violations.length} new violation(s).\n${opts.remedy}\n\n${details}`);
  }
  const stale = [...opts.allowlist.entries()].filter(([rel, allowed]) => (actualCounts.get(rel) ?? 0) < allowed);
  if (stale.length > 0) {
    expect.fail(
      `${opts.ruleName}: allowlist counts shrank — tighten the entries (the ratchet only shrinks):\n` +
        stale.map(([rel, allowed]) => `  ${rel}: ${allowed} -> ${actualCounts.get(rel) ?? 0}`).join('\n'),
    );
  }
}

/** Strip single-line and multi-line comments, then collapse multiline imports. */
function preprocessSource(raw: string): string {
  // Strip multi-line comments (non-greedy)
  let src = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip single-line comments
  src = src.replace(/\/\/.*$/gm, '');
  // Collapse multiline import/export statements into single lines:
  // Match `import {  \n  foo \n } from '...'` → single line
  src = src.replace(/((?:import|export)\s+[\s\S]*?from\s+['"][^'"]+['"])/g, (match) => match.replace(/\n/g, ' '));
  return src;
}

/**
 * Check whether any file in `srcDir` contains an import (static, dynamic, or
 * re-export) matching the given package name (including subpath imports).
 * Returns an array of `{ file, line }` violations.
 */
function findImportViolations(srcDir: string, forbiddenPkg: string): { file: string; line: string }[] {
  const files = collectRuntimeSources(srcDir);
  const violations: { file: string; line: string }[] = [];

  // Escape for regex, then add subpath matching: @superdoc/foo or @superdoc/foo/bar
  const escaped = forbiddenPkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`['"]${escaped}(?:[/'"]|$)`);
  // Also catch dynamic import()
  const dynamicPattern = new RegExp(`import\\s*\\(\\s*['"]${escaped}(?:[/'"]|$)`);

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    const processed = preprocessSource(raw);
    const lines = processed.split('\n');
    for (const ln of lines) {
      if (pattern.test(ln) || dynamicPattern.test(ln)) {
        violations.push({ file: path.relative(LAYOUT_ENGINE_ROOT, file), line: ln.trim() });
      }
    }
  }
  return violations;
}

/**
 * Check for relative path imports matching a pattern.
 * Used to catch `../painters/` or similar relative cross-package leaks.
 */
function findRelativeImportViolations(srcDir: string, pathPattern: RegExp): { file: string; line: string }[] {
  const files = collectRuntimeSources(srcDir);
  const violations: { file: string; line: string }[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    const processed = preprocessSource(raw);
    const lines = processed.split('\n');
    for (const ln of lines) {
      if (pathPattern.test(ln)) {
        violations.push({ file: path.relative(LAYOUT_ENGINE_ROOT, file), line: ln.trim() });
      }
    }
  }
  return violations;
}

function expectNoViolations(violations: { file: string; line: string }[]) {
  if (violations.length > 0) {
    const details = violations.map((v) => `  ${v.file}: ${v.line}`).join('\n');
    expect.fail(`Found ${violations.length} forbidden import(s):\n${details}`);
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe('architecture boundaries', () => {
  it('sanity check: architecture guard source roots exist', () => {
    expect(fs.existsSync(LAYOUT_ENGINE_ROOT)).toBe(true);
    expect(fs.existsSync(V1_ADAPTER_ROOT)).toBe(true);
  });

  describe('Guard A: style-engine does not leak into layout runtime packages', () => {
    it('painter-dom runtime src does not import @superdoc/style-engine', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/style-engine'));
    });

    it('painter-dom runtime src does not import relative style-engine paths', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*style-engine\//));
    });

    it('layout-bridge runtime src does not import @superdoc/style-engine', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'layout-bridge/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/style-engine'));
    });

    it('layout-bridge runtime src does not import relative style-engine paths', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'layout-bridge/src');
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*style-engine\//));
    });

    it('layout-engine runtime src does not import @superdoc/style-engine', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'layout-engine/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/style-engine'));
    });

    it('layout-engine runtime src does not import relative style-engine paths', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'layout-engine/src');
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*style-engine\//));
    });
  });

  describe('Guard B: painter-dom internals are not imported by the v1 adapter', () => {
    it('v1 adapter runtime src does not import @superdoc/painter-dom', () => {
      expectNoViolations(findImportViolations(V1_ADAPTER_ROOT, '@superdoc/painter-dom'));
    });

    it('v1 adapter runtime src does not import relative painter paths', () => {
      // Catch any relative import reaching into painters/ directory
      expectNoViolations(findRelativeImportViolations(V1_ADAPTER_ROOT, /from\s+['"].*painters\//));
    });
  });

  describe('Guard C: data flows one direction — the v1 adapter does not import downstream', () => {
    it('v1 adapter runtime src does not import @superdoc/layout-bridge', () => {
      expectNoViolations(findImportViolations(V1_ADAPTER_ROOT, '@superdoc/layout-bridge'));
    });

    it('v1 adapter runtime src does not import @superdoc/layout-engine', () => {
      expectNoViolations(findImportViolations(V1_ADAPTER_ROOT, '@superdoc/layout-engine'));
    });

    it('v1 adapter runtime src does not import relative layout-bridge paths', () => {
      expectNoViolations(findRelativeImportViolations(V1_ADAPTER_ROOT, /from\s+['"].*layout-bridge\//));
    });

    it('v1 adapter runtime src does not import relative layout-engine paths', () => {
      expectNoViolations(findRelativeImportViolations(V1_ADAPTER_ROOT, /from\s+['"].*layout-engine\//));
    });
  });

  describe('Guard D: painter-dom is a dumb final renderer with no upstream dependencies', () => {
    it('painter-dom runtime src does not import @superdoc/super-editor', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/super-editor'));
    });

    it('painter-dom runtime src does not import @superdoc/layout-bridge', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/layout-bridge'));
    });

    it('painter-dom runtime src does not import @superdoc/layout-resolved (test-only utility)', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      // _test-utils.ts is test-only and excluded from runtime collection. The
      // architecture-boundary check passes when no runtime file imports
      // layout-resolved.
      const files = collectRuntimeSources(srcDir).filter((f) => !f.endsWith('_test-utils.ts'));
      const violations: { file: string; line: string }[] = [];
      const pattern = new RegExp(`['"]@superdoc/layout-resolved(?:[/'"]|$)`);
      for (const file of files) {
        const raw = fs.readFileSync(file, 'utf-8');
        const processed = preprocessSource(raw);
        const lines = processed.split('\n');
        for (const ln of lines) {
          if (pattern.test(ln)) {
            violations.push({ file: path.relative(LAYOUT_ENGINE_ROOT, file), line: ln.trim() });
          }
        }
      }
      expectNoViolations(violations);
    });

    it('painter-dom runtime src does not import the relative v1 layout-adapter path', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*super-editor\/.*layout-adapter/));
    });

    it('painter-dom runtime src does not import relative layout-bridge paths', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*layout-bridge\//));
    });
  });

  describe('Guard E: painter-dom render path does not measure DOM at paint time (SD-2957)', () => {
    // Files entirely exempt because they implement interactive UI overlays
    // (drag handles, scroll plumbing) where DOM measurement IS the job, not a
    // rendering-stage leak. New entries here require explicit reviewer sign-off.
    const ALLOWED_INTERACTION_FILES = new Set([
      'painters/dom/src/ruler/ruler-renderer.ts', // ruler margin-handle drag/pointer mapping
    ]);
    // Within render-path files, only these receivers may read DOM measurements
    // — they are scroll-container references used to detect scrollability and
    // map pointer coordinates. Adding a receiver name silently is exactly the
    // regression this guard prevents.
    const ALLOWED_MEASUREMENT_RECEIVERS = new Set(['this.mount', 'mount', 'scrollCont']);
    const FORBIDDEN_PATTERN = /([\w.]+)\.(clientHeight|clientWidth|offsetHeight|offsetWidth|getBoundingClientRect)\b/g;

    it('production source under painters/dom/src does not read DOM measurements off rendered content', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      const files = collectRuntimeSources(srcDir).filter((f) => !f.endsWith('_test-utils.ts'));
      const violations: { file: string; line: string; receiver: string; api: string }[] = [];

      for (const file of files) {
        const relPath = path.relative(LAYOUT_ENGINE_ROOT, file).split(path.sep).join('/');
        if (ALLOWED_INTERACTION_FILES.has(relPath)) continue;
        const raw = fs.readFileSync(file, 'utf-8');
        const processed = preprocessSource(raw);
        const lines = processed.split('\n');
        lines.forEach((ln, idx) => {
          let match: RegExpExecArray | null;
          FORBIDDEN_PATTERN.lastIndex = 0;
          while ((match = FORBIDDEN_PATTERN.exec(ln)) !== null) {
            const receiver = match[1];
            const api = match[2];
            if (ALLOWED_MEASUREMENT_RECEIVERS.has(receiver)) continue;
            violations.push({
              file: `${relPath}:${idx + 1}`,
              line: ln.trim(),
              receiver,
              api,
            });
          }
        });
      }

      if (violations.length > 0) {
        const details = violations.map((v) => `  ${v.file} → ${v.receiver}.${v.api}\n    ${v.line}`).join('\n');
        expect.fail(
          `Found ${violations.length} paint-time DOM measurement(s) on rendered content. The painter must consume\n` +
            `pre-resolved sizes/offsets from ResolvedLayout, not measure the DOM at paint time. If a use is\n` +
            `legitimate scroll/viewport plumbing or interactive UI, exempt it via ALLOWED_INTERACTION_FILES\n` +
            `or ALLOWED_MEASUREMENT_RECEIVERS with a comment explaining why.\n\n${details}`,
        );
      }
    });
  });

  describe('Guard G: prep-001 layout boundary does not depend on editor runtime packages', () => {
    // Editor-neutral substrate added by `prep-001-layout-boundary-and-identity.md`.
    // It must not silently pick up a dependency on editor runtime packages.
    const FORBIDDEN_RUNTIME_PACKAGES = ['@superdoc/editor-core', '@superdoc/headless'];
    const PREP_001_RUNTIME_DIRS = [
      'contracts/src',
      'dom-contract/src',
      'layout-bridge/src',
      'layout-resolved/src',
      'painters/dom/src',
    ];

    for (const dir of PREP_001_RUNTIME_DIRS) {
      for (const pkg of FORBIDDEN_RUNTIME_PACKAGES) {
        it(`${dir} does not import ${pkg}`, () => {
          const srcDir = path.join(LAYOUT_ENGINE_ROOT, dir);
          expectNoViolations(findImportViolations(srcDir, pkg));
        });
      }
    }
  });

  describe('Guard F: painter-dom render path does not coalesce resolved fields with the legacy fragment back-pointer (SD-2957)', () => {
    // Lines exempt because the LHS reads from a different stage entirely (e.g.
    // ImageBlock.width is the OOXML natural width, fragment.width is the
    // resolved layout width — semantically different fallback, not a dead
    // resolved-stage coalescing). Add a substring here only when the LHS is
    // demonstrably NOT a resolved-item field.
    const ALLOWED_FRAGMENT_FALLBACKS = ['block.width ?? fragment.width', 'block.height ?? fragment.height'];
    const FORBIDDEN_PATTERN = /\?\?\s*\(?fragment(?:\s+as\s+\w+)?\)?\.[a-zA-Z_$][\w$]*/g;

    it('production source under painters/dom/src does not fall back to fragment.X after a resolved read', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      const files = collectRuntimeSources(srcDir).filter((f) => !f.endsWith('_test-utils.ts'));
      const violations: { file: string; line: string }[] = [];

      for (const file of files) {
        const relPath = path.relative(LAYOUT_ENGINE_ROOT, file);
        const raw = fs.readFileSync(file, 'utf-8');
        const processed = preprocessSource(raw);
        const lines = processed.split('\n');
        lines.forEach((ln, idx) => {
          FORBIDDEN_PATTERN.lastIndex = 0;
          if (!FORBIDDEN_PATTERN.test(ln)) return;
          if (ALLOWED_FRAGMENT_FALLBACKS.some((allowed) => ln.includes(allowed))) return;
          violations.push({ file: `${relPath}:${idx + 1}`, line: ln.trim() });
        });
      }

      if (violations.length > 0) {
        const details = violations.map((v) => `  ${v.file}\n    ${v.line}`).join('\n');
        expect.fail(
          `Found ${violations.length} dead 'resolvedX ?? fragment.Y' coalescing(s). The resolve stage is the\n` +
            `unique source of truth for every field the painter reads — the producer copies fragment fields\n` +
            `onto resolved items when present, so the fragment fallback is dead. Replace 'resolvedX ?? fragment.Y'\n` +
            `with just 'resolvedX', or with 'resolvedX ?? <numeric default>' when the value is consumed as a\n` +
            `number. If the LHS reads from a different stage (e.g. ImageBlock.width vs fragment.width), add the\n` +
            `line substring to ALLOWED_FRAGMENT_FALLBACKS with a comment explaining why.\n\n${details}`,
        );
      }
    });
  });

  describe('Guard H: layout runtime packages do not import concrete adapters (SD-3222)', () => {
    const LAYOUT_RUNTIME_DIRS = [
      'layout-engine/src',
      'layout-bridge/src',
      'painters/dom/src',
      'contracts/src',
      'dom-contract/src',
      'layout-resolved/src',
    ];

    for (const dir of LAYOUT_RUNTIME_DIRS) {
      // The v1 ProseMirror adapter is owned by @superdoc/super-editor. Layout
      // runtime packages consume FlowBlock[] and layout contracts only — they
      // must never reach back into the concrete editor adapter, whether via the
      // package specifier, source alias, or a relative path into super-editor's
      // adapter source.
      it(`${dir} does not import @superdoc/super-editor`, () => {
        const srcDir = path.join(LAYOUT_ENGINE_ROOT, dir);
        expectNoViolations(findImportViolations(srcDir, '@superdoc/super-editor'));
      });

      it(`${dir} does not import @core/layout-adapter`, () => {
        const srcDir = path.join(LAYOUT_ENGINE_ROOT, dir);
        expectNoViolations(findImportViolations(srcDir, '@core/layout-adapter'));
      });

      it(`${dir} does not import the relative v1 super-editor layout-adapter path`, () => {
        const srcDir = path.join(LAYOUT_ENGINE_ROOT, dir);
        expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*super-editor\/.*layout-adapter/));
      });
    }
  });

  describe('Guard I: upstream layers do not pre-mirror bidiVisual sides (SD-3134)', () => {
    // Upstream stores logical sides LTR-default; DomPainter mirrors exactly
    // once at paint time. A `cond ? 'right' : 'left'` on an RTL flag upstream
    // is the double-swap this guard exists for — SD-3134's violation was
    // literally `isRtlTable ? 'right' : 'left'`, which the direction README's
    // narrower `rightToLeft` quick-check would not have matched.
    // Allowlisted files convert logical↔physical as their declared job; new
    // entries require explicit reviewer sign-off.
    // Counts freeze each file's existing conversions; adding one more
    // `rtl ? 'left'/'right'` to a sanctioned file fails too.
    const ALLOWED_DIRECTION_FILES = new Map([
      // Sanctioned resolver: the single place logical sides become physical
      // (direction/README.md names resolver files as expected raw readers).
      ['src/editors/v1/core/layout-adapter/direction/logicalSides.ts', 6],
      // Logical indent/justification conversion helpers; frozen as-is pending
      // a direction-owner review (SD-3580) — do not add siblings.
      ['src/editors/v1/core/layout-adapter/attributes/spacing-indent.ts', 4],
    ]);

    it('layout-adapter and super-converter do not resolve RTL flags to physical left/right', () => {
      checkRatchet({
        dirs: [V1_ADAPTER_ROOT, path.join(V1_CORE_ROOT, 'super-converter')],
        exts: ['.ts', '.js'],
        pattern: /(isRtl\w*|rightToLeft|\brtl)\s*\?\s*['"](left|right)['"]/,
        allowlist: ALLOWED_DIRECTION_FILES,
        relativeTo: SUPER_EDITOR_ROOT,
        ruleName: 'Guard I (bidi pre-mirroring)',
        remedy:
          'Store logical sides LTR-default upstream; DomPainter mirrors once at paint time.\n' +
          'Pre-mirroring here double-swaps under w:bidiVisual. See layout-adapter/direction/README.md.',
      });
    });
  });

  describe('Guard J: PresentationEditor does not resolve OOXML semantics', () => {
    // PresentationEditor bridges editor events into layout/paint state. Raw
    // OOXML vocabulary (`'w:...'` literals) in its production source means it
    // is resolving document semantics that belong in the converter,
    // style-engine, or the v1 adapter. The two allowlisted files are known
    // violations from the SD-2656 footnote work, frozen until extracted
    // (SD-3578) — the allowlist only shrinks.
    // Counts freeze the existing violations; adding another w: literal to
    // either file fails.
    const ALLOWED_OOXML_FILES = new Map([
      ['src/editors/v1/core/presentation-editor/PresentationEditor.ts', 2],
      ['src/editors/v1/core/presentation-editor/layout/separatorContentClassifier.ts', 8],
    ]);

    it('presentation-editor production source contains no w: OOXML literals outside the frozen allowlist', () => {
      checkRatchet({
        dirs: [path.join(V1_CORE_ROOT, 'presentation-editor')],
        exts: ['.ts', '.js'],
        pattern: /['"]w:[a-zA-Z]/,
        allowlist: ALLOWED_OOXML_FILES,
        relativeTo: SUPER_EDITOR_ROOT,
        ruleName: 'Guard J (PresentationEditor OOXML)',
        remedy:
          'Resolve OOXML semantics upstream (converter/style-engine/adapter) and pass typed data into\n' +
          'PresentationEditor. Do not add files to the allowlist; extract instead.',
      });
    });
  });

  describe('Guard K: the converter does not resolve style cascades', () => {
    // The converter parses and stores only what is explicitly in the XML;
    // layout-engine/style-engine owns cascade resolution. Style-engine call
    // sites under super-converter/ are frozen legacy — the allowlist only
    // shrinks. textbox-content-helpers.js is a post-rule violation (#3700),
    // frozen here pending an extract-vs-sanction decision (SD-3579), not
    // sanctioned.
    // The identifier list is DERIVED from style-engine's export surface at
    // test time (every exported resolve*/combine*/determine* helper), so a
    // new cascade helper is covered automatically — converter files import
    // these through the `styles.js` shim (`@converter/styles.js`), and
    // matching only the package specifier would miss every laundered
    // consumer. Known limit: a converter-local wrapper around a frozen
    // file's helper (e.g. resolveParagraphPropertiesForTextBox) is chased
    // only via its defining file's frozen count, not import-graph analysis.
    const STYLE_ENGINE_SRC = ['style-engine/src/index.ts', 'style-engine/src/ooxml/index.ts'];
    const cascadeIdentifiers = new Set<string>();
    for (const relFile of STYLE_ENGINE_SRC) {
      const src = fs.readFileSync(path.join(LAYOUT_ENGINE_ROOT, relFile), 'utf-8');
      for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) cascadeIdentifiers.add(m[1]);
      for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const raw of m[1].split(',')) {
          const name =
            raw
              .trim()
              .split(/\s+as\s+/)
              .pop()
              ?.trim() ?? '';
          if (/^[A-Za-z_$]/.test(name) && !name.startsWith('type ')) cascadeIdentifiers.add(name);
        }
      }
    }
    const cascadeNames = [...cascadeIdentifiers].filter((n) => /^(resolve|combine|determine)/.test(n)).sort();
    // Counts freeze each file's existing call sites; adding one more to a
    // frozen legacy file fails.
    const ALLOWED_LEGACY_CASCADE_FILES = new Map([
      ['src/editors/v1/core/super-converter/styles.js', 10], // the re-export shim itself
      ['src/editors/v1/core/super-converter/v3/handlers/w/p/helpers/legacy-handle-paragraph-node.js', 2],
      ['src/editors/v1/core/super-converter/v3/handlers/w/r/r-translator.js', 2],
      ['src/editors/v1/core/super-converter/v3/handlers/w/t/helpers/translate-text-node.js', 2],
      // Post-rule violation (#3700), frozen pending SD-3579; calls the real
      // cascade and wraps it as resolveParagraphPropertiesForTextBox.
      ['src/editors/v1/core/super-converter/v3/handlers/wp/helpers/textbox-content-helpers.js', 7],
    ]);

    // An empty name list would make `\b(?:)\b` match zero-width everywhere;
    // fail loudly at construction instead of degrading or hanging.
    function buildCascadePattern(): RegExp {
      if (cascadeNames.length === 0) {
        throw new Error('Guard K: derived cascade-identifier list is empty — style-engine export parsing broke');
      }
      return new RegExp(`@superdoc/style-engine|\\b(?:${cascadeNames.join('|')})\\b`);
    }

    it('sanity check: the derived cascade-identifier list is non-trivial', () => {
      // If style-engine's export shape changes such that derivation breaks,
      // fail loudly instead of silently matching nothing.
      expect(cascadeNames.length).toBeGreaterThanOrEqual(8);
      expect(cascadeNames).toContain('resolveRunProperties');
      expect(cascadeNames).toContain('combineRunProperties');
    });

    it('super-converter production source adds no new style-engine cascade call sites', () => {
      checkRatchet({
        dirs: [path.join(V1_CORE_ROOT, 'super-converter')],
        exts: ['.ts', '.js', '.mjs'],
        pattern: buildCascadePattern(),
        allowlist: ALLOWED_LEGACY_CASCADE_FILES,
        relativeTo: SUPER_EDITOR_ROOT,
        ruleName: 'Guard K (converter cascade resolution)',
        remedy:
          'The converter stores explicit XML only; resolving cascades at import bakes inline properties\n' +
          'into nodes and export loses style references. Resolve in style-engine at render time instead.',
      });
    });
  });
});
