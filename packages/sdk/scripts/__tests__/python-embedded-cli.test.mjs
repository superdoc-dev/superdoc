import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MACHINE_ALIASES,
  PYTHON_CLI_PLATFORM_TARGETS,
  PYTHON_EMBEDDED_CLI_TARGETS,
  toCompanionWheelBinaryEntries,
  toPythonWheelEmbeddedCliEntries,
  machineMarker,
} from '../python-embedded-cli-targets.mjs';
import { stageAllCompanionBinaries } from '../stage-python-companion-cli.mjs';
import { semverToPep440 } from '../sync-sdk-version.mjs';
import { verifyRootWheel } from '../verify-python-companion-wheels.mjs';
import { findMissingWheelEntries } from '../verify-python-wheel-embedded-cli.mjs';

// ---------------------------------------------------------------------------
// Target map consistency
// ---------------------------------------------------------------------------

test('every target has required companion fields', () => {
  for (const target of PYTHON_CLI_PLATFORM_TARGETS) {
    assert.ok(target.id, 'missing id');
    assert.ok(target.sourcePackage, `${target.id}: missing sourcePackage`);
    assert.ok(target.binaryName, `${target.id}: missing binaryName`);
    assert.ok(target.companionPypiName, `${target.id}: missing companionPypiName`);
    assert.ok(target.companionModuleName, `${target.id}: missing companionModuleName`);
    assert.ok(target.marker, `${target.id}: missing marker`);
  }
});

test('companion module names follow PyPI normalization (underscores)', () => {
  for (const target of PYTHON_CLI_PLATFORM_TARGETS) {
    const expected = target.companionPypiName.replace(/-/g, '_');
    assert.equal(target.companionModuleName, expected, `${target.id}: module name mismatch`);
  }
});

test('toCompanionWheelBinaryEntries returns one entry per target', () => {
  const entries = toCompanionWheelBinaryEntries();
  assert.equal(entries.length, PYTHON_CLI_PLATFORM_TARGETS.length);
  for (const target of PYTHON_CLI_PLATFORM_TARGETS) {
    const expected = `${target.companionModuleName}/bin/${target.binaryName}`;
    assert.ok(entries.includes(expected), `missing entry for ${target.id}: ${expected}`);
  }
});

test('legacy findMissingWheelEntries reports only missing entries', () => {
  const entries = toPythonWheelEmbeddedCliEntries();
  const partial = entries.filter((entry) => !entry.endsWith('/linux-arm64/superdoc'));
  const missing = findMissingWheelEntries(partial, PYTHON_EMBEDDED_CLI_TARGETS);
  assert.deepEqual(missing, ['superdoc/_vendor/cli/linux-arm64/superdoc']);
});

// ---------------------------------------------------------------------------
// Machine alias alignment
// ---------------------------------------------------------------------------

test('MACHINE_ALIASES covers x64 and arm64 canonical architectures', () => {
  assert.ok(MACHINE_ALIASES.x64, 'missing x64 aliases');
  assert.ok(MACHINE_ALIASES.arm64, 'missing arm64 aliases');
  assert.ok(MACHINE_ALIASES.x64.includes('x86_64'), 'x64 must include x86_64');
  assert.ok(MACHINE_ALIASES.x64.includes('AMD64'), 'x64 must include AMD64');
  assert.ok(MACHINE_ALIASES.arm64.includes('arm64'), 'arm64 must include arm64');
  assert.ok(MACHINE_ALIASES.arm64.includes('aarch64'), 'arm64 must include aarch64');
});

test('machineMarker generates valid PEP 508 OR-conditions', () => {
  const arm64Marker = machineMarker('arm64');
  for (const alias of MACHINE_ALIASES.arm64) {
    assert.ok(arm64Marker.includes(`platform_machine == '${alias}'`), `arm64 marker missing ${alias}`);
  }
  assert.ok(arm64Marker.includes(' or '), 'arm64 marker should have OR conditions');

  const x64Marker = machineMarker('x64');
  for (const alias of MACHINE_ALIASES.x64) {
    assert.ok(x64Marker.includes(`platform_machine == '${alias}'`), `x64 marker missing ${alias}`);
  }
});

test('machineMarker throws on unknown architecture', () => {
  assert.throws(() => machineMarker('mips'), /Unknown canonical architecture/);
});

test('Python _normalized_machine aliases match JS MACHINE_ALIASES', async () => {
  // Read the Python source and extract the alias mappings
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '../../../../');
  const pythonSource = await readFile(
    path.join(repoRoot, 'packages/sdk/langs/python/superdoc/embedded_cli.py'),
    'utf8',
  );

  // The Python code maps these lowercased values → canonical arch:
  // x86_64, amd64 → x64
  // aarch64, arm64 → arm64
  for (const alias of MACHINE_ALIASES.x64) {
    assert.ok(
      pythonSource.includes(alias.toLowerCase()),
      `Python _normalized_machine() is missing x64 alias "${alias.toLowerCase()}"`,
    );
  }
  for (const alias of MACHINE_ALIASES.arm64) {
    assert.ok(
      pythonSource.includes(alias.toLowerCase()),
      `Python _normalized_machine() is missing arm64 alias "${alias.toLowerCase()}"`,
    );
  }
});

// ---------------------------------------------------------------------------
// Companion staging
// ---------------------------------------------------------------------------

test('stageAllCompanionBinaries copies binaries into companion package paths', async (t) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'sdk-companion-stage-'));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const cliPlatformsRoot = path.join(tempRoot, 'cli-platforms');
  const platformsRoot = path.join(tempRoot, 'platforms');

  // Create fake companion package dirs and source binaries (> 1 MB)
  const fakeBinaryContent = Buffer.alloc(2 * 1e6, 'x'); // 2 MB
  for (const target of PYTHON_CLI_PLATFORM_TARGETS) {
    const sourcePath = path.join(cliPlatformsRoot, target.sourcePackage, 'bin', target.binaryName);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, fakeBinaryContent);

    // Create companion package directory structure
    const companionDir = path.join(platformsRoot, target.companionPypiName, target.companionModuleName, 'bin');
    await mkdir(companionDir, { recursive: true });
  }

  await stageAllCompanionBinaries({
    cliPlatformsRoot,
    platformsRoot,
    manifestPath: null,
  });

  for (const target of PYTHON_CLI_PLATFORM_TARGETS) {
    const stagedPath = path.join(
      platformsRoot, target.companionPypiName, target.companionModuleName, 'bin', target.binaryName,
    );
    const fileStat = await stat(stagedPath);
    assert.ok(fileStat.size > 1e6, `${target.id}: staged binary should be > 1 MB`);
  }
});

test('stageAllCompanionBinaries throws when source binary is missing', async (t) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'sdk-companion-missing-'));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const cliPlatformsRoot = path.join(tempRoot, 'cli-platforms');
  const platformsRoot = path.join(tempRoot, 'platforms');

  // Only create binaries for all targets except the first
  const [firstTarget, ...otherTargets] = PYTHON_CLI_PLATFORM_TARGETS;
  const fakeBinaryContent = Buffer.alloc(2 * 1e6, 'x');
  for (const target of otherTargets) {
    const sourcePath = path.join(cliPlatformsRoot, target.sourcePackage, 'bin', target.binaryName);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, fakeBinaryContent);

    const companionDir = path.join(platformsRoot, target.companionPypiName, target.companionModuleName, 'bin');
    await mkdir(companionDir, { recursive: true });
  }

  await assert.rejects(
    () => stageAllCompanionBinaries({ cliPlatformsRoot, platformsRoot, manifestPath: null }),
    (error) => {
      assert.match(String(error?.message), new RegExp(`Missing CLI binary for ${firstTarget.id}`));
      return true;
    },
  );
});

test('stageAllCompanionBinaries rejects suspiciously small binaries', async (t) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'sdk-companion-small-'));
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const cliPlatformsRoot = path.join(tempRoot, 'cli-platforms');
  const platformsRoot = path.join(tempRoot, 'platforms');

  // Create a tiny binary for the first target
  const [firstTarget] = PYTHON_CLI_PLATFORM_TARGETS;
  const sourcePath = path.join(cliPlatformsRoot, firstTarget.sourcePackage, 'bin', firstTarget.binaryName);
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, 'tiny');

  const companionDir = path.join(platformsRoot, firstTarget.companionPypiName, firstTarget.companionModuleName, 'bin');
  await mkdir(companionDir, { recursive: true });

  await assert.rejects(
    () => stageAllCompanionBinaries({
      targets: [firstTarget],
      cliPlatformsRoot,
      platformsRoot,
      manifestPath: null,
    }),
    (error) => {
      assert.match(String(error?.message), /suspiciously small/);
      return true;
    },
  );
});

test('verifyRootWheel accepts options object with distDir', async (t) => {
  const emptyDistDir = await mkdtemp(path.join(tmpdir(), 'sdk-root-wheel-empty-'));
  t.after(async () => {
    await rm(emptyDistDir, { recursive: true, force: true });
  });

  await assert.rejects(
    () => verifyRootWheel({ targets: [], distDir: emptyDistDir }),
    (error) => {
      assert.ok(String(error?.message).includes(`No wheel found in ${emptyDistDir}`));
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Manifest SHA256 enforcement
// ---------------------------------------------------------------------------

async function createStagingFixture(t) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'sdk-companion-manifest-'));
  t.after(async () => { await rm(tempRoot, { recursive: true, force: true }); });

  const cliPlatformsRoot = path.join(tempRoot, 'cli-platforms');
  const platformsRoot = path.join(tempRoot, 'platforms');
  const manifestPath = path.join(tempRoot, 'manifest.json');
  const [target] = PYTHON_CLI_PLATFORM_TARGETS;
  const fakeBinary = Buffer.alloc(2 * 1e6, 'x');

  const sourcePath = path.join(cliPlatformsRoot, target.sourcePackage, 'bin', target.binaryName);
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, fakeBinary);

  const companionDir = path.join(platformsRoot, target.companionPypiName, target.companionModuleName, 'bin');
  await mkdir(companionDir, { recursive: true });

  const sha256 = createHash('sha256').update(fakeBinary).digest('hex');
  return { tempRoot, cliPlatformsRoot, platformsRoot, manifestPath, target, sha256 };
}

test('stageAllCompanionBinaries passes when manifest SHA256 matches', async (t) => {
  const { cliPlatformsRoot, platformsRoot, manifestPath, target, sha256 } = await createStagingFixture(t);

  await writeFile(manifestPath, JSON.stringify({
    targets: [{ target: target.id, sha256 }],
  }));

  await stageAllCompanionBinaries({
    targets: [target],
    cliPlatformsRoot,
    platformsRoot,
    manifestPath,
  });

  const stagedPath = path.join(platformsRoot, target.companionPypiName, target.companionModuleName, 'bin', target.binaryName);
  const fileStat = await stat(stagedPath);
  assert.ok(fileStat.size > 1e6);
});

test('stageAllCompanionBinaries rejects when manifest SHA256 mismatches', async (t) => {
  const { cliPlatformsRoot, platformsRoot, manifestPath, target } = await createStagingFixture(t);

  await writeFile(manifestPath, JSON.stringify({
    targets: [{ target: target.id, sha256: 'deadbeef'.repeat(8) }],
  }));

  await assert.rejects(
    () => stageAllCompanionBinaries({
      targets: [target],
      cliPlatformsRoot,
      platformsRoot,
      manifestPath,
    }),
    (error) => {
      assert.match(String(error?.message), /SHA256 mismatch/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// semverToPep440
// ---------------------------------------------------------------------------

test('semverToPep440: stable version passes through', () => {
  assert.equal(semverToPep440('1.0.0'), '1.0.0');
  assert.equal(semverToPep440('2.3.4'), '2.3.4');
});

test('semverToPep440: alpha prerelease', () => {
  assert.equal(semverToPep440('1.0.0-alpha.6'), '1.0.0a6');
  assert.equal(semverToPep440('1.0.0-alpha.0'), '1.0.0a0');
  assert.equal(semverToPep440('1.0.0-alpha.99'), '1.0.0a99');
});

test('semverToPep440: beta prerelease', () => {
  assert.equal(semverToPep440('1.0.0-beta.3'), '1.0.0b3');
});

test('semverToPep440: rc prerelease', () => {
  assert.equal(semverToPep440('1.0.0-rc.1'), '1.0.0rc1');
});

test('semverToPep440: rejects unsupported prerelease channel', () => {
  assert.throws(() => semverToPep440('1.0.0-gamma.1'), /unsupported version format/);
  assert.throws(() => semverToPep440('1.0.0-dev.1'), /unsupported version format/);
});

test('semverToPep440: rejects build metadata', () => {
  assert.throws(() => semverToPep440('1.0.0+build42'), /build metadata is not supported/);
  assert.throws(() => semverToPep440('1.0.0-alpha.1+sha.abc'), /build metadata is not supported/);
});

test('semverToPep440: rejects missing numeric suffix', () => {
  assert.throws(() => semverToPep440('1.0.0-alpha'), /unsupported version format/);
});

test('semverToPep440: rejects garbage input', () => {
  assert.throws(() => semverToPep440('not-a-version'), /unsupported version format/);
  assert.throws(() => semverToPep440(''), /unsupported version format/);
});
