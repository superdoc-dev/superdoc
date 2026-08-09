#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(packageRoot, 'package.json');
const backupPath = path.join(packageRoot, '.package.json.prepack-backup');
const ENGINE_PACKAGE_NAME = '@superdoc/docx-engine';
const engineWorkspaceManifest = path.resolve(packageRoot, '../../../v2/package.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function stripSourceConditions(value) {
  if (Array.isArray(value)) return value.map(stripSourceConditions);
  if (!value || typeof value !== 'object') return value;

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'source') continue;
    next[key] = stripSourceConditions(child);
  }
  return next;
}

function hasAnySourceKey(value) {
  if (Array.isArray(value)) return value.some(hasAnySourceKey);
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'source')) return true;
  return Object.values(value).some(hasAnySourceKey);
}

function stripPackOnlyDevDependencies(packageJson) {
  // The published superdoc package ships built dist output and must not require
  // consumers or package tooling to resolve build-time workspace/catalog
  // dependencies from the Orbit checkout.
  delete packageJson.devDependencies;
}

function resolveEngineVersion(sourceVersion, hasInternalWorkspace) {
  const pattern = hasInternalWorkspace
    ? /^workspace:(0\.\d+\.\d+(?:-next\.\d+)?)$/
    : /^(0\.\d+\.\d+(?:-next\.\d+)?)$/;
  const match = typeof sourceVersion === 'string' ? sourceVersion.match(pattern) : null;
  if (!match) {
    const requiredSpec = hasInternalWorkspace ? 'workspace:0.x in Orbit' : 'exact 0.x in an exported checkout';
    throw new Error(`${ENGINE_PACKAGE_NAME} must use ${requiredSpec} before packing`);
  }
  return match[1];
}

function pinEngineDependency(packageJson) {
  const sourceVersion = packageJson.dependencies?.[ENGINE_PACKAGE_NAME];
  packageJson.dependencies[ENGINE_PACKAGE_NAME] = resolveEngineVersion(
    sourceVersion,
    fs.existsSync(engineWorkspaceManifest),
  );
}

function isSanitized(packageJson) {
  if (Object.prototype.hasOwnProperty.call(packageJson, 'unpkg')) return false;
  if (Object.prototype.hasOwnProperty.call(packageJson, 'jsdelivr')) return false;
  if (Object.prototype.hasOwnProperty.call(packageJson, 'devDependencies')) return false;
  if (!/^0\.\d+\.\d+(?:-next\.\d+)?$/.test(packageJson.dependencies?.[ENGINE_PACKAGE_NAME] ?? '')) return false;
  return !hasAnySourceKey(packageJson.exports);
}

function prepare() {
  const packageJson = readJson(packageJsonPath);
  if (fs.existsSync(backupPath)) {
    // pnpm wraps prepack/postpack pre/post-scripts around a user script
    // named exactly `pack` (which is why the tarball lane is named
    // `pack:dist` — a `pack` script would sanitize the manifest BEFORE the
    // build step and strand it if the build fails). A backup with an
    // already-sanitized manifest is still treated as re-entrant (a nested
    // prepack) and no-ops so the matching postpack can restore cleanly.
    // Treat backup-without-sanitized-manifest as an inconsistent workspace
    // state (e.g. someone restored manually but left the backup) and fail
    // loudly so the developer can clean up.
    if (isSanitized(packageJson)) {
      console.log('[sanitize-pack-manifest] backup present and manifest already sanitized; nothing to do');
      return;
    }
    throw new Error(
      `Backup exists at ${backupPath} but package.json is not sanitized. ` +
        `The workspace is in an inconsistent state from a previous failed pack. ` +
        `Inspect both files and remove the backup once the source manifest is correct.`,
    );
  }

  fs.copyFileSync(packageJsonPath, backupPath);

  const sanitized = {
    ...packageJson,
    exports: stripSourceConditions(packageJson.exports),
  };

  stripPackOnlyDevDependencies(sanitized);
  pinEngineDependency(sanitized);
  delete sanitized.unpkg;
  delete sanitized.jsdelivr;

  writeJson(packageJsonPath, sanitized);
  console.log('[sanitize-pack-manifest] stripped source conditions and pinned the engine dependency');
}

function restore() {
  if (!fs.existsSync(backupPath)) return;
  // Only restore over a manifest that is actually sanitized. A backup next to
  // an UNSANITIZED manifest means a previous pack failed and the manifest was
  // since restored or edited by hand; overwriting it with the stale backup
  // would silently revert those edits and destroy the exact state the
  // prepare() error message tells the developer to inspect.
  if (!isSanitized(readJson(packageJsonPath))) {
    throw new Error(
      `Backup exists at ${backupPath} but package.json is not sanitized. ` +
        `Refusing to overwrite it with the stale backup. Inspect both files ` +
        `and remove the backup once the source manifest is correct.`,
    );
  }
  fs.copyFileSync(backupPath, packageJsonPath);
  fs.unlinkSync(backupPath);
  console.log('[sanitize-pack-manifest] restored source package.json');
}

if (require.main === module) {
  const command = process.argv[2];

  try {
    if (command === 'prepare') {
      prepare();
    } else if (command === 'restore') {
      restore();
    } else {
      throw new Error('Usage: sanitize-pack-manifest.cjs <prepare|restore>');
    }
  } catch (error) {
    console.error(`[sanitize-pack-manifest] ${error.message || error}`);
    process.exit(1);
  }
}

module.exports = { resolveEngineVersion };
