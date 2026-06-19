#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(packageRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const canonicalTarballName = 'superdoc.tgz';

function toPackTarballName(name, version) {
  const normalizedName = name.startsWith('@') ? name.slice(1).replace(/\//g, '-') : name;
  return `${normalizedName}-${version}.tgz`;
}

function listGeneratedTarballs() {
  return fs
    .readdirSync(packageRoot)
    .filter((entry) => entry.endsWith('.tgz') && entry !== canonicalTarballName)
    .sort();
}

function removeIfPresent(fileName) {
  fs.rmSync(path.join(packageRoot, fileName), { force: true });
}

function clean() {
  removeIfPresent(canonicalTarballName);
  for (const fileName of listGeneratedTarballs()) {
    removeIfPresent(fileName);
  }
  console.log('[pack-output] removed stale tarballs');
}

function finalize() {
  const expectedTarballName = toPackTarballName(packageJson.name, packageJson.version);
  const expectedTarballPath = path.join(packageRoot, expectedTarballName);
  const candidates = fs.existsSync(expectedTarballPath) ? [expectedTarballName] : listGeneratedTarballs();

  if (candidates.length !== 1) {
    console.error(`[pack-output] expected exactly one generated tarball, found ${candidates.length}.`);
    if (candidates.length > 0) {
      for (const fileName of candidates) {
        console.error(`  - ${fileName}`);
      }
    }
    process.exit(1);
  }

  const sourceName = candidates[0];
  const sourcePath = path.join(packageRoot, sourceName);
  const destinationPath = path.join(packageRoot, canonicalTarballName);

  removeIfPresent(canonicalTarballName);
  fs.renameSync(sourcePath, destinationPath);
  console.log(`[pack-output] wrote ${canonicalTarballName} from ${sourceName}`);
}

const mode = process.argv[2];

if (mode === 'clean') {
  clean();
  process.exit(0);
}

if (mode === 'finalize') {
  finalize();
  process.exit(0);
}

console.error('Usage: node ./scripts/pack-output.cjs <clean|finalize>');
process.exit(1);
