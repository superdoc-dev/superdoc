#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const distRoot = path.resolve(__dirname, '..', 'dist');
const jsExtensions = new Set(['.js', '.cjs', '.mjs']);

// prosemirror-view emits this warning exactly once per bundled module copy.
// If it appears twice in one output file, we have bundled multiple module
// instances and collaborative decoration identity checks can break at runtime.
const PROSEMIRROR_VIEW_FINGERPRINT =
  'ProseMirror expects the CSS white-space property to be set';

/**
 * @param {string} dir
 * @returns {string[]}
 */
function collectBundleFiles(dir) {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectBundleFiles(fullPath));
      continue;
    }

    if (jsExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * @param {string} source
 * @param {string} needle
 * @returns {number}
 */
function countOccurrences(source, needle) {
  if (!needle) return 0;

  let count = 0;
  let offset = 0;

  while (true) {
    const nextIndex = source.indexOf(needle, offset);
    if (nextIndex === -1) break;
    count += 1;
    offset = nextIndex + needle.length;
  }

  return count;
}

if (!fs.existsSync(distRoot)) {
  console.error('[audit-bundle] Missing dist directory');
  process.exit(1);
}

const duplicateModules = [];

for (const filePath of collectBundleFiles(distRoot)) {
  const source = fs.readFileSync(filePath, 'utf8');
  const fingerprintCount = countOccurrences(source, PROSEMIRROR_VIEW_FINGERPRINT);

  if (fingerprintCount > 1) {
    duplicateModules.push({
      filePath,
      fingerprintCount,
    });
  }
}

if (duplicateModules.length > 0) {
  console.error('[audit-bundle] Found duplicate prosemirror-view bundles in emitted output:');
  for (const duplicate of duplicateModules) {
    console.error(
      `  - ${path.relative(distRoot, duplicate.filePath)} (${duplicate.fingerprintCount} copies)`,
    );
  }
  process.exit(1);
}

console.log('[audit-bundle] ✓ Verified single prosemirror-view copy per emitted file');

// Size budgets (raw file size in bytes). Hard = fail the build, soft = warn.
// Keep headroom above current sizes so legitimate growth doesn't break CI.
// Missing files are skipped — some build phases (e.g. build:es) don't emit
// every output. `build:cdn` fails loudly on its own if the CDN bundle is
// broken, so a second gate here would double-count and break partial builds.
const SIZE_BUDGETS = [
  { file: 'superdoc.min.js', soft: 5_242_880, hard: 6_291_456 }, // 5 MB warn / 6 MB fail
  { file: 'superdoc.es.js', soft: 3_145_728, hard: 4_194_304 }, // 3 MB warn / 4 MB fail
  { file: 'style.css', soft: 153_600, hard: 204_800 }, // 150 KB warn / 200 KB fail
];

let sizeFailed = false;
for (const { file, soft, hard } of SIZE_BUDGETS) {
  const full = path.join(distRoot, file);
  if (!fs.existsSync(full)) continue;
  const size = fs.statSync(full).size;
  const kb = (size / 1024).toFixed(0);
  if (size > hard) {
    console.error(`[audit-bundle] ✗ ${file} = ${kb} KB exceeds hard budget ${(hard / 1024).toFixed(0)} KB`);
    sizeFailed = true;
  } else if (size > soft) {
    console.warn(`[audit-bundle] ⚠ ${file} = ${kb} KB exceeds soft budget ${(soft / 1024).toFixed(0)} KB`);
  } else {
    console.log(`[audit-bundle] ✓ ${file} = ${kb} KB within budget`);
  }
}

if (sizeFailed) {
  console.error('[audit-bundle] Size budget exceeded — investigate before merging.');
  process.exit(1);
}
