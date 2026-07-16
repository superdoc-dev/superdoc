// Import-boundary guard for the editor-runtime contract.
//
// The shared runtime contract is the one surface shell code uses to talk to a
// mounted editor. Current implementation hard gate: it must NOT depend on ProseMirror, the
// concrete v1 editor package, `PresentationEditor`/`EditorInputManager`/
// `PositionHit`, or `SDPosition`/`SDRange`/Document API internals.
//
// This guard scans every non-test source under `core/editor-runtime/` for both
// forbidden import specifiers AND forbidden path-string references to concrete
// editor implementation files. Conformance fixtures are scanned too: they must
// prove the contract is satisfiable without importing forbidden modules.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = __dirname;

// Forbidden module specifiers appearing in `import... from '<spec>'` or
// `import('<spec>')`. Matched as substrings of the quoted specifier.
const FORBIDDEN_IMPORT_FRAGMENTS = [
  'prosemirror-state',
  'prosemirror-view',
  'prosemirror-model',
  'prosemirror-transform',
  '@superdoc/super-editor',
  '@superdoc/document-api',
  '@superdoc/layout-engine',
  '@superdoc/painter-dom',
  'layout-adapter',
  'presentation-editor',
  'PresentationEditor',
  'EditorInputManager',
  'edit-command-adapters',
];

// Forbidden path-string / identifier references anywhere in source (not just
// imports). These catch a back-door like a string path to a concrete impl file
// or a type reference smuggled past the import scan.
const FORBIDDEN_REFERENCE_FRAGMENTS = [
  'presentation-editor/PresentationEditor',
  'SDPosition',
  'SDRange',
  'PositionHit',
];

function* walkSourceFiles(dir: string): IterableIterator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkSourceFiles(full);
      continue;
    }
    if (!full.endsWith('.ts')) continue;
    if (full.endsWith('.test.ts') || full.endsWith('.spec.ts')) continue; // tests assert against forbidden names
    yield full;
  }
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  // `import... from '<spec>'` / `export... from '<spec>'`
  const fromRe = /\b(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
  // bare side-effect imports + dynamic import('<spec>')
  const bareRe = /\bimport\s*\(?\s*['"]([^'"]+)['"]/g;
  for (const re of [fromRe, bareRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) specs.push(m[1]);
  }
  return specs;
}

describe('editor-runtime contract  -  import boundary', () => {
  it('has no forbidden import specifiers in any runtime source', () => {
    const offenders: { file: string; spec: string; fragment: string }[] = [];
    for (const file of walkSourceFiles(HERE)) {
      const source = readFileSync(file, 'utf8');
      for (const spec of importSpecifiers(source)) {
        for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
          if (spec.includes(fragment)) {
            offenders.push({ file: relative(HERE, file), spec, fragment });
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no forbidden path-string / identifier references in any runtime source', () => {
    const offenders: { file: string; fragment: string; line: string }[] = [];
    for (const file of walkSourceFiles(HERE)) {
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      lines.forEach((line) => {
        // Skip comment lines so prose mentioning forbidden names is allowed.
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        for (const fragment of FORBIDDEN_REFERENCE_FRAGMENTS) {
          if (line.includes(fragment)) {
            offenders.push({ file: relative(HERE, file), fragment, line: trimmed });
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  // --- matcher self-tests: prove the guard actually rejects bad input ---

  it('self-test: import scanner detects a forbidden specifier', () => {
    const synthetic = `import { Foo } from 'prosemirror-state';\nimport x from './ok.js';`;
    const hits = importSpecifiers(synthetic).filter((spec) => FORBIDDEN_IMPORT_FRAGMENTS.some((f) => spec.includes(f)));
    expect(hits).toEqual(['prosemirror-state']);
  });

  it('self-test: import scanner allows neutral local + platform specifiers', () => {
    const synthetic = `import type { EditorRuntime } from './types.js';\nimport { foo } from '../index.js';`;
    const hits = importSpecifiers(synthetic).filter((spec) => FORBIDDEN_IMPORT_FRAGMENTS.some((f) => spec.includes(f)));
    expect(hits).toEqual([]);
  });

  it('self-test: reference scanner flags a smuggled concrete-impl path string', () => {
    const line = `const p = require('@superdoc/super-editor/src/presentation-editor/PresentationEditor.js');`;
    const flagged = FORBIDDEN_REFERENCE_FRAGMENTS.some((f) => line.includes(f));
    expect(flagged).toBe(true);
  });
});
