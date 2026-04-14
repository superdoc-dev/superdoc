import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { computeSdkFingerprint, extractDocxText } from './provider-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures/docs');

function withTempDir(run) {
  const tempDir = mkdtempSync(resolve(tmpdir(), 'superdoc-evals-utils-'));
  try {
    run(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

test('computeSdkFingerprint changes when a nested SDK dist file changes', () => {
  withTempDir((root) => {
    const sdkDistDir = resolve(root, 'sdk/dist');
    const promptFile = resolve(root, 'packages/sdk/tools/system-prompt.md');
    const cliFile = resolve(root, 'apps/cli/dist/index.js');

    writeFile(resolve(sdkDistDir, 'index.js'), "export { run } from './runtime/process.js';\n");
    writeFile(resolve(sdkDistDir, 'runtime/process.js'), 'export const run = () => "v1";\n');
    writeFile(promptFile, 'system prompt\n');
    writeFile(cliFile, 'console.log("cli");\n');

    const before = computeSdkFingerprint({
      files: [promptFile, cliFile],
      directories: [sdkDistDir],
    });

    writeFile(resolve(sdkDistDir, 'runtime/process.js'), 'export const run = () => "v2";\n');

    const after = computeSdkFingerprint({
      files: [promptFile, cliFile],
      directories: [sdkDistDir],
    });

    assert.notEqual(before, after);
  });
});

test('computeSdkFingerprint changes when a new SDK dist file is added', () => {
  withTempDir((root) => {
    const sdkDistDir = resolve(root, 'sdk/dist');
    const promptFile = resolve(root, 'packages/sdk/tools/system-prompt.md');
    const cliFile = resolve(root, 'apps/cli/dist/index.js');

    writeFile(resolve(sdkDistDir, 'index.js'), "export { run } from './runtime/process.js';\n");
    writeFile(resolve(sdkDistDir, 'runtime/process.js'), 'export const run = () => "ready";\n');
    writeFile(promptFile, 'system prompt\n');
    writeFile(cliFile, 'console.log("cli");\n');

    const before = computeSdkFingerprint({
      files: [promptFile, cliFile],
      directories: [sdkDistDir],
    });

    writeFile(resolve(sdkDistDir, 'generated/client.js'), 'export const generated = true;\n');

    const after = computeSdkFingerprint({
      files: [promptFile, cliFile],
      directories: [sdkDistDir],
    });

    assert.notEqual(before, after);
  });
});

test('extractDocxText returns non-empty text from a real DOCX fixture', () => {
  const docxPath = resolve(FIXTURES_DIR, 'document.docx');
  const text = extractDocxText(docxPath);
  assert.ok(typeof text === 'string', 'result should be a string');
  assert.ok(text.length > 0, 'result should be non-empty for a real DOCX file');
});

test('extractDocxText returns empty string for a missing file', () => {
  const text = extractDocxText('/tmp/__nonexistent_superdoc_test_file__.docx');
  assert.equal(text, '');
});
