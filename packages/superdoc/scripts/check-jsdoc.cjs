#!/usr/bin/env node
/**
 * SD-2833: per-file checkJs gate for the public-contract surface.
 *
 * Why this exists in this shape (and not as a plain `tsc -p tsconfig.checkjs.json`):
 *
 * The codebase uses `customConditions: ["source"]`, which makes TypeScript
 * resolve `import { Editor } from '@superdoc/super-editor'` to the source
 * `.js`/`.ts` files of the workspace package. With `// @ts-check` enabled on
 * any file in this package, TS follows those imports and type-checks the
 * super-editor source too — about 6500 errors. Those errors are real (they
 * are the broader SD-2863 work) but they are not what this PR is trying to
 * gate. The gate here is "files in CHECKED_FILES must stay clean."
 *
 * The script:
 *
 *   1. Runs `tsc --noEmit -p packages/superdoc/tsconfig.json`. Because each
 *      file in CHECKED_FILES has `// @ts-check`, TS reports errors on those
 *      files even though the project-wide `checkJs` is `false`.
 *   2. Filters the tsc output to errors whose path matches an entry in
 *      CHECKED_FILES.
 *   3. Exits non-zero if any matched the filter; exits zero if not.
 *
 * Adding a new file to the gate:
 *
 *   1. Add `// @ts-check` as the first line of the file.
 *   2. Add the file's repo-relative path to CHECKED_FILES below.
 *   3. Run `node packages/superdoc/scripts/check-jsdoc.cjs` and fix what
 *      surfaces.
 *
 * The intent is for CHECKED_FILES to grow over time as the team ratchets
 * checkJs across the public-contract surface. SD-2863 lands the pattern;
 * follow-up tickets land the additional files.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ts = require('typescript');

const CHECKED_FILES = [
  'packages/superdoc/src/helpers/schema-introspection.js',
  'packages/superdoc/src/composables/use-find-replace.js',
  'packages/superdoc/src/composables/use-password-prompt.js',
  'packages/super-editor/src/editors/v1/extensions/track-changes/trackChangesHelpers/addMarkStep.js',
  'packages/super-editor/src/editors/v1/extensions/track-changes/trackChangesHelpers/markDeletion.js',
  'packages/super-editor/src/editors/v1/extensions/track-changes/trackChangesHelpers/markInsertion.js',
];

const PUBLIC_ENTRY_FILES = [
  'packages/superdoc/src/index.js',
  'packages/superdoc/src/super-editor.js',
  'packages/superdoc/src/ui.js',
];

const REACHABILITY_EXEMPT_CHECKED_FILES = new Set([
  // These files predate SD-2833. They are kept under the gate because their
  // typedefs feed exported SuperDoc configuration types, but they are reached
  // through implementation imports rather than direct public barrel exports.
  'packages/superdoc/src/composables/use-find-replace.js',
  'packages/superdoc/src/composables/use-password-prompt.js',
]);

const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '..', '..');

const tscBin = path.join(repoRoot, 'node_modules', '.bin', 'tsc');
const tsconfigPath = path.join(packageDir, 'tsconfig.json');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue'];

const PACKAGE_EXPORT_SOURCES = {
  '@superdoc/super-editor': 'packages/super-editor/src/index.ts',
  '@superdoc/super-editor/blank-docx': 'packages/super-editor/src/editors/v1/core/blank-docx.ts',
  '@superdoc/super-editor/document-api-adapters': 'packages/super-editor/src/editors/v1/document-api-adapters/index.ts',
  '@superdoc/super-editor/markdown': 'packages/super-editor/src/editors/v1/core/helpers/markdown/index.ts',
  '@superdoc/super-editor/parts-runtime': 'packages/super-editor/src/editors/v1/core/parts/init-parts-runtime.ts',
  '@superdoc/super-editor/ui': 'packages/super-editor/src/ui/index.ts',
};

const SOURCE_ALIASES = [
  ['@core/', 'packages/super-editor/src/editors/v1/core/'],
  ['@extensions/', 'packages/super-editor/src/editors/v1/extensions/'],
  ['@features/', 'packages/super-editor/src/editors/v1/features/'],
  ['@components/', 'packages/super-editor/src/editors/v1/components/'],
  ['@helpers/', 'packages/super-editor/src/editors/v1/core/helpers/'],
  ['@converter/', 'packages/super-editor/src/editors/v1/core/super-converter/'],
  ['@tests/', 'packages/super-editor/src/editors/v1/tests/'],
  ['@translator', 'packages/super-editor/src/editors/v1/core/super-converter/v3/node-translator/'],
  ['@utils/', 'packages/super-editor/src/editors/v1/utils/'],
  ['@shared/', 'shared/'],
];

const toRepoRelative = (abs) => path.relative(repoRoot, abs).split(path.sep).join('/');

const tryResolveSourcePath = (basePath) => {
  if (path.extname(basePath)) {
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;
    if (basePath.endsWith('.js')) {
      for (const extension of ['.ts', '.tsx']) {
        const sourcePath = `${basePath.slice(0, -3)}${extension}`;
        if (fs.existsSync(sourcePath)) return sourcePath;
      }
    }
    return null;
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const sourcePath = `${basePath}${extension}`;
    if (fs.existsSync(sourcePath)) return sourcePath;
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const sourcePath = path.join(basePath, `index${extension}`);
    if (fs.existsSync(sourcePath)) return sourcePath;
  }

  return null;
};

const resolveSourceSpecifier = (specifier, containingFile) => {
  if (Object.prototype.hasOwnProperty.call(PACKAGE_EXPORT_SOURCES, specifier)) {
    return path.join(repoRoot, PACKAGE_EXPORT_SOURCES[specifier]);
  }

  if (specifier.startsWith('@superdoc/super-editor/')) {
    return tryResolveSourcePath(
      path.join(repoRoot, 'packages/super-editor/src', specifier.slice('@superdoc/super-editor/'.length)),
    );
  }

  if (specifier.startsWith('.')) {
    return tryResolveSourcePath(path.resolve(path.dirname(containingFile), specifier));
  }

  for (const [alias, target] of SOURCE_ALIASES) {
    if (specifier === alias.replace(/\/$/, '')) return tryResolveSourcePath(path.join(repoRoot, target));
    if (specifier.startsWith(alias)) {
      return tryResolveSourcePath(path.join(repoRoot, target, specifier.slice(alias.length)));
    }
  }

  return null;
};

const createSourceFile = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const scriptKind = filePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : filePath.endsWith('.ts')
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
};

const findExportReachableTargets = (filePath) => {
  if (!/\.[jt]sx?$/.test(filePath)) return [];

  const sourceFile = createSourceFile(filePath);
  const importedBindings = new Map();
  const reachableTargets = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const target = resolveSourceSpecifier(statement.moduleSpecifier.text, filePath);
    const clause = statement.importClause;
    if (!target || !clause) continue;

    if (clause.name) importedBindings.set(clause.name.text, target);

    const namedBindings = clause.namedBindings;
    if (!namedBindings) continue;
    if (ts.isNamespaceImport(namedBindings)) {
      importedBindings.set(namedBindings.name.text, target);
      continue;
    }
    if (ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        importedBindings.set(element.name.text, target);
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;

    if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const target = resolveSourceSpecifier(statement.moduleSpecifier.text, filePath);
      if (target) reachableTargets.push(target);
      continue;
    }

    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      const localName = (element.propertyName || element.name).text;
      const target = importedBindings.get(localName);
      if (target) reachableTargets.push(target);
    }
  }

  return [...new Set(reachableTargets)];
};

const collectPublicExportSurface = () => {
  const seen = new Set();
  const stack = PUBLIC_ENTRY_FILES.map((file) => path.join(repoRoot, file));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;

    seen.add(current);
    for (const target of findExportReachableTargets(current)) {
      if (!seen.has(target)) stack.push(target);
    }
  }

  return seen;
};

const hasJSDocTypeSurface = (abs) => {
  if (!abs.endsWith('.js')) return false;
  const source = fs.readFileSync(abs, 'utf8');
  return /\/\*\*[\s\S]*?@(typedef|param|returns|template|callback|property|type)\b/.test(source);
};

const publicExportSurface = collectPublicExportSurface();
const publicExportSurfaceRelative = new Set([...publicExportSurface].map(toRepoRelative));
const publicJSDocFiles = [...publicExportSurface].filter(hasJSDocTypeSurface).sort();
const checkedFileSet = new Set(CHECKED_FILES);
const nonPublicCheckedFiles = CHECKED_FILES.filter(
  (rel) => !publicExportSurfaceRelative.has(rel) && !REACHABILITY_EXEMPT_CHECKED_FILES.has(rel),
);

if (nonPublicCheckedFiles.length > 0) {
  console.error('[check-jsdoc] gated files are not reachable from the public superdoc export surface:');
  for (const f of nonPublicCheckedFiles) console.error(`  - ${f}`);
  console.error('Gated JSDoc files must be exported from superdoc, superdoc/super-editor, or superdoc/ui.');
  process.exit(1);
}

// Pre-flight: every file in CHECKED_FILES must opt into `// @ts-check`.
// The project's tsconfig sets `checkJs: false`, so a JS file without the
// directive is not type-checked at all. Without this guard, removing or
// forgetting the directive on a listed file makes the gate silently stop
// covering it — the script keeps reporting OK even though the file has
// drifted.
const missingDirective = [];
const missingFiles = [];
for (const rel of CHECKED_FILES) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    missingFiles.push(rel);
    continue;
  }
  // The directive only takes effect when it precedes any non-comment
  // statement, so it lives near the top. 4 KiB is plenty of margin for
  // a leading license/doc block.
  const head = fs.readFileSync(abs, 'utf8').slice(0, 4096);
  if (!/^\s*\/\/\s*@ts-check\b/m.test(head)) {
    missingDirective.push(rel);
  }
}

if (missingFiles.length > 0) {
  console.error('[check-jsdoc] gated files do not exist:');
  for (const f of missingFiles) console.error(`  - ${f}`);
  process.exit(1);
}
if (missingDirective.length > 0) {
  console.error('[check-jsdoc] gated files are missing the `// @ts-check` directive:');
  for (const f of missingDirective) console.error(`  - ${f}`);
  console.error('Each gated file must opt into checkJs explicitly.');
  console.error('Add `// @ts-check` as the first non-blank line, then re-run.');
  process.exit(1);
}

const result = spawnSync(tscBin, ['--noEmit', '-p', tsconfigPath], {
  encoding: 'utf8',
  cwd: repoRoot,
});

// Fail fast if tsc itself could not be spawned (ENOENT on the binary,
// EACCES, etc.). Without this guard, a missing `tsc` leaves
// `result.error` set, empty stdout/stderr, and the rest of the script
// would happily report "OK" because it found zero parseable errors.
if (result.error) {
  console.error(`[check-jsdoc] failed to invoke tsc at ${tscBin}: ${result.error.message}`);
  process.exit(1);
}

// Killed by a signal (SIGKILL/OOM/SIGTERM) mid-run. spawnSync sets
// `result.status` to null in that case and may leave partial output
// containing parseable diagnostics, which would otherwise sneak past
// the structural-failure check below.
if (result.signal !== null) {
  console.error(`[check-jsdoc] tsc was killed by signal: ${result.signal}`);
  process.exit(1);
}

const output = `${result.stdout || ''}${result.stderr || ''}`;

// Match each `path/to/file(line,col): error TSxxxx: ...` row. tsc emits
// paths relative to the cwd we ran from (repoRoot).
const allErrors = output
  .split('\n')
  .filter((line) => /\.[jt]sx?\(\d+,\d+\):\s+error\s+TS\d+:/.test(line));

// Catch the structural-failure mode: tsc exited non-zero but produced no
// parseable diagnostics. That means the failure is something like a
// missing tsconfig, an internal compiler crash, or a config error,
// rather than a normal type-check fail; the gate cannot reason about it.
if (result.status !== 0 && allErrors.length === 0) {
  console.error('[check-jsdoc] tsc exited with a non-zero status but produced no parseable diagnostics.');
  console.error(`Status: ${result.status}`);
  console.error(`Output:\n${output || '(empty)'}`);
  process.exit(1);
}

const checkedAbsolute = CHECKED_FILES.map((rel) => path.join(repoRoot, rel));

const isCheckedError = (line) => {
  const match = line.match(/^([^(]+)\(\d+,\d+\):/);
  if (!match) return false;
  const filePath = path.resolve(repoRoot, match[1]);
  return checkedAbsolute.includes(filePath);
};

const checkedErrors = allErrors.filter(isCheckedError);

console.log('[check-jsdoc] SD-2833 public-contract checkJs gate');
console.log('='.repeat(72));
console.log(`Public JSDoc files discovered: ${publicJSDocFiles.length}`);
console.log(`Files under gate: ${CHECKED_FILES.length}`);
for (const f of CHECKED_FILES) {
  console.log(`  - ${f}`);
}
const ungatedPublicJSDocCount = publicJSDocFiles.filter((abs) => !checkedFileSet.has(toRepoRelative(abs))).length;
console.log(`Ungated public JSDoc files: ${ungatedPublicJSDocCount}`);
console.log();

if (checkedErrors.length === 0) {
  console.log(`OK    ${CHECKED_FILES.length} gated file${CHECKED_FILES.length === 1 ? '' : 's'} clean.`);
  console.log(`      (${allErrors.length} non-gated error${allErrors.length === 1 ? '' : 's'} in the wider tsc run, ignored — see SD-2863/SD-2833 follow-ups.)`);
  process.exit(0);
}

console.log(`FAIL  ${checkedErrors.length} error${checkedErrors.length === 1 ? '' : 's'} in gated files:`);
for (const line of checkedErrors) {
  console.log(`        ${line}`);
}
console.log();
console.log('Each error means a public-contract JSDoc has drifted from the implementation.');
console.log('Fix the type or the code so they match. Adding `// @ts-ignore` is not the answer.');
process.exit(1);
