#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON_CLI_PLATFORM_TARGETS } from './python-embedded-cli-targets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

const SDK_WORKSPACE_PACKAGE = path.join(REPO_ROOT, 'packages/sdk/package.json');
const NODE_PACKAGE = path.join(REPO_ROOT, 'packages/sdk/langs/node/package.json');
const NODE_PLATFORMS_ROOT = path.join(REPO_ROOT, 'packages/sdk/langs/node/platforms');
const PYPROJECT_FILE = path.join(REPO_ROOT, 'packages/sdk/langs/python/pyproject.toml');
const LEGACY_VERSION_FILE = path.join(REPO_ROOT, 'packages/sdk/version.json');
const PYTHON_PLATFORMS_ROOT = path.join(REPO_ROOT, 'packages/sdk/langs/python/platforms');

const OPTIONAL_PLATFORM_PACKAGES = [
  '@superdoc-dev/sdk-darwin-arm64',
  '@superdoc-dev/sdk-darwin-x64',
  '@superdoc-dev/sdk-linux-arm64',
  '@superdoc-dev/sdk-linux-x64',
  '@superdoc-dev/sdk-windows-x64',
];
const OPTIONAL_PLATFORM_DEP_SPEC = 'workspace:*';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// ---------------------------------------------------------------------------
// PEP 440 conversion
// ---------------------------------------------------------------------------

const PEP440_PRERELEASE_MAP = {
  alpha: 'a',
  beta: 'b',
  rc: 'rc',
};

/**
 * Convert semver to PEP 440 canonical form.
 *
 * Allowed prerelease channels: alpha, beta, rc, next. All others throw.
 * - alpha/beta/rc map to PEP 440 pre-release segments (a/b/rc)
 * - next maps to PEP 440 dev releases (.devN) — used for main-branch prereleases
 *
 * Note: .devN sorts BEFORE the release in PEP 440 (1.0.0.dev1 < 1.0.0),
 * which is correct prerelease semantics.
 *
 * Build metadata (+build) is rejected — PEP 440 local versions have
 * different semantics and must not be generated silently.
 */
export function semverToPep440(version) {
  if (version.includes('+')) {
    throw new Error(
      `semverToPep440: build metadata is not supported — got "${version}". ` +
        'Strip +build or define an explicit mapping before calling.',
    );
  }

  const match = version.match(/^(\d+\.\d+\.\d+)(?:-(alpha|beta|rc|next)\.(\d+))?$/);
  if (!match) {
    throw new Error(
      `semverToPep440: unsupported version format "${version}". ` +
        'Expected X.Y.Z or X.Y.Z-(alpha|beta|rc|next).N',
    );
  }

  const [, core, channel, pre] = match;
  if (!channel) return core;
  if (channel === 'next') return `${core}.dev${pre}`;
  return `${core}${PEP440_PRERELEASE_MAP[channel]}${pre}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSetVersion(argv) {
  const setIndex = argv.indexOf('--set');
  if (setIndex !== -1) {
    const value = argv[setIndex + 1];
    if (!value || value.startsWith('-')) {
      throw new Error('Missing value for --set');
    }
    return value;
  }

  if (argv.length === 1 && !argv[0].startsWith('-')) {
    return argv[0];
  }

  return null;
}

function assertSemver(version) {
  if (!SEMVER_RE.test(version)) {
    throw new Error(`Invalid semantic version: "${version}"`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Node SDK
// ---------------------------------------------------------------------------

async function syncNodePackage(version) {
  const raw = await readFile(NODE_PACKAGE, 'utf8');
  const packageVersionRe = /("version"\s*:\s*")([^"]*)(")/;
  if (!packageVersionRe.test(raw)) {
    throw new Error(`Could not find version in ${NODE_PACKAGE}`);
  }

  let next = raw.replace(packageVersionRe, `$1${version}$3`);
  for (const packageName of OPTIONAL_PLATFORM_PACKAGES) {
    const optionalDepRe = new RegExp(`("${escapeRegExp(packageName)}"\\s*:\\s*")([^"]*)(")`);
    if (optionalDepRe.test(next)) {
      next = next.replace(optionalDepRe, `$1${OPTIONAL_PLATFORM_DEP_SPEC}$3`);
    }
  }

  if (next !== raw) {
    await writeFile(NODE_PACKAGE, next, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Node SDK — platform package.json files
// ---------------------------------------------------------------------------

const NODE_PLATFORM_DIRS = [
  'sdk-darwin-arm64',
  'sdk-darwin-x64',
  'sdk-linux-x64',
  'sdk-linux-arm64',
  'sdk-windows-x64',
];

async function syncNodePlatformPackages(version) {
  for (const dir of NODE_PLATFORM_DIRS) {
    const pkgPath = path.join(NODE_PLATFORMS_ROOT, dir, 'package.json');
    try {
      const raw = await readFile(pkgPath, 'utf8');
      const versionRe = /("version"\s*:\s*")([^"]*)(")/;
      if (!versionRe.test(raw)) continue;

      const next = raw.replace(versionRe, `$1${version}$3`);
      if (next !== raw) {
        await writeFile(pkgPath, next, 'utf8');
      }
    } catch {
      // Platform package.json may not exist yet — not fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Python SDK — main pyproject.toml
// ---------------------------------------------------------------------------

async function syncPythonPackage(pepVersion) {
  const raw = await readFile(PYPROJECT_FILE, 'utf8');

  // Sync the [project] version field
  const versionLineRe = /^version\s*=\s*"[^"]*"/m;
  if (!versionLineRe.test(raw)) {
    throw new Error(`Could not find [project].version in ${PYPROJECT_FILE}`);
  }
  let next = raw.replace(versionLineRe, `version = "${pepVersion}"`);

  // Sync companion dependency version pins (e.g. superdoc-sdk-cli-darwin-arm64==1.0.0a6)
  for (const target of PYTHON_CLI_PLATFORM_TARGETS) {
    const depRe = new RegExp(`(${escapeRegExp(target.companionPypiName)})==[^;"]+`, 'g');
    next = next.replace(depRe, `$1==${pepVersion}`);
  }

  if (next !== raw) {
    await writeFile(PYPROJECT_FILE, next, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Python SDK — companion pyproject.toml files
// ---------------------------------------------------------------------------

async function syncCompanionPyprojectVersions(pepVersion) {
  for (const target of PYTHON_CLI_PLATFORM_TARGETS) {
    const tomlPath = path.join(PYTHON_PLATFORMS_ROOT, target.companionPypiName, 'pyproject.toml');
    const raw = await readFile(tomlPath, 'utf8');

    const versionLineRe = /^version\s*=\s*"[^"]*"/m;
    if (!versionLineRe.test(raw)) {
      throw new Error(`Could not find [project].version in ${tomlPath}`);
    }

    const next = raw.replace(versionLineRe, `version = "${pepVersion}"`);
    if (next !== raw) {
      await writeFile(tomlPath, next, 'utf8');
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy version file
// ---------------------------------------------------------------------------

async function syncLegacyVersionFile(version) {
  try {
    const versionState = await readJson(LEGACY_VERSION_FILE);
    if (versionState.sdkVersion !== version) {
      versionState.sdkVersion = version;
      await writeJson(LEGACY_VERSION_FILE, versionState);
    }
  } catch {
    // Legacy file is optional for compatibility with old tooling.
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const requestedVersion = parseSetVersion(argv);

  const workspacePackage = await readJson(SDK_WORKSPACE_PACKAGE);
  let version = workspacePackage.version;

  if (requestedVersion) {
    assertSemver(requestedVersion);
    version = requestedVersion;
  }

  if (typeof version !== 'string' || !version.trim()) {
    throw new Error(`Missing "version" in ${SDK_WORKSPACE_PACKAGE}`);
  }
  assertSemver(version);

  const pepVersion = semverToPep440(version);

  if (requestedVersion && workspacePackage.version !== version) {
    workspacePackage.version = version;
    await writeJson(SDK_WORKSPACE_PACKAGE, workspacePackage);
  }

  await syncNodePackage(version);
  await syncNodePlatformPackages(version);
  await syncPythonPackage(pepVersion);
  await syncCompanionPyprojectVersions(pepVersion);
  await syncLegacyVersionFile(version);

  console.log(`Synchronized SDK versions: ${version} (Python: ${pepVersion})`);
}

const __syncFilename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __syncFilename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
