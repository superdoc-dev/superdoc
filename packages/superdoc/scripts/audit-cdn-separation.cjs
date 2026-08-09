#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const distRoot = path.join(packageRoot, 'dist-cdn');
const v2Root = path.resolve(packageRoot, '../../../v2');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const engineDependency = packageJson.dependencies?.['@superdoc/docx-engine'];
const workspaceVersion =
  typeof engineDependency === 'string'
    ? engineDependency.match(/^workspace:(0\.\d+\.\d+(?:-next\.\d+)?)$/)?.[1]
    : null;
const exportedVersion =
  !fs.existsSync(v2Root) && typeof engineDependency === 'string'
    ? engineDependency.match(/^(0\.\d+\.\d+(?:-next\.\d+)?)$/)?.[1]
    : null;
const engineVersion = workspaceVersion ?? exportedVersion;
const failures = [];

if (!engineVersion) {
  failures.push(
    'package.json must pin the DOCX Engine dependency as workspace:0.x in Orbit or exact 0.x in an exported checkout',
  );
}

for (const file of ['superdoc.min.js', 'superdoc.min.css']) {
  if (!fs.existsSync(path.join(distRoot, file))) failures.push(`missing dist-cdn/${file}`);
}

if (fs.existsSync(distRoot)) {
  for (const file of walkFiles(distRoot)) {
    const relative = path.relative(distRoot, file).split(path.sep).join('/');
    if (/^(?:browser|collaboration)-worker-entry-/.test(path.basename(file))) {
      failures.push(`dist-cdn/${relative} is an engine worker asset`);
    }
    if (['DOCX-ENGINE-LICENSE.md', 'NOTICE.md', 'THIRD_PARTY_NOTICES'].includes(path.basename(file))) {
      failures.push(`dist-cdn/${relative} belongs to the engine package`);
    }
  }
}

const scriptPath = path.join(distRoot, 'superdoc.min.js');
if (fs.existsSync(scriptPath)) {
  const script = fs.readFileSync(scriptPath, 'utf8');
  for (const required of [
    '@superdoc/docx-engine@',
    engineVersion,
    'dist-cdn/docx-engine.es.js',
    'dist-cdn/style.css',
    'SUPERDOC_ENGINE_CDN_BASE_URL',
  ]) {
    if (!script.includes(required)) failures.push(`dist-cdn/superdoc.min.js is missing ${required}`);
  }
  for (const [label, forbidden] of [
    ['version banner', /DOCX Engine v\d+\.\d+\.\d+/u],
    ['license title', /DOCX Engine \S+ License Agreement/u],
  ]) {
    if (forbidden.test(script)) failures.push(`dist-cdn/superdoc.min.js contains engine ${label}`);
  }
}

const stylePath = path.join(distRoot, 'superdoc.min.css');
if (fs.existsSync(stylePath) && fs.readFileSync(stylePath, 'utf8').includes('v2-document-loading-overlay')) {
  failures.push('dist-cdn/superdoc.min.css contains inlined engine styles');
}

if (failures.length > 0) {
  console.error('[audit-cdn-separation] CDN separation failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('[audit-cdn-separation] SuperDoc CDN loads the exact separate DOCX Engine package');

function* walkFiles(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) yield* walkFiles(absolute);
    else if (entry.isFile()) yield absolute;
  }
}
