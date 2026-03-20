#!/usr/bin/env node
/**
 * Migrate super-editor test files from vitest to bun:test.
 *
 * Two-pass approach:
 * 1. Simple regex replacements (imports, vi.fn, vi.spyOn, etc.)
 * 2. Function-call unwrapping for vi.hoisted and vi.stubGlobal using paren matching
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

    if (code.includes("from 'bun:test'")) { skippedBun++; continue; }
    if (SKIP_PATTERNS.some(p => code.includes(p))) { skippedUnsupported++; continue; }
    if (DOM_INDICATORS.some(p => code.includes(p))) { skippedDom++; continue; }

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

/**
 * Find the matching closing paren for an opening paren at `start`.
 * Returns the index of the closing paren, or -1 if not found.
 */
function findMatchingParen(code, start) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let templateDepth = 0;

  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';

    // Handle string escapes
    if (prev === '\\' && (inString || inTemplate)) continue;

    if (inString) {
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '`') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inTemplate) continue;

    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Unwrap vi.hoisted(() => EXPR) → EXPR
 * Handles both arrow expressions and arrow blocks.
 */
function unwrapViHoisted(code) {
  const pattern = /vi\.hoisted\(/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const callStart = match.index;
    const openParen = callStart + 'vi.hoisted'.length;
    const closeParen = findMatchingParen(code, openParen);
    if (closeParen === -1) continue;

    // Extract inner content: the argument to vi.hoisted(...)
    let inner = code.slice(openParen + 1, closeParen).trim();

    // It's always () => EXPR or () => { ... }
    const arrowMatch = inner.match(/^\(\)\s*=>\s*/);
    if (arrowMatch) {
      inner = inner.slice(arrowMatch[0].length).trim();
      // If it's a block: () => { return X; } — extract X
      // If it's an expression: () => X — use X directly
    }

    // Replace vi.hoisted(...) with the unwrapped content
    code = code.slice(0, callStart) + inner + code.slice(closeParen + 1);
    // Reset regex position
    pattern.lastIndex = callStart;
  }
  return code;
}

/**
 * Rewrite vi.stubGlobal('name', EXPR) → globalThis.name = EXPR
 */
function rewriteStubGlobal(code) {
  const pattern = /vi\.stubGlobal\(/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const callStart = match.index;
    const openParen = callStart + 'vi.stubGlobal'.length;
    const closeParen = findMatchingParen(code, openParen);
    if (closeParen === -1) continue;

    const inner = code.slice(openParen + 1, closeParen).trim();
    // Parse: 'name', EXPR
    const nameMatch = inner.match(/^['"](\w+)['"]\s*,\s*/);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    const expr = inner.slice(nameMatch[0].length);

    code = code.slice(0, callStart) + `globalThis.${name} = ${expr}` + code.slice(closeParen + 1);
    pattern.lastIndex = callStart;
  }
  return code;
}

function migrateFile(code, filePath) {
  const isJS = filePath.endsWith('.js') || filePath.endsWith('.jsx');

  // --- Phase 1: Unwrap complex patterns BEFORE other replacements ---
  code = unwrapViHoisted(code);
  code = rewriteStubGlobal(code);

  // --- Phase 2: Simple replacements ---

  // Track what bun:test exports we need
  const needs = {
    describe: /\bdescribe\s*\(/.test(code),
    it: /\bit\s*\(/.test(code),
    expect: /\bexpect\s*\(/.test(code),
    test: /\btest\s*\(/.test(code) && !/\btestTimeout\b/.test(code),
    mock: /vi\.fn\b|vi\.mock\b/.test(code),
    spyOn: /vi\.spyOn\b/.test(code),
    beforeEach: /\bbeforeEach\s*\(/.test(code),
    afterEach: /\bafterEach\s*\(/.test(code),
    beforeAll: /\bbeforeAll\s*\(/.test(code),
    afterAll: /\bafterAll\s*\(/.test(code),
    jest: /vi\.useFakeTimers|vi\.useRealTimers|vi\.runAllTimers\b|vi\.advanceTimersByTime/.test(code),
  };

  // Remove vitest imports
  code = code.replace(/^import\s*\{[^}]*\}\s*from\s*'vitest';\s*\n/gm, '');
  code = code.replace(/^import\s+type\s*\{[^}]*\}\s*from\s*'vitest';\s*\n/gm, '');

  // Module mocking
  code = code.replace(/vi\.mock\(/g, 'mock.module(');
  code = code.replace(/vi\.doMock\(/g, 'mock.module(');
  code = code.replace(/vi\.mock\(import\('([^']+)'\)/g, "mock.module('$1'");
  code = code.replace(/vi\.doUnmock\([^)]*\)\s*;?/g, '');
  code = code.replace(/vi\.unmock\([^)]*\)\s*;?/g, '');
  code = code.replace(/vi\.resetModules\(\)\s*;?/g, '');

  // Function mocks
  code = code.replace(/vi\.fn\(/g, 'mock(');
  code = code.replace(/vi\.spyOn\b/g, 'spyOn');
  if (isJS) {
    code = code.replace(/vi\.mocked\(([^)]+)\)/g, '$1');
  } else {
    code = code.replace(/vi\.mocked\(([^)]+)\)/g, '($1 as any)');
  }

  // Timer APIs
  code = code.replace(/vi\.useFakeTimers\(\)/g, 'jest.useFakeTimers()');
  code = code.replace(/vi\.useRealTimers\(\)/g, 'jest.useRealTimers()');
  code = code.replace(/vi\.runAllTimers\(\)/g, 'jest.runAllTimers()');
  code = code.replace(/vi\.advanceTimersByTime\(/g, 'jest.advanceTimersByTime(');

  // Cleanup APIs (remove — bun handles mock lifecycle)
  code = code.replace(/vi\.clearAllMocks\(\)\s*;?\s*/g, '');
  code = code.replace(/vi\.restoreAllMocks\(\)\s*;?\s*/g, '');
  code = code.replace(/vi\.unstubAllGlobals\(\)\s*;?\s*/g, '');

  // importActual → dynamic import
  code = code.replace(/vi\.importActual\('([^']+)'\)/g, "import('$1')");

  // Type references
  code = code.replace(/typeof vi\.fn\b/g, 'typeof mock');
  code = code.replace(/typeof vi\.spyOn\b/g, 'typeof spyOn');

  // Re-check mock need after replacements
  if (code.includes('mock(') || code.includes('mock.module(')) needs.mock = true;

  // Build import line
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
  if (imports.length === 0) return code;

  const importLine = `import { ${imports.join(', ')} } from 'bun:test';\n`;

  // --- Phase 3: Convert static imports to dynamic for mock.module files ---
  if (code.includes('mock.module(')) {
    const mockPaths = new Set();
    const re = /mock\.module\(['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) mockPaths.add(m[1]);

    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Static named import
      const namedMatch = line.match(/^import\s+(\{[^}]+\})\s+from\s+'([^']+)';$/);
      if (namedMatch && !line.includes('bun:test')) {
        const [, bindings, path] = namedMatch;
        if (!mockPaths.has(path)) {
          const cleanBindings = bindings.replace(/\btype\s+/g, '');
          lines[i] = `const ${cleanBindings} = await import('${path}');`;
        }
      }
      // Static star import
      const starMatch = line.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';$/);
      if (starMatch && !line.includes('bun:test')) {
        const [, name, path] = starMatch;
        if (!mockPaths.has(path)) {
          lines[i] = `const ${name} = await import('${path}');`;
        }
      }
    }
    code = lines.join('\n');
  }

  // Clean up empty callbacks from removed vi.clearAllMocks
  code = code.replace(/beforeEach\(\(\) =>\s*\{\s*\}\)/g, 'beforeEach(() => {})');
  code = code.replace(/afterEach\(\(\) =>\s*\{\s*\}\)/g, 'afterEach(() => {})');

  return importLine + code;
}

main().catch(console.error);
