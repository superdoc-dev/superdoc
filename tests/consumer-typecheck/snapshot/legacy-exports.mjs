/**
 * SD-3176 family: no-growth gate for legacy `superdoc/*` subpaths.
 *
 * Snapshots the resolved named exports visible through each legacy subpath
 * against the packed-and-installed tarball:
 *   - superdoc/super-editor          (the dangerous one; `export *` from @superdoc/super-editor)
 *   - superdoc/converter
 *   - superdoc/docx-zipper
 *   - superdoc/file-zipper
 *   - superdoc/headless-toolbar      (SD-3179 reclassified from public to legacy)
 *   - superdoc/headless-toolbar/react
 *   - superdoc/headless-toolbar/vue
 *
 * Source parsing is insufficient because `superdoc/src/super-editor.js` is
 * `export * from '@superdoc/super-editor'`. The contract that ships is what
 * a consumer sees through the published declarations. The TypeScript
 * compiler resolves the re-export chain for us.
 *
 * Requires the fixture to be packed-and-installed first. CI runs this
 * after `typecheck-matrix.mjs`, which already packs and installs the
 * tarball.
 *
 * Extracted from the standalone `snapshot-superdoc-legacy-exports.mjs`
 * script during SD-3213b snapshot-script consolidation. The CLI entry
 * point is now `tests/consumer-typecheck/snapshot.mjs`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONSUMER_TYPECHECK = resolve(HERE, '..');
const SNAPSHOT_DIR = resolve(CONSUMER_TYPECHECK, 'snapshots');
const FIXTURE_SUPERDOC = resolve(CONSUMER_TYPECHECK, 'node_modules', 'superdoc');

export const FAMILY = 'legacy';
export const DESCRIPTION = 'superdoc/* legacy subpath resolved exports (SD-3176)';

const SUBPATHS = [
  './super-editor',
  './converter',
  './docx-zipper',
  './file-zipper',
  // SD-3179 reclassified the headless-toolbar subpaths from public to
  // legacy compatibility surface. See package-boundaries.md Decision 4.
  './headless-toolbar',
  './headless-toolbar/react',
  './headless-toolbar/vue',
];

function resolveTypesEntries(exportsValue) {
  // Returns { import: string|null, require: string|null }. Either can be set.
  // Snapshot is keyed on the `import` branch; `require` is a parity check.
  if (typeof exportsValue === 'string') return { import: exportsValue, require: null };
  if (exportsValue && typeof exportsValue === 'object') {
    if (typeof exportsValue.types === 'string') {
      return { import: exportsValue.types, require: null };
    }
    if (exportsValue.types && typeof exportsValue.types === 'object') {
      return {
        import: exportsValue.types.import ?? exportsValue.types.default ?? null,
        require: exportsValue.types.require ?? null,
      };
    }
  }
  return { import: null, require: null };
}

function snapshotName(subpath) {
  return 'superdoc-' + subpath.replace(/^\.\//, '').replace(/\//g, '-') + '.txt';
}

function loadTypescript() {
  const req = createRequire(join(FIXTURE_SUPERDOC, 'package.json'));
  try {
    return req('typescript');
  } catch {
    const fixtureReq = createRequire(join(CONSUMER_TYPECHECK, 'package.json'));
    return fixtureReq('typescript');
  }
}

function formatDiagnostic(ts, diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start == null) return message;
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${message}`;
}

function listExportedNames(ts, subpath, entryFile) {
  const program = ts.createProgram({
    rootNames: [entryFile],
    options: {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      noEmit: true,
      skipLibCheck: false,
      allowJs: false,
      declaration: false,
    },
  });
  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
    ...program.getDeclarationDiagnostics(),
  ];
  if (diagnostics.length > 0) {
    const details = diagnostics.slice(0, 10).map((diagnostic) => `  - ${formatDiagnostic(ts, diagnostic)}`).join('\n');
    const suffix = diagnostics.length > 10 ? `\n  ... ${diagnostics.length - 10} more diagnostics` : '';
    throw new Error(`${subpath} declaration has TypeScript diagnostics:\n${details}${suffix}`);
  }
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  if (!source) throw new Error('Cannot load source: ' + entryFile);
  const symbol = checker.getSymbolAtLocation(source) ?? source.symbol;
  if (!symbol) return [];
  const exports = checker.getExportsOfModule(symbol);
  return [...new Set(exports.map((e) => e.getName()))].sort();
}

/**
 * @param {{ mode: 'check' | 'write' }} opts
 * @returns {{ code: number }}
 */
export function run({ mode }) {
  if (!existsSync(FIXTURE_SUPERDOC)) {
    console.error('[SD-3176] superdoc is not installed in the fixture.');
    console.error('Run `node tests/consumer-typecheck/typecheck-matrix.mjs` first (it packs and installs the tarball),');
    console.error('or `npm install ../../packages/superdoc/superdoc.tgz --no-save` from tests/consumer-typecheck.');
    return { code: 1 };
  }

  const ts = loadTypescript();
  const superdocPkg = JSON.parse(readFileSync(join(FIXTURE_SUPERDOC, 'package.json'), 'utf8'));
  let failed = false;

  for (const subpath of SUBPATHS) {
    const entries = resolveTypesEntries(superdocPkg.exports?.[subpath]);
    if (!entries.import) {
      console.error(`[SD-3176] No ESM types entry for ${subpath} in installed superdoc.`);
      failed = true;
      continue;
    }
    const importFile = resolve(FIXTURE_SUPERDOC, entries.import);
    if (!existsSync(importFile)) {
      console.error(`[SD-3176] Types file missing for ${subpath}: ${importFile}`);
      failed = true;
      continue;
    }

    let names;
    try {
      names = listExportedNames(ts, subpath, importFile);
    } catch (err) {
      console.error(`[SD-3176] Failed to enumerate ${subpath}: ${err.message}`);
      failed = true;
      continue;
    }

    if (entries.require) {
      const requireFile = resolve(FIXTURE_SUPERDOC, entries.require);
      if (!existsSync(requireFile)) {
        console.error(`[SD-3176] CJS types file missing for ${subpath}: ${requireFile}`);
        failed = true;
        continue;
      }
      let cjsNames;
      try {
        cjsNames = listExportedNames(ts, subpath, requireFile);
      } catch (err) {
        console.error(`[SD-3176] Failed to enumerate CJS for ${subpath}: ${err.message}`);
        failed = true;
        continue;
      }
      const importSet = new Set(names);
      const requireSet = new Set(cjsNames);
      const onlyImport = [...importSet].filter((n) => !requireSet.has(n));
      const onlyRequire = [...requireSet].filter((n) => !importSet.has(n));
      if (onlyImport.length || onlyRequire.length) {
        console.error(`[SD-3176] ${subpath}: ESM/CJS declaration export sets differ.`);
        if (onlyImport.length) console.error('  import-only:  ' + onlyImport.join(', '));
        if (onlyRequire.length) console.error('  require-only: ' + onlyRequire.join(', '));
        console.error('  Fix the CJS generator (packages/superdoc/scripts/ensure-types.cjs) so the two stay in sync.');
        failed = true;
        continue;
      }
    }

    const current = names.join('\n') + '\n';
    const snapshotPath = join(SNAPSHOT_DIR, snapshotName(subpath));

    if (mode === 'write') {
      writeFileSync(snapshotPath, current, 'utf8');
      console.log(`[SD-3176] Wrote ${snapshotPath} (${names.length} names)`);
      continue;
    }

    let baseline;
    try {
      baseline = readFileSync(snapshotPath, 'utf8');
    } catch {
      console.error(`[SD-3176] Snapshot missing for ${subpath}: ${snapshotPath}`);
      console.error('  Run with --write to seed the baseline.');
      failed = true;
      continue;
    }

    if (baseline === current) {
      console.log(`[SD-3176] ${subpath}: no growth (${names.length} names).`);
      continue;
    }

    const baseSet = new Set(baseline.split('\n').filter(Boolean));
    const curSet = new Set(current.split('\n').filter(Boolean));
    const added = [...curSet].filter((k) => !baseSet.has(k));
    const removed = [...baseSet].filter((k) => !curSet.has(k));

    console.error(`[SD-3176] superdoc${subpath.slice(1)} exports drifted:`);
    if (added.length) console.error('  added:   ' + added.join(', '));
    if (removed.length) console.error('  removed: ' + removed.join(', '));
    failed = true;
  }

  if (failed && mode === 'check') {
    console.error('');
    console.error('Per SD-3175 (path-as-contract facade), these legacy subpaths are no-growth.');
    console.error('If a change is intentional, regenerate the affected snapshot and link the PR');
    console.error('to SD-3175 or a child ticket for reviewer sign-off:');
    console.error('  node tests/consumer-typecheck/snapshot.mjs --family legacy --write');
    return { code: 1 };
  }
  return { code: failed ? 1 : 0 };
}
