/**
 * Architecture boundary guardrails.
 *
 * These tests enforce the one-way import flow of the layout-engine pipeline:
 *   super-converter → pm-adapter → layout-engine / layout-bridge → painter-dom
 *                         ↑
 *                    style-engine (consumed ONLY by pm-adapter at runtime)
 *
 * Violations mean the pipeline has become circular or rendering logic has
 * leaked into data preparation (or vice versa).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LAYOUT_ENGINE_ROOT = path.resolve(__dirname, '../../');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect runtime .ts source files, excluding tests and type-only files. */
function collectRuntimeSources(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'test-utils' || entry.name === '__test-utils__' || entry.name === 'node_modules') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
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
  describe('Guard A: style-engine is only consumed by pm-adapter', () => {
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

  describe('Guard B: painter-dom internals are not imported by pm-adapter', () => {
    it('pm-adapter runtime src does not import @superdoc/painter-dom', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'pm-adapter/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/painter-dom'));
    });

    it('pm-adapter runtime src does not import relative painter paths', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'pm-adapter/src');
      // Catch any relative import reaching into painters/ directory
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*painters\//));
    });
  });

  describe('Guard C: data flows one direction — pm-adapter does not import downstream', () => {
    it('pm-adapter runtime src does not import @superdoc/layout-bridge', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'pm-adapter/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/layout-bridge'));
    });

    it('pm-adapter runtime src does not import @superdoc/layout-engine', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'pm-adapter/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/layout-engine'));
    });

    it('pm-adapter runtime src does not import relative layout-bridge paths', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'pm-adapter/src');
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*layout-bridge\//));
    });

    it('pm-adapter runtime src does not import relative layout-engine paths', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'pm-adapter/src');
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*layout-engine\//));
    });
  });

  describe('Guard D: painter-dom is a dumb final renderer with no upstream dependencies', () => {
    it('painter-dom runtime src does not import @superdoc/pm-adapter', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      expectNoViolations(findImportViolations(srcDir, '@superdoc/pm-adapter'));
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

    it('painter-dom runtime src does not import relative pm-adapter paths', () => {
      const srcDir = path.join(LAYOUT_ENGINE_ROOT, 'painters/dom/src');
      expectNoViolations(findRelativeImportViolations(srcDir, /from\s+['"].*pm-adapter\//));
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
        const relPath = path.relative(LAYOUT_ENGINE_ROOT, file);
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
});
