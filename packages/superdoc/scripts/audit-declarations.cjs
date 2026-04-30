#!/usr/bin/env node
/**
 * Audit the published declaration surface for leaks the package boundary RFC
 * (SD-2829) classifies as forbidden. Walks every `.d.ts` file under `dist/`
 * and reports any of the following:
 *
 *  1. Private workspace specifier in an emitted declaration.
 *     A consumer cannot install `@superdoc/<internal>`, so any such import
 *     either fails to resolve or collapses to `any` via the shim file.
 *
 *  2. Package-manager-internal paths.
 *     `node_modules/.pnpm/...` paths leak the local install layout into a
 *     declaration that consumers cannot resolve.
 *
 *  3. Internal shim file shipped in `dist/`.
 *     `_internal-shims.d.ts` is a postbuild containment workaround, not a
 *     long-term solution. The audit treats its presence as a finding.
 *
 * STATE: this script is currently INFORMATIONAL by default. The published
 * surface has all three classes of leak today; making the audit required
 * would break the build until the curated emit work in SD-2830 lands. Pass
 * `--strict` (or set `SUPERDOC_AUDIT_REQUIRED=1`) to exit non-zero on any
 * finding. Once SD-2830 ships and the leaks are gone, flip the default to
 * strict and remove this notice.
 */

const fs = require('node:fs');
const path = require('node:path');

const distRoot = path.resolve(__dirname, '..', 'dist');

const isStrict =
  process.argv.includes('--strict') || process.env.SUPERDOC_AUDIT_REQUIRED === '1';

if (!fs.existsSync(distRoot)) {
  console.error(`[audit-declarations] dist/ not found at ${distRoot}; run the build first.`);
  process.exit(1);
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function collectDtsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectDtsFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const PRIVATE_SPECIFIER_RE = /['"](@superdoc\/[^'"]+)['"]/g;
const PNPM_PATH_RE = /['"]([^'"]*node_modules\/\.pnpm\/[^'"]+)['"]/g;

const privateSpecifierFindings = new Map(); // file -> Set<specifier>
const pnpmPathFindings = new Map(); // file -> Set<path>
let internalShimsPresent = false;

const internalShimsPath = path.join(distRoot, '_internal-shims.d.ts');
if (fs.existsSync(internalShimsPath)) {
  internalShimsPresent = true;
}

const dtsFiles = collectDtsFiles(distRoot);

for (const file of dtsFiles) {
  const rel = path.relative(distRoot, file);
  // The shim file itself is allowed to declare private modules; that is its
  // entire reason for existing. Counting its contents would double-report.
  if (rel === '_internal-shims.d.ts') continue;

  const content = fs.readFileSync(file, 'utf8');

  for (const match of content.matchAll(PRIVATE_SPECIFIER_RE)) {
    const specifier = match[1];
    if (!privateSpecifierFindings.has(rel)) {
      privateSpecifierFindings.set(rel, new Set());
    }
    privateSpecifierFindings.get(rel).add(specifier);
  }

  for (const match of content.matchAll(PNPM_PATH_RE)) {
    const fullPath = match[1];
    if (!pnpmPathFindings.has(rel)) {
      pnpmPathFindings.set(rel, new Set());
    }
    pnpmPathFindings.get(rel).add(fullPath);
  }
}

const totalPrivateFiles = privateSpecifierFindings.size;
const totalPrivateOccurrences = [...privateSpecifierFindings.values()].reduce(
  (sum, set) => sum + set.size,
  0,
);
const totalPnpmFiles = pnpmPathFindings.size;
const totalPnpmOccurrences = [...pnpmPathFindings.values()].reduce(
  (sum, set) => sum + set.size,
  0,
);

console.log('[audit-declarations] Declaration surface audit');
console.log('='.repeat(72));
console.log(`Scanned: ${dtsFiles.length} .d.ts files under ${path.relative(process.cwd(), distRoot)}/`);
console.log();

const violations = [];

// Rule 1: private workspace specifiers
if (totalPrivateFiles > 0) {
  violations.push('private-specifiers');
  console.log(`Private @superdoc/* specifiers: ${totalPrivateFiles} files / ${totalPrivateOccurrences} occurrences`);
  const distinctSpecifiers = new Set();
  for (const set of privateSpecifierFindings.values()) {
    for (const s of set) distinctSpecifiers.add(s);
  }
  console.log(`  distinct: ${[...distinctSpecifiers].sort().join(', ')}`);
  console.log();
} else {
  console.log('Private @superdoc/* specifiers: none');
}

// Rule 2: pnpm paths
if (totalPnpmFiles > 0) {
  violations.push('pnpm-paths');
  console.log(`Package-manager-internal paths: ${totalPnpmFiles} files / ${totalPnpmOccurrences} occurrences`);
  console.log();
} else {
  console.log('Package-manager-internal paths: none');
}

// Rule 3: internal shims file
if (internalShimsPresent) {
  violations.push('internal-shims');
  const stat = fs.statSync(internalShimsPath);
  const content = fs.readFileSync(internalShimsPath, 'utf8');
  const anyAliases = (content.match(/= any;/g) || []).length;
  console.log(`Internal shims file: present (${stat.size} bytes, ${anyAliases} \`= any\` aliases)`);
} else {
  console.log('Internal shims file: not present');
}

console.log();
console.log('='.repeat(72));

if (violations.length === 0) {
  console.log('No findings. Declaration surface is clean against current rules.');
  process.exit(0);
}

console.log(`Findings: ${violations.join(', ')}`);
console.log();

if (isStrict) {
  console.log('Strict mode is on; exiting non-zero.');
  console.log('See docs/architecture/package-boundaries.md for what each rule means.');
  process.exit(1);
}

console.log('Strict mode is off; exiting zero (informational).');
console.log('Pass --strict (or SUPERDOC_AUDIT_REQUIRED=1) to fail on findings.');
console.log('See docs/architecture/package-boundaries.md for what each rule means.');
process.exit(0);
