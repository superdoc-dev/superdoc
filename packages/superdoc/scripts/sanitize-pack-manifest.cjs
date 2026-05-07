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

function prepare() {
  if (fs.existsSync(backupPath)) {
    throw new Error(`Refusing to prepare pack manifest while backup exists: ${backupPath}`);
  }

  const packageJson = readJson(packageJsonPath);
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

