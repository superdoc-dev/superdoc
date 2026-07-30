import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import test from 'node:test';

const docsRoot = new URL('../', import.meta.url);
const scannedExtensions = new Set(['.jsx', '.mdx', '.txt']);
const installCommand = /(?:npm (?:install|i)|pnpm add|bun add|yarn add)\s+([^\n]+)/gu;
const staleNextTag = /(?:superdoc|@superdoc-dev\/react)@next\b/u;
const wrongV1AssetPath = /superdoc@1\/dist-cdn\b/u;
const browserPackageUrl =
  /(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/(?:superdoc|@superdoc-dev\/react)(?:@([^/]+))?\//gu;
const browserPackages = ['superdoc', '@superdoc-dev/react'];

function hasUnsafeInstall(source) {
  for (const match of source.matchAll(installCommand)) {
    const packages = match[1].split(/\s+/u);
    const installsReact = packages.some((entry) => entry.startsWith('@superdoc-dev/react'));

    for (const packageName of browserPackages) {
      const packageEntry = packages.find((entry) => entry === packageName || entry.startsWith(`${packageName}@`));
      if (packageEntry && packageEntry !== `${packageName}@1`) return true;
    }

    if (installsReact && !packages.includes('superdoc@1')) return true;
  }

  return false;
}

function hasUnsafeBrowserUrl(source) {
  for (const match of source.matchAll(browserPackageUrl)) {
    if (match[1] !== '1') return true;
  }

  return false;
}

test('the guard rejects unpinned installs from supported package managers', () => {
  const unsafeExamples = [
    'npm install superdoc',
    'npm i superdoc',
    'pnpm add superdoc',
    'bun add superdoc',
    'yarn add superdoc',
    'npm install @superdoc-dev/react@1',
    'npm install superdoc@1 @superdoc-dev/react',
  ];

  for (const example of unsafeExamples) assert.equal(hasUnsafeInstall(example), true, example);

  assert.equal(hasUnsafeInstall('pnpm add superdoc@1 @superdoc-dev/react@1'), false);
});

test('the guard rejects browser URLs outside the v1 major', () => {
  assert.equal(hasUnsafeBrowserUrl('https://cdn.jsdelivr.net/npm/superdoc/dist/style.css'), true);
  assert.equal(hasUnsafeBrowserUrl('https://unpkg.com/superdoc@latest/dist/style.css'), true);
  assert.equal(hasUnsafeBrowserUrl('https://cdn.jsdelivr.net/npm/@superdoc-dev/react@latest/dist/style.css'), true);
  assert.equal(hasUnsafeBrowserUrl('https://cdn.jsdelivr.net/npm/superdoc@1/dist/style.css'), false);
  assert.equal(hasUnsafeBrowserUrl('https://unpkg.com/@superdoc-dev/react@1/dist/style.css'), false);
});

async function collectFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;

    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) files.push(...(await collectFiles(child)));
    else if (scannedExtensions.has(extname(entry.name))) files.push(child);
  }

  return files;
}

test('the archived v1 docs pin browser packages to the v1 major', async () => {
  const staleFiles = [];

  for (const file of await collectFiles(docsRoot)) {
    const source = await readFile(file, 'utf8');
    if (
      hasUnsafeInstall(source) ||
      hasUnsafeBrowserUrl(source) ||
      staleNextTag.test(source) ||
      wrongV1AssetPath.test(source)
    ) {
      staleFiles.push(file.pathname);
    }
  }

  assert.deepEqual(staleFiles, []);
});
