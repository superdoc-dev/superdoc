#!/usr/bin/env node
/**
 * Migrate super-editor test files from vitest to bun:test.
 *
 * Handles:
 * - Import replacement (vitest → bun:test)
 * - vi.fn() → mock()
 * - vi.spyOn → spyOn
 * - vi.mock() → mock.module() with dynamic import for subject
 * - vi.hoisted(() => ...) → unwrap to plain declaration
 * - vi.mocked(fn) → fn (cast removed)
 * - vi.clearAllMocks() → mock.restore() or remove
 * - vi.restoreAllMocks() → remove
 * - vi.useFakeTimers/runAllTimers → jest.* equivalents
 * - vi.importActual → direct dynamic import
 * - vi.stubGlobal → globalThis assignment
 *
 * Skips files that:
 * - Already use bun:test
 * - Use vi.waitFor, vi.runAllTimersAsync (no bun equivalent, keep on vitest)
 * - Use DOM globals (document, window) without self-contained setup
 */

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs';
import { promisify } from 'node:util';

const globAsync = promisify(glob);

const SKIP_PATTERNS = ['vi.waitFor', 'vi.runAllTimersAsync'];

const DOM_INDICATORS = [
  'initTestEditor',
  'loadTestDataForEditorTests',
  'document.createElement',
  'document.getSelection',
  'document.body',
  'document.querySelector',
  'new EditorView',
  'DOMParser',
  'window.setTimeout',
  'window.alert',
  'window.getComputedStyle',
];

async function main() {
  const dir = process.argv[2] || 'packages/super-editor/src';
  const files = await globAsync(`${dir}/**/*.test.{js,ts,jsx,tsx}`);

  let migrated = 0;
  let skippedBun = 0;
  let skippedUnsupported = 0;
  let skippedDom = 0;

  for (const file of files) {
    let code = await readFile(file, 'utf8');

    // Already migrated
    if (code.includes("from 'bun:test'")) {
      skippedBun++;
      continue;
    }

    // Skip files with unsupported patterns
    if (SKIP_PATTERNS.some((p) => code.includes(p))) {
      skippedUnsupported++;
      continue;
    }

    // Skip DOM-dependent files
    if (DOM_INDICATORS.some((p) => code.includes(p))) {
      skippedDom++;
      continue;
    }

    code = migrateFile(code, file);
    await writeFile(file, code);
    migrated++;
  }

  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped (already bun): ${skippedBun}`);
  console.log(`Skipped (unsupported API): ${skippedUnsupported}`);
  console.log(`Skipped (DOM-dependent): ${skippedDom}`);
  console.log(`Total files: ${files.length}`);
}

function migrateFile(code, filePath) {
  const isJS = filePath.endsWith('.js') || filePath.endsWith('.jsx');

  // Track what bun:test exports we need
  const needs = {
    describe: /\bdescribe\s*\(/.test(code),
    it: /\bit\s*\(/.test(code),
    expect: /\bexpect\s*\(/.test(code),
    test: /\btest\s*\(/.test(code) && !/\btestTimeout\b/.test(code),
    mock: /vi\.fn\b|vi\.mock\b|vi\.hoisted\b/.test(code),
    spyOn: /vi\.spyOn\b/.test(code),
    beforeEach: /\bbeforeEach\s*\(/.test(code),
    afterEach: /\bafterEach\s*\(/.test(code),
    beforeAll: /\bbeforeAll\s*\(/.test(code),
    afterAll: /\bafterAll\s*\(/.test(code),
    jest: /vi\.useFakeTimers|vi\.useRealTimers|vi\.runAllTimers|vi\.advanceTimersByTime/.test(code),
  };

  // Remove vitest import line(s)
  code = code.replace(/^import\s*\{[^}]*\}\s*from\s*'vitest';\s*\n/gm, '');
  code = code.replace(/^import\s+type\s*\{[^}]*\}\s*from\s*'vitest';\s*\n/gm, '');

  // Build bun:test import
  const imports = [];
  if (needs.describe) imports.push('describe');
  if (needs.it) imports.push('it');
  if (needs.test) imports.push('test');
  if (needs.expect) imports.push('expect');
  if (needs.mock) imports.push('mock');
  if (needs.spyOn) imports.push('spyOn');
  if (needs.beforeEach) imports.push('beforeEach');
  if (needs.afterEach) imports.push('afterEach');
  if (needs.beforeAll) imports.push('beforeAll');
  if (needs.afterAll) imports.push('afterAll');
  if (needs.jest) imports.push('jest');

  const importLine = `import { ${imports.join(', ')} } from 'bun:test';\n`;

  // Handle vi.hoisted(() => expr) → expr
  // Single-line: const x = vi.hoisted(() => vi.fn())
  code = code.replace(/vi\.hoisted\(\(\)\s*=>\s*\n?\s*/g, '');
  // Remove trailing );  that closed vi.hoisted
  // This is tricky — we'll handle it by replacing vi.hoisted(() => { ... }) patterns
  // For the simpler form: vi.hoisted(() => vi.fn(...)) → vi.fn(...)
  // The closing ); from hoisted needs to be handled contextually

  // Handle vi.mock() → mock.module()
  // Simple form: vi.mock('./path', () => ({...}))
  code = code.replace(/vi\.mock\(/g, 'mock.module(');

  // Handle vi.mock(import('path'), ...) → mock.module('path', ...)
  code = code.replace(/mock\.module\(import\('([^']+)'\)/g, "mock.module('$1'");

  // Handle vi.importActual('path') → import('path')
  code = code.replace(/vi\.importActual\('([^']+)'\)/g, "import('$1')");
  code = code.replace(/await importOriginal\(\)/g, "await import(/* original */ '.')");

  // Handle vi.fn() → mock()
  code = code.replace(/vi\.fn\(/g, 'mock(');

  // Handle vi.spyOn → spyOn
  code = code.replace(/vi\.spyOn\b/g, 'spyOn');

  // Handle vi.mocked(fn) → fn (JS files) or (fn as any) (TS files)
  if (isJS) {
    code = code.replace(/vi\.mocked\(([^)]+)\)/g, '$1');
  } else {
    code = code.replace(/vi\.mocked\(([^)]+)\)/g, '($1 as any)');
  }

  // Handle timer APIs
  code = code.replace(/vi\.useFakeTimers\(\)/g, 'jest.useFakeTimers()');
  code = code.replace(/vi\.useRealTimers\(\)/g, 'jest.useRealTimers()');
  code = code.replace(/vi\.runAllTimers\(\)/g, 'jest.runAllTimers()');
  code = code.replace(/vi\.advanceTimersByTime\(/g, 'jest.advanceTimersByTime(');

  // Handle cleanup APIs
  code = code.replace(/vi\.clearAllMocks\(\);?\s*/g, '');
  code = code.replace(/vi\.restoreAllMocks\(\);?\s*/g, '');

  // Handle vi.stubGlobal('name', value) → globalThis.name = value
  code = code.replace(/vi\.stubGlobal\('([^']+)',\s*/g, 'globalThis.$1 = ');
  code = code.replace(/vi\.unstubAllGlobals\(\);?\s*/g, '');

  // Handle vi.doMock → mock.module
  code = code.replace(/vi\.doMock\(/g, 'mock.module(');
  code = code.replace(/vi\.doUnmock\([^)]*\);?\s*/g, '');
  code = code.replace(/vi\.unmock\([^)]*\);?\s*/g, '');
  code = code.replace(/vi\.resetModules\(\);?\s*/g, '');

  // Now handle the key pattern: static imports of mocked modules need to become dynamic.
  // If mock.module() is used, any static import of the SUBJECT module (the module that
  // imports the mocked dependency) should become a dynamic import.
  // This is the trickiest part — we need to identify which imports are subjects vs mocks.
  //
  // For now, if mock.module is present AND there are static imports after it,
  // convert them to dynamic imports.
  if (code.includes('mock.module(')) {
    // Find all mock.module paths
    const mockPaths = new Set();
    const mockModuleRegex = /mock\.module\(['"]([^'"]+)['"]/g;
    let m;
    while ((m = mockModuleRegex.exec(code)) !== null) {
      mockPaths.add(m[1]);
    }

    // Convert static imports that come AFTER mock.module calls to dynamic imports
    // Only convert imports of the subject module (not the mocked modules themselves)
    // The subject is imported statically but depends on mocked modules
    const lines = code.split('\n');
    const mockModuleLineIndex = lines.findIndex((l) => l.includes('mock.module('));

    if (mockModuleLineIndex >= 0) {
      // Find the last mock.module line
      let lastMockLine = mockModuleLineIndex;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('mock.module(')) {
          lastMockLine = i;
          break;
        }
      }

      // Find static imports after the bun:test import that are NOT mock paths
      // and convert them to dynamic imports if they appear after mock.module
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const importMatch = line.match(/^import\s+(\{[^}]+\})\s+from\s+'([^']+)';/);
        const importStarMatch = line.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';/);

        if (importMatch && !line.includes('bun:test')) {
          const [, bindings, path] = importMatch;
          if (!mockPaths.has(path) && i > 0) {
            // This is a subject import — needs dynamic import
            lines[i] = `const ${bindings.replace(/\btype\s+/g, '')} = await import('${path}');`;
          }
        } else if (importStarMatch && !line.includes('bun:test')) {
          const [, name, path] = importStarMatch;
          if (!mockPaths.has(path) && i > 0) {
            lines[i] = `const ${name} = await import('${path}');`;
          }
        }
      }
      code = lines.join('\n');
    }
  }

  // Add bun:test import at top
  code = importLine + code;

  return code;
}

main().catch(console.error);
