#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

// TypeScript emits to dist/superdoc/src/index.d.ts when common is included
const basePath = 'dist/superdoc/src/index.d.ts';
const distIndexPath = path.resolve(__dirname, '..', basePath);

if (!fs.existsSync(distIndexPath)) {
  console.error(`[ensure-types] Missing ${basePath}`);
  process.exit(1);
}

const content = fs.readFileSync(distIndexPath, 'utf8');
const hasSuperDocExport = /export\s+\{[^}]*\bSuperDoc\b[^}]*\}/m.test(content);

if (!hasSuperDocExport) {
  console.error(`[ensure-types] SuperDoc export missing in ${basePath}`);
  process.exit(1);
}

const distRoot = path.resolve(__dirname, '..', 'dist');
const typeTargets = ['types.d.ts', 'types.es.d.ts', 'types.cjs.d.ts'];
const superEditorDist = path.resolve(__dirname, '..', '..', 'super-editor', 'dist');
const superDocSuperEditorDist = path.resolve(distRoot, 'super-editor');
const superEditorTypesPath = path.join(superEditorDist, 'types.d.ts');

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  entries.forEach((entry) => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  });
};

try {
  fs.mkdirSync(distRoot, { recursive: true });

  if (!fs.existsSync(superEditorTypesPath)) {
    console.error(`[ensure-types] Missing super-editor types at ${superEditorTypesPath}`);
    process.exit(1);
  }

  let superEditorTypes = fs.readFileSync(superEditorTypesPath, 'utf8');

  // Rewrite relative paths to point into the super-editor subdirectory
  // e.g. './core/types/...' -> './super-editor/core/types/...'
  //      './extensions/types/...' -> './super-editor/extensions/types/...'
  superEditorTypes = superEditorTypes
    .replace(/from\s+['"]\.\/(core|extensions)\//g, "from './super-editor/$1/")
    .replace(/import\s+['"]\.\/(core|extensions)\//g, "import './super-editor/$1/");

  typeTargets.forEach((target) => {
    const targetPath = path.join(distRoot, target);
    fs.writeFileSync(targetPath, superEditorTypes, 'utf8');
  });

  copyDir(superEditorDist, superDocSuperEditorDist);
} catch (error) {
  console.error(`[ensure-types] Failed to prepare types entrypoints: ${error?.message || error}`);
  process.exit(1);
}

console.log(`[ensure-types] ✓ Verified SuperDoc export in ${basePath}`);
console.log(`[ensure-types] ✓ Copied super-editor dist into dist/super-editor`);
console.log(`[ensure-types] ✓ Copied super-editor types into dist/ (${typeTargets.join(', ')})`);
