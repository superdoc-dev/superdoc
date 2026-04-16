#!/usr/bin/env node

// Emits dist/superdoc.umd.js as a deprecation-warning shim that loads
// dist/superdoc.global.js. Kept for one minor cycle (removed in 2.0) so
// existing CDN consumers pointing at the old filename keep working.

const fs = require('node:fs');
const path = require('node:path');

const distRoot = path.resolve(__dirname, '..', 'dist');
const iifePath = path.join(distRoot, 'superdoc.global.js');
const umdPath = path.join(distRoot, 'superdoc.umd.js');

if (!fs.existsSync(iifePath)) {
  console.error('[emit-umd-alias] Missing dist/superdoc.global.js — run build:cdn first');
  process.exit(1);
}

const banner =
  '/*! superdoc.umd.js is deprecated and will be removed in 2.0. ' +
  'Use superdoc.global.js instead. See https://github.com/superdoc-dev/superdoc/blob/main/packages/superdoc/AGENTS.md */\n' +
  'typeof console !== "undefined" && console.warn && console.warn(' +
  '"[superdoc] superdoc.umd.js is deprecated; switch to superdoc.global.js. ' +
  'See https://github.com/superdoc-dev/superdoc/blob/main/packages/superdoc/AGENTS.md");\n';

const iife = fs.readFileSync(iifePath, 'utf8');
fs.writeFileSync(umdPath, banner + iife);

const sizeKb = (fs.statSync(umdPath).size / 1024).toFixed(1);
console.log(`[emit-umd-alias] ✓ Wrote deprecated dist/superdoc.umd.js (${sizeKb} KB)`);
