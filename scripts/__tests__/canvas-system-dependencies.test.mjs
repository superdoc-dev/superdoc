import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
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
  const workflowCandidates = [
    { path: '.github/workflows/ci-superdoc.yml', requiresInstaller: true },
    { path: '.github/workflows/v2-public-validation.yml', requiresInstaller: false },
  ];
  const workflowFiles = [];
  for (const candidate of workflowCandidates) {
    try {
      await access(path.join(REPO_ROOT, candidate.path));
      workflowFiles.push(candidate);
    } catch {
      // The export seam intentionally replaces ci-superdoc with
      // v2-public-validation, so exactly one candidate may be absent.
    }
  }
  assert.ok(workflowFiles.length > 0, 'expected an active SuperDoc validation workflow to scan');

  for (const { path: file, requiresInstaller } of workflowFiles) {
    const content = await readRepoFile(file);
    if (requiresInstaller) {
      assert.ok(
        content.includes('scripts/install-canvas-system-dependencies.sh'),
        `${file}: must call scripts/install-canvas-system-dependencies.sh`,
      );
    }
    assert.equal(content.includes('sudo apt-get update'), false, `${file}: must not run raw apt-get update`);
    assert.equal(content.includes('sudo apt-get install'), false, `${file}: must not run raw apt-get install`);
  }
});
