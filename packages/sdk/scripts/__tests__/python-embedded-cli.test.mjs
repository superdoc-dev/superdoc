import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PYTHON_EMBEDDED_CLI_TARGETS, toPythonWheelEmbeddedCliEntries } from '../python-embedded-cli-targets.mjs';
import { stagePythonEmbeddedCli } from '../stage-python-embedded-cli.mjs';
import { findMissingWheelEntries } from '../verify-python-wheel-embedded-cli.mjs';

test('toPythonWheelEmbeddedCliEntries returns one entry per target', () => {
  const entries = toPythonWheelEmbeddedCliEntries();

  assert.equal(entries.length, PYTHON_EMBEDDED_CLI_TARGETS.length);
  assert.deepEqual(
    entries,
    PYTHON_EMBEDDED_CLI_TARGETS.map((target) => `superdoc/_vendor/cli/${target.id}/${target.binaryName}`),
  );
});

test('findMissingWheelEntries reports only missing target entries', () => {
  const entries = toPythonWheelEmbeddedCliEntries();
  const partial = entries.filter((entry) => !entry.endsWith('/linux-arm64/superdoc'));
  const missing = findMissingWheelEntries(partial);

  assert.deepEqual(missing, ['superdoc/_vendor/cli/linux-arm64/superdoc']);
});

test('stagePythonEmbeddedCli copies binaries into vendor paths and creates init files', async (t) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'sdk-python-embedded-cli-'));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const cliPlatformsRoot = path.join(tempRoot, 'cli-platforms');
  const pythonVendorRoot = path.join(tempRoot, 'python-vendor');

  for (const target of PYTHON_EMBEDDED_CLI_TARGETS) {
    const sourcePath = path.join(cliPlatformsRoot, target.sourcePackage, 'bin', target.binaryName);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, `binary-${target.id}`, 'utf8');
  }

  await stagePythonEmbeddedCli({
    cliPlatformsRoot,
    pythonVendorRoot,
    pythonVendorCliRoot: path.join(pythonVendorRoot, 'cli'),
  });

  const vendorInit = await readFile(path.join(pythonVendorRoot, '__init__.py'), 'utf8');
  const vendorCliInit = await readFile(path.join(pythonVendorRoot, 'cli', '__init__.py'), 'utf8');
  assert.equal(vendorInit, '');
  assert.equal(vendorCliInit, '');

  for (const target of PYTHON_EMBEDDED_CLI_TARGETS) {
    const stagedPath = path.join(pythonVendorRoot, 'cli', target.id, target.binaryName);
    const content = await readFile(stagedPath, 'utf8');
    assert.equal(content, `binary-${target.id}`);
  }
});

test('stagePythonEmbeddedCli throws when a required source binary is missing', async (t) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'sdk-python-embedded-cli-missing-'));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const cliPlatformsRoot = path.join(tempRoot, 'cli-platforms');
  const pythonVendorRoot = path.join(tempRoot, 'python-vendor');
  const [firstTarget, ...otherTargets] = PYTHON_EMBEDDED_CLI_TARGETS;

  for (const target of otherTargets) {
    const sourcePath = path.join(cliPlatformsRoot, target.sourcePackage, 'bin', target.binaryName);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, `binary-${target.id}`, 'utf8');
  }

  await assert.rejects(
    () =>
      stagePythonEmbeddedCli({
        cliPlatformsRoot,
        pythonVendorRoot,
        pythonVendorCliRoot: path.join(pythonVendorRoot, 'cli'),
      }),
    (error) => {
      assert.match(String(error?.message), new RegExp(`Missing CLI binary for ${firstTarget.id}`));
      return true;
    },
  );
});
