#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const distRoot = path.join(packageRoot, 'dist');
const runtimeEntries = ['collaboration-upgrade-engine.es.js', 'collaboration-upgrade-engine.cjs'];
const declarationEntries = [
  'superdoc/src/public/collaboration-upgrade-engine.d.ts',
  'superdoc/src/public/collaboration-upgrade-engine.d.cts',
];
const allowedBareImports = new Set(['@superdoc/docx-engine/collaboration-upgrade-engine', 'yjs']);
const importPatterns = [
  /\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];
const forbiddenRuntimeMarkers = [
  ['Vue runtime', /node_modules\/vue|@vue\/runtime|defineComponent\(/],
  ['React runtime', /react\/jsx-runtime|React\.createElement|createElement\(.*jsx/],
  ['browser worker', /browser-worker-entry|new Worker\(/],
  ['DOM painter', /DomPainter|painter-dom/],
  ['layout engine', /@superdoc\/layout-engine|v2-layout-adapter/],
];

const failures = [];
const fail = (message) => failures.push(message);

function readRequired(relative) {
  const absolute = path.join(distRoot, relative);
  if (!fs.existsSync(absolute)) {
    fail(`missing ${relative}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function collectImports(source) {
  const imports = new Set();
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) imports.add(match[1]);
  }
  return imports;
}

for (const relative of runtimeEntries) {
  const source = readRequired(relative);
  if (!source) continue;

  for (const specifier of collectImports(source)) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      fail(
        `${relative} contains an unexpected split runtime import (${specifier})`,
      );
      continue;
    }
    if (!allowedBareImports.has(specifier)) {
      fail(`${relative} contains unexpected bare import ${JSON.stringify(specifier)}`);
    }
  }

  for (const [label, pattern] of forbiddenRuntimeMarkers) {
    if (pattern.test(source)) fail(`${relative} contains forbidden ${label} marker`);
  }

  const bytes = Buffer.byteLength(source);
  const softLimit = 3 * 1024 * 1024;
  const hardLimit = 4 * 1024 * 1024;
  if (bytes > hardLimit) {
    fail(`${relative} is ${(bytes / 1024 / 1024).toFixed(2)} MiB; hard limit is 4 MiB`);
  } else if (bytes > softLimit) {
    console.warn(
      `[audit-collaboration-upgrade-engine] WARN ${relative} is ${(bytes / 1024 / 1024).toFixed(2)} MiB; soft limit is 3 MiB`,
    );
  }
}

for (const relative of declarationEntries) {
  const source = readRequired(relative);
  if (!source) continue;
  for (const marker of ['@superdoc/', '.pnpm/', 'node_modules/']) {
    if (source.includes(marker)) fail(`${relative} leaks private declaration marker ${JSON.stringify(marker)}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const exported = manifest.exports?.['./collaboration-upgrade-engine'];
if (!exported?.node?.import || !exported?.node?.require || !exported?.types?.import || !exported?.types?.require) {
  fail('package.json collaboration-upgrade-engine export must provide Node ESM/CJS runtime and ESM/CJS types');
}
if (exported?.import || exported?.require || exported?.default || exported?.browser) {
  fail('package.json collaboration-upgrade-engine runtime must stay behind the Node condition');
}

if (failures.length > 0) {
  console.error('[audit-collaboration-upgrade-engine] Node engine boundary failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('[audit-collaboration-upgrade-engine] ✓ Node-only bridge keeps the engine external and stays within budget');
