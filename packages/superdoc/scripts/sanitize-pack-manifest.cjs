#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(packageRoot, 'package.json');
const backupPath = path.join(packageRoot, '.package.json.prepack-backup');

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

function isSanitized(packageJson) {
  if (Object.prototype.hasOwnProperty.call(packageJson, 'unpkg')) return false;
  if (Object.prototype.hasOwnProperty.call(packageJson, 'jsdelivr')) return false;
  return !hasAnySourceKey(packageJson.exports);
}

function prepare() {
  const packageJson = readJson(packageJsonPath);
  if (fs.existsSync(backupPath)) {
    // pnpm wraps prepack/postpack lifecycle around scripts named exactly
    // `pack`. The user `pack` script runs `pnpm pack` internally, which
    // triggers a second prepack. Treat that as re-entrant when the
    // current manifest already looks sanitized (outer prepack ran, we
    // are the inner) and no-op so the inner postpack can restore
    // cleanly. Treat backup-without-sanitized-manifest as an
    // inconsistent workspace state (e.g. someone restored manually but
    // left the backup) and fail loudly so the developer can clean up.
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

  delete sanitized.unpkg;
  delete sanitized.jsdelivr;

  writeJson(packageJsonPath, sanitized);
  console.log('[sanitize-pack-manifest] stripped source conditions from packed package.json');
}

function restore() {
  if (!fs.existsSync(backupPath)) return;
  fs.copyFileSync(backupPath, packageJsonPath);
  fs.unlinkSync(backupPath);
  console.log('[sanitize-pack-manifest] restored source package.json');
}

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

