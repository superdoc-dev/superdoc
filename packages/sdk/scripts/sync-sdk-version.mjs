#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

const SDK_WORKSPACE_PACKAGE = path.join(REPO_ROOT, 'packages/sdk/package.json');
const NODE_PACKAGE = path.join(REPO_ROOT, 'packages/sdk/langs/node/package.json');
const PYPROJECT_FILE = path.join(REPO_ROOT, 'packages/sdk/langs/python/pyproject.toml');
const LEGACY_VERSION_FILE = path.join(REPO_ROOT, 'packages/sdk/version.json');

const OPTIONAL_PLATFORM_PACKAGES = [
  '@superdoc-dev/sdk-darwin-arm64',
  '@superdoc-dev/sdk-darwin-x64',
  '@superdoc-dev/sdk-linux-arm64',
  '@superdoc-dev/sdk-linux-x64',
  '@superdoc-dev/sdk-windows-x64',
];

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

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
      next = next.replace(optionalDepRe, `$1${version}$3`);
    }
  }

  if (next !== raw) {
    await writeFile(NODE_PACKAGE, next, 'utf8');
  }
}

async function syncPythonPackage(version) {
  const raw = await readFile(PYPROJECT_FILE, 'utf8');
  const versionLineRe = /^version\s*=\s*"[^"]*"/m;
  if (!versionLineRe.test(raw)) {
    throw new Error(`Could not find [project].version in ${PYPROJECT_FILE}`);
  }

  const next = raw.replace(versionLineRe, `version = "${version}"`);
  if (next !== raw) {
    await writeFile(PYPROJECT_FILE, next, 'utf8');
  }
}

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

async function main() {
  const argv = process.argv.slice(2);
  const requestedVersion = parseSetVersion(argv);

  const workspacePackage = await readJson(SDK_WORKSPACE_PACKAGE);
  let version = workspacePackage.version;

  if (requestedVersion) {
    assertSemver(requestedVersion);
    version = requestedVersion;
    if (workspacePackage.version !== version) {
      workspacePackage.version = version;
      await writeJson(SDK_WORKSPACE_PACKAGE, workspacePackage);
    }
  }

  if (typeof version !== 'string' || !version.trim()) {
    throw new Error(`Missing "version" in ${SDK_WORKSPACE_PACKAGE}`);
  }
  assertSemver(version);

  await syncNodePackage(version);
  await syncPythonPackage(version);
  await syncLegacyVersionFile(version);

  console.log(`Synchronized SDK versions from packages/sdk/package.json -> ${version}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
