#!/usr/bin/env node
/**
 * Audit the published declaration surface for leaks the package boundary RFC
 * (SD-2829) classifies as forbidden. Walks every `.d.ts` file under `dist/`
 * and reports:
 *
 *  Rule 1 (FAIL in strict mode): private workspace specifier in an emitted
 *    declaration that is NOT covered by `_internal-shims.d.ts` and NOT a
 *    legacy public surface. The shim file is the registry of "known
 *    unresolved" private modules whose types the RFC tolerates collapsing
 *    to `any`; legacy public surfaces (currently `@superdoc/super-editor`)
 *    resolve through the published dist tree. Anything outside that
 *    allowlist is a leak the RFC forbids: a consumer's strict-mode build
 *    fails to resolve the import.
 *
 *  Rule 2 (FAIL in strict mode): package-manager-internal paths.
 *    `node_modules/.pnpm/...` paths leak the local install layout into a
 *    declaration that consumers cannot resolve.
 *
 *  Rule 3 (FAIL in strict mode): a relocated package reappears in
 *    `_internal-shims.d.ts`. The RFC's relocation pattern (SD-2842) routes
 *    Document API, contracts, layout-bridge, and painter-dom types through
 *    `superdoc`'s own dist tree; if any of those packages collapse back into
 *    an `any` shim, customers see the regression. This rule overlaps with
 *    the build-time check in `ensure-types.cjs`; keeping both lets the audit
 *    run as a standalone gate against any tarball, not just during a fresh
 *    build.
 *
 *  Informational: the set of modules still declared in `_internal-shims.d.ts`.
 *    The shim file may legitimately exist for legacy or internal-only
 *    declarations; the RFC's audit-gate rule is "no public type may resolve
 *    through it", not "the file must not exist". This list is reported so
 *    drift is visible and the surface can be tightened over time, but its
 *    contents do not fail the audit.
 *
 * Default mode is strict: findings exit non-zero so a regression cannot
 * ship silently. Pass `--informational` (or set
 * `SUPERDOC_AUDIT_INFORMATIONAL=1`) for an explicit opt-out when iterating
 * locally on a known leak before the fix is ready.
 */

const fs = require('node:fs');
const path = require('node:path');

const distRoot = path.resolve(__dirname, '..', 'dist');

// SD-2859: strict is the default. The audit fails the build on any
// FAIL-level finding so a regression in the published declaration
// surface cannot ship silently. Pass `--informational` (or set
// `SUPERDOC_AUDIT_INFORMATIONAL=1`) for an explicit opt-out — useful
// when iterating locally on a known leak before the fix is ready.
const isInformational =
  process.argv.includes('--informational') || process.env.SUPERDOC_AUDIT_INFORMATIONAL === '1';
const isStrict = !isInformational;

if (!fs.existsSync(distRoot)) {
  console.error(`[audit-declarations] dist/ not found at ${distRoot}; run the build first.`);
  process.exit(1);
}

// Packages whose public type dependencies are relocated into `superdoc`'s
// published declaration tree or explicitly guarded from falling back to an
// ambient shim. They must NEVER appear as a `declare module` block in
// `_internal-shims.d.ts` — if they do, their types collapse to `any` for
// consumers and we have a regression. Mirror of SD-2842's
// `RELOCATION_GUARD_PACKAGES` in `ensure-types.cjs`; keep the two lists in sync.
const RELOCATION_GUARD_PACKAGES = [
  '@superdoc/document-api',
  '@superdoc/contracts',
  '@superdoc/dom-contract',
  '@superdoc/layout-bridge',
  '@superdoc/layout-engine',
  '@superdoc/painter-dom',
  '@superdoc/pm-adapter',
  '@superdoc/style-engine',
  '@superdoc/common/list-marker-utils',
];

// Specifiers that may appear as bare imports in published d.ts files even
// though they are private workspace packages. Each entry has a documented
// reason; anything outside this allowlist (and outside the shim file) is a
// real leak per Rule 1.
const RULE1_ALLOWLIST = {
  // Legacy public surface per the RFC. Resolves through `superdoc`'s
  // published dist tree at runtime via the existing rewrite/include rules.
  // Deep subpaths beyond the curated public surface are NOT allowlisted.
  '@superdoc/super-editor': 'legacy public surface (RFC Decision 1)',
};

function isRule1Allowed(specifier, shimmedSet) {
  if (RULE1_ALLOWLIST[specifier]) return true;
  if (shimmedSet.has(specifier)) return true;
  // Subpaths of allowlisted top-level packages are NOT auto-allowed.
  // Subpaths of shimmed modules also need their own shim entry, so do not
  // implicitly allow them here.
  return false;
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
const SHIM_DECLARED_MODULE_RE = /declare module ['"]([^'"]+)['"]/g;

const privateSpecifierFindings = new Map(); // file -> Set<specifier>
const pnpmPathFindings = new Map(); // file -> Set<path>
const shimmedModules = new Set(); // module specifiers declared in the shim file

const internalShimsPath = path.join(distRoot, '_internal-shims.d.ts');
const internalShimsPresent = fs.existsSync(internalShimsPath);
if (internalShimsPresent) {
  const shimContent = fs.readFileSync(internalShimsPath, 'utf8');
  for (const match of shimContent.matchAll(SHIM_DECLARED_MODULE_RE)) {
    shimmedModules.add(match[1]);
  }
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
    if (isRule1Allowed(specifier, shimmedModules)) continue;
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

const relocatedInShim = RELOCATION_GUARD_PACKAGES.filter((pkg) =>
  [...shimmedModules].some((mod) => mod === pkg || mod.startsWith(pkg + '/')),
);

console.log('[audit-declarations] Declaration surface audit');
console.log('='.repeat(72));
console.log(`Scanned: ${dtsFiles.length} .d.ts files under ${path.relative(process.cwd(), distRoot)}/`);
console.log();

const violations = [];

// Rule 1: private workspace specifiers
if (totalPrivateFiles > 0) {
  violations.push('private-specifiers');
  console.log(`FAIL  Private @superdoc/* specifiers: ${totalPrivateFiles} files / ${totalPrivateOccurrences} occurrences`);
  const distinctSpecifiers = new Set();
  for (const set of privateSpecifierFindings.values()) {
    for (const s of set) distinctSpecifiers.add(s);
  }
  console.log(`      distinct: ${[...distinctSpecifiers].sort().join(', ')}`);
} else {
  console.log('OK    Private @superdoc/* specifiers: none');
}

// Rule 2: pnpm paths
if (totalPnpmFiles > 0) {
  violations.push('pnpm-paths');
  console.log(`FAIL  Package-manager-internal paths: ${totalPnpmFiles} files / ${totalPnpmOccurrences} occurrences`);
} else {
  console.log('OK    Package-manager-internal paths: none');
}

// Rule 3: relocated packages must not reappear in the shim file
if (relocatedInShim.length > 0) {
  violations.push('relocated-in-shim');
  console.log(`FAIL  Relocated packages reappeared in _internal-shims.d.ts: ${relocatedInShim.join(', ')}`);
  console.log('      These packages have dedicated relocation rules in ensure-types.cjs and must not fall back to ambient any shims.');
} else {
  console.log(`OK    Relocated packages do not appear in shim file (${RELOCATION_GUARD_PACKAGES.length} guarded)`);
}

// Informational: remaining shimmed modules
if (internalShimsPresent && shimmedModules.size > 0) {
  console.log();
  console.log(`INFO  _internal-shims.d.ts declares ${shimmedModules.size} module${shimmedModules.size === 1 ? '' : 's'}:`);
  for (const mod of [...shimmedModules].sort()) {
    console.log(`        ${mod}`);
  }
  console.log('      These types are not on the public surface today. Tightening the surface (relocate, publish, or remove) shrinks this list.');
}

console.log();
console.log('='.repeat(72));

if (violations.length === 0) {
  console.log('No FAIL-level findings. Declaration surface is clean against current rules.');
  process.exit(0);
}

console.log(`FAIL findings: ${violations.join(', ')}`);
console.log();

if (isStrict) {
  console.log('Exiting non-zero (strict mode is the default since SD-2859).');
  console.log('See docs/architecture/package-boundaries.md for what each rule means.');
  console.log('Pass --informational (or SUPERDOC_AUDIT_INFORMATIONAL=1) to opt out for local iteration on a known leak.');
  process.exit(1);
}

console.log('Exiting zero (informational mode).');
console.log('See docs/architecture/package-boundaries.md for what each rule means.');
process.exit(0);
