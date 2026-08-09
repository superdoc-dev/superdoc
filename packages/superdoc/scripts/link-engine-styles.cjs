#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const distRoot = path.join(packageRoot, 'dist');
const styleTargets = [
  { file: 'style.css', importLine: '@import "@superdoc/docx-engine/style.css";' },
  { file: 'style.layered.css', importLine: '@import "@superdoc/docx-engine/style.css" layer(superdoc);' },
];

for (const target of styleTargets) {
  const filePath = path.join(distRoot, target.file);
  if (!fs.existsSync(filePath)) continue;
  const current = fs.readFileSync(filePath, 'utf8');
  if (current.includes('@superdoc/docx-engine/style.css')) continue;
  fs.writeFileSync(filePath, `${target.importLine}\n${current}`);
}

const mainStyle = path.join(distRoot, 'style.css');
if (!fs.existsSync(mainStyle) || !fs.readFileSync(mainStyle, 'utf8').includes('@superdoc/docx-engine/style.css')) {
  throw new Error('dist/style.css must reference @superdoc/docx-engine/style.css');
}

console.log('[link-engine-styles] SuperDoc styles reference the separate DOCX Engine stylesheet');
