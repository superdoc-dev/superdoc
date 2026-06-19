import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

async function readRepoFile(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('canvas system dependency installer guards apt commands with timeout and diagnostics', async () => {
  const content = await readRepoFile('scripts/install-canvas-system-dependencies.sh');

  assert.ok(content.includes('APT_COMMAND_TIMEOUT:-10m'));
  assert.ok(content.includes('timeout "${apt_timeout}" sudo apt-get'));
  assert.ok(content.includes('Acquire::Retries=3'));
  assert.ok(content.includes('Dpkg::Use-Pty=0'));
  assert.ok(content.includes('timed out after ${apt_timeout}'));
  assert.ok(content.includes('fuser -v /var/lib/dpkg/lock'));
});

test('workflows use the guarded canvas dependency installer instead of raw apt commands', async () => {
  const workflowFiles = [
    '.github/workflows/manual-patch-release.yml',
    '.github/workflows/pr-renderer-build.yml',
    '.github/workflows/ci-superdoc.yml',
    '.github/workflows/release-cli.yml',
    '.github/workflows/release-sdk.yml',
    '.github/workflows/release-stable.yml',
    '.github/workflows/release-superdoc.yml',
  ];

  for (const file of workflowFiles) {
    const content = await readRepoFile(file);
    assert.ok(
      content.includes('scripts/install-canvas-system-dependencies.sh'),
      `${file}: must call scripts/install-canvas-system-dependencies.sh`,
    );
    assert.equal(content.includes('sudo apt-get update'), false, `${file}: must not run raw apt-get update`);
    assert.equal(content.includes('sudo apt-get install'), false, `${file}: must not run raw apt-get install`);
  }
});
