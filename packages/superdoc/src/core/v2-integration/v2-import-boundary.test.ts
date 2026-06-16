import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..', '..');

const FORBIDDEN_IMPORT_FRAGMENTS = [
  '@superdoc/v2-browser-shell',
  '@superdoc/v2-host',
  '@superdoc/headless',
  '@superdoc/collaboration-v2',
  '@superdoc/editor-core',
  '@superdoc/document-api-v2-adapter',
  '@superdoc/style-model',
  '@superdoc/v2-layout-adapter',
  '@superdoc/v2/',
];

function* walkSourceFiles(dir: string): IterableIterator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkSourceFiles(full);
      continue;
    }
    if (!/\.(js|ts|vue|jsx|tsx)$/.test(full)) continue;
    if (/\.(test|spec)\.[jt]sx?$/.test(full)) continue;
    yield full;
  }
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const fromRe = /\b(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
  const bareRe = /\bimport\s*\(?\s*['"]([^'"]+)['"]/g;
  for (const re of [fromRe, bareRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) specs.push(m[1]);
  }
  return specs;
}

describe('public v2 import boundary', () => {
  it('has no V2 implementation imports outside the approved seam', () => {
    const offenders: { file: string; spec: string; fragment: string }[] = [];
    for (const file of walkSourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split(sep).join('/');
      const source = readFileSync(file, 'utf8');
      for (const spec of importSpecifiers(source)) {
        for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
          if (spec.includes(fragment)) {
            offenders.push({ file: rel, spec, fragment });
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('self-test: scanner detects a forbidden V2 implementation specifier', () => {
    const synthetic = `import { x } from '@superdoc/v2-host';\nimport y from './ok.js';`;
    const hits = importSpecifiers(synthetic).filter((spec) =>
      FORBIDDEN_IMPORT_FRAGMENTS.some((f) => spec.includes(f)),
    );
    expect(hits).toEqual(['@superdoc/v2-host']);
  });

  it('self-test: scanner allows the local seam module specifier', () => {
    const synthetic = `import { resolveV2Integration } from './core/v2-integration/v2-integration.js';`;
    const hits = importSpecifiers(synthetic).filter((spec) =>
      FORBIDDEN_IMPORT_FRAGMENTS.some((f) => spec.includes(f)),
    );
    expect(hits).toEqual([]);
  });
});
