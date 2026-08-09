import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createEnginePackArguments, linkEngineIntoConsumerRoots } from '../ci-docx-engine-artifact.mjs';

test('builds Document API while reusing the existing engine build', () => {
  const args = createEnginePackArguments();

  assert.equal(args.includes('--no-build'), true);
  assert.equal(args.includes('--no-document-api-build'), false);
});

test('links the engine where a Vite app resolves its absolute worker URL', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'superdoc-engine-consumer-'));
  try {
    const engineRoot = path.join(root, 'engine');
    const worker = path.join(engineRoot, 'dist/assets/browser-worker-entry-test.js');
    const appRoot = path.join(root, 'app');
    mkdirSync(path.dirname(worker), { recursive: true });
    mkdirSync(path.join(appRoot, 'node_modules'), { recursive: true });
    writeFileSync(worker, 'self.onmessage = () => {};\n');

    assert.deepEqual(linkEngineIntoConsumerRoots(engineRoot, [appRoot]), [appRoot]);

    const appWorker = path.join(appRoot, 'node_modules/@superdoc/docx-engine/dist/assets/browser-worker-entry-test.js');
    assert.equal(existsSync(appWorker), true);
    assert.equal(realpathSync(appWorker), realpathSync(worker));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
