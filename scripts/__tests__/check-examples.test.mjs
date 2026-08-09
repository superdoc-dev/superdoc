import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findExampleProblems } from '../check-examples.mjs';

function withCatalog(manifest, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'superdoc-examples-'));
  const example = path.join(root, 'quickstart');
  mkdirSync(example);
  writeFileSync(path.join(root, 'README.md'), '# Examples\n');
  writeFileSync(path.join(example, 'README.md'), '# Quickstart\n');
  writeFileSync(path.join(example, 'package.json'), JSON.stringify(manifest));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const validManifest = {
  name: '@superdoc-examples/quickstart',
  private: true,
  scripts: { typecheck: 'tsc --noEmit', test: 'node --test' },
  dependencies: { superdoc: '^2.4.0' },
};

test('accepts a complete example with executable checks', () => {
  withCatalog(validManifest, (root) => assert.deepEqual(findExampleProblems(root), []));
});

test('requires the fixed example scripts', () => {
  withCatalog({ ...validManifest, scripts: {} }, (root) => {
    assert.deepEqual(findExampleProblems(root), [
      'quickstart: missing typecheck script',
      'quickstart: missing test script',
    ]);
  });
});

test('rejects dependency specifiers that cannot be copied out of the workspace', () => {
  withCatalog({ ...validManifest, dependencies: { superdoc: 'workspace:*' } }, (root) => {
    assert.deepEqual(findExampleProblems(root), ['quickstart: superdoc must use an installable version range']);
  });
});

test('rejects another catalog file beside the example directories', () => {
  withCatalog(validManifest, (root) => {
    writeFileSync(path.join(root, 'manifest.json'), '{}');
    assert.deepEqual(findExampleProblems(root), [
      'manifest.json: only example directories are allowed beside README.md',
    ]);
  });
});
