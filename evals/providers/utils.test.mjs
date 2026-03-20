import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { computeSdkFingerprint } from './utils.mjs';

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
