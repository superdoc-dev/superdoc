import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveCliPackageVersion, resolveCliPackageVersionFromModuleUrl } from '../../lib/version';

const CLI_ROOT = join(import.meta.dir, '../../..');
const CLI_PACKAGE_JSON_PATH = join(CLI_ROOT, 'package.json');

async function readCliPackageVersion(): Promise<string> {
  const raw = await readFile(CLI_PACKAGE_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error('Expected apps/cli/package.json to contain a non-empty version string.');
  }
  return parsed.version;
}

describe('resolveCliPackageVersion', () => {
  test('returns a non-empty version string', () => {
    const version = resolveCliPackageVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  test('resolves the CLI package version from the source layout', async () => {
    const expectedVersion = await readCliPackageVersion();
    const moduleUrl = pathToFileURL(join(CLI_ROOT, 'src/lib/version.ts')).href;

    expect(resolveCliPackageVersionFromModuleUrl(moduleUrl)).toBe(expectedVersion);
  });

  test('resolves the CLI package version from the published dist layout', async () => {
    const expectedVersion = await readCliPackageVersion();
    const moduleUrl = pathToFileURL(join(CLI_ROOT, 'dist/index.js')).href;

    expect(resolveCliPackageVersionFromModuleUrl(moduleUrl)).toBe(expectedVersion);
  });

  test('resolves the CLI package version from a published platform package layout', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'superdoc-cli-platform-version-'));
    const platformPackageDir = join(tempDir, 'node_modules/@superdoc-dev/cli-darwin-arm64');
    const expectedVersion = '9.8.7';

    try {
      await mkdir(join(platformPackageDir, 'dist'), { recursive: true });
      await writeFile(
        join(platformPackageDir, 'package.json'),
        JSON.stringify({
          name: '@superdoc-dev/cli-darwin-arm64',
          version: expectedVersion,
        }),
      );

      const moduleUrl = pathToFileURL(join(platformPackageDir, 'dist/index.js')).href;
      expect(resolveCliPackageVersionFromModuleUrl(moduleUrl)).toBe(expectedVersion);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('falls back when no matching CLI package manifest exists', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'superdoc-cli-version-'));

    try {
      const moduleUrl = pathToFileURL(join(tempDir, 'dist/index.js')).href;
      expect(resolveCliPackageVersionFromModuleUrl(moduleUrl)).toBe('0.0.0');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('returns the same value on subsequent calls (cached)', () => {
    const first = resolveCliPackageVersion();
    const second = resolveCliPackageVersion();
    expect(first).toBe(second);
  });
});
