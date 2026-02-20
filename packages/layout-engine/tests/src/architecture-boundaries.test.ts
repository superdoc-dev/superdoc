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
});
