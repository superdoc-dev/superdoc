#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

// Verify that vite-plugin-dts generated the expected type entry points.
// Path aliases are resolved by vite-plugin-dts via tsconfig.json paths.
const distRoot = path.resolve(__dirname, '..', 'dist');
const repoRoot = path.resolve(__dirname, '..', '..', '..');

// SD-2842: vite-plugin-dts skips hand-written `.d.ts` files in its include
// glob (it only emits declarations from `.ts`/`.js`). When a file like
// `core-command-map.d.ts` is referenced via a relative import from another
// emitted `.d.ts`, the consumer hits an unresolved-module error. Copy
// every hand-written `.d.ts` from the source trees we publish into the
// matching dist location so those imports resolve.
// Hand-written `.d.ts` files we know are internal-only and must NOT ship
// in `superdoc`'s published dist. The copy step is opt-in via filename
// blocklist (rather than e.g. a per-file directive) so future hand-written
// declarations land in dist by default and the cost of skipping one is one
// line here. Each entry should have a comment explaining why.
const HANDWRITTEN_DTS_BLOCKLIST = new Set([
  // Ambient module declarations for internal `@superdoc/super-editor/converter/internal/...`
  // subpaths. Nothing in `superdoc`'s shipped surface actually imports those subpaths,
  // so the declarations would only leak the bare specifiers into published d.ts.
  // Keep the file in source for super-editor's own typecheck; just don't ship it. (SD-2859)
  'converter-internal.d.ts',
]);

function copyHandwrittenDtsFiles(srcDir, destDir) {
  let copied = 0;
  function walk(currentSrc, currentDest) {
    if (!fs.existsSync(currentSrc)) return;
    for (const entry of fs.readdirSync(currentSrc, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'tests') continue;
      const srcPath = path.join(currentSrc, entry.name);
      const destPath = path.join(currentDest, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath, destPath);
        continue;
      }
      if (!entry.name.endsWith('.d.ts')) continue;
      // Skip blocklisted files (see HANDWRITTEN_DTS_BLOCKLIST above).
      if (HANDWRITTEN_DTS_BLOCKLIST.has(entry.name)) continue;
      // Skip if the dist already has this file (vite-plugin-dts may have
      // generated its own version from a co-located .ts file)
      if (fs.existsSync(destPath)) continue;
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      copied++;
    }
  }
  walk(srcDir, destDir);
  return copied;
}

const handwrittenCopiedSuperEditor = copyHandwrittenDtsFiles(
  path.join(repoRoot, 'packages/super-editor/src'),
  path.join(distRoot, 'super-editor/src'),
);
if (handwrittenCopiedSuperEditor > 0) {
  console.log(`[ensure-types] ✓ Copied ${handwrittenCopiedSuperEditor} hand-written .d.ts files from super-editor/src`);
}

// SD-2893: emit declarations for the shared/common subpaths reachable from the
// public surface. Adding shared/ to vite-plugin-dts's `include` would shift the
// common-ancestor of all source files to the repo root and reorganise the
// entire dist tree, so we run tsc directly for just the files we relocate.
// Today: list-marker-utils plus its sibling layout-constants, and
// comments-types (the four Comment* types referenced via bare @superdoc/common
// imports in three internal-only dist d.ts files). Add new entries here in
// lockstep with `RELOCATION_RULES` below.
const SHARED_COMMON_DTS_TARGETS = ['list-marker-utils.ts', 'layout-constants.ts', 'comments-types.ts'];
{
  const { spawnSync: _spawnSync } = require('node:child_process');
  const tscBin = path.join(repoRoot, 'node_modules', '.bin', 'tsc');
  const sharedCommonDistDir = path.join(distRoot, 'shared/common');
  fs.mkdirSync(sharedCommonDistDir, { recursive: true });
  const sources = SHARED_COMMON_DTS_TARGETS.map((f) => path.join(repoRoot, 'shared/common', f));
  const tscResult = _spawnSync(
    tscBin,
    [
      '--declaration',
      '--emitDeclarationOnly',
      '--skipLibCheck',
      '--target', 'ES2022',
      '--module', 'ESNext',
      '--moduleResolution', 'bundler',
      '--outDir', sharedCommonDistDir,
      '--rootDir', path.join(repoRoot, 'shared/common'),
      ...sources,
    ],
    { stdio: 'inherit' },
  );
  if (tscResult.status !== 0) {
    console.error('[ensure-types] tsc failed emitting shared/common declarations');
    process.exit(1);
  }
  console.log(`[ensure-types] ✓ Emitted ${SHARED_COMMON_DTS_TARGETS.length} shared/common declarations`);
}

const requiredEntryPoints = [
  'superdoc/src/index.d.ts',
  'superdoc/src/super-editor.d.ts',
  'super-editor/src/index.d.ts',
  'super-editor/src/types.d.ts',
];

for (const entry of requiredEntryPoints) {
  const fullPath = path.join(distRoot, entry);
  if (!fs.existsSync(fullPath)) {
    console.error(`[ensure-types] Missing ${entry}`);
    process.exit(1);
  }
}

const indexPath = path.join(distRoot, 'superdoc/src/index.d.ts');
let content = fs.readFileSync(indexPath, 'utf8');

const hasSuperDocExport = /export\s+\{[^}]*\bSuperDoc\b[^}]*\}/m.test(content);
if (!hasSuperDocExport) {
  console.error(`[ensure-types] SuperDoc export missing in superdoc/src/index.d.ts`);
  process.exit(1);
}

// Fix workspace package imports that aren't resolvable by consumers.
// @superdoc/common is a private workspace package — inline its types in
// the main entry. Other reachable d.ts files that import from
// @superdoc/common fall through to the ambient shim block below; those
// imports surface internal types (Comment, CommentContent, CommentJSON)
// that are not on the public surface, so collapsing them to `any` via
// the shim is correct.
const hadWorkspaceImport = content.includes('@superdoc/common');
if (hadWorkspaceImport) {
  // Replace the @superdoc/common import with inline declarations
  content = content.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]@superdoc\/common['"];?\s*\n?/g,
    '',
  );

  // BlankDOCX comes from a Vite ?url import (resolves to a string at runtime)
  // Declare it since vite-plugin-dts can't generate types for ?url imports
  const inlineDeclarations = [
    '/** Document MIME type constants */',
    "declare const DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';",
    "declare const PDF: 'application/pdf';",
    "declare const HTML: 'text/html';",
    'declare function getFileObject(fileUrl: string, name: string, type: string): Promise<File>;',
    'declare function compareVersions(version1: string, version2: string): -1 | 0 | 1;',
    '/** URL to the blank DOCX template */',
    'declare const BlankDOCX: string;',
  ].join('\n');

  content = inlineDeclarations + '\n' + content;
  fs.writeFileSync(indexPath, content);
  console.log('[ensure-types] ✓ Inlined @superdoc/common types');
}

// ---------------------------------------------------------------------------
// Fix pnpm node_modules paths in ALL .d.ts files (SD-2227)
//
// vite-plugin-dts resolves bare specifiers like 'prosemirror-view' to physical
// pnpm paths like '../../node_modules/.pnpm/prosemirror-view@1.41.5/node_modules/prosemirror-view/dist/index.js'.
// Consumers don't have these paths — rewrite them back to bare specifiers.
// ---------------------------------------------------------------------------

/**
 * Recursively find all .d.ts files under a directory.
 */
function findDtsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findDtsFiles(fullPath));
    } else if (entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Match pnpm node_modules paths in both `from '...'` and `import('...')` contexts.
// Captures the bare package name from the pnpm structure:
//   .../node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/dist/index.js
//                                                    ^^^^^ capture this
const PNPM_PATH_RE = /(['"])([^'"]*\/node_modules\/\.pnpm\/[^/]+\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\/dist\/index\.js)\1/g;

// Match broken absolute-looking paths like 'packages/superdoc/src/types.js'
// that vite-plugin-dts sometimes emits from path alias resolution.
const BAD_ABSOLUTE_PATH_RE = /(['"])packages\/superdoc\/src\/([^'"]+)\1/g;

// vite-plugin-dts incorrectly resolves subpath exports (e.g. @superdoc/super-editor/types)
// by appending the subpath to the main entry: '../../super-editor/src/index.js/types'
// or '../../super-editor/src/index.ts/types'
// Fix: rewrite index.(js|ts)/<subpath> → <subpath>.js
const BAD_SUBPATH_RE = /(['"])([^'"]*\/index\.(?:js|ts))(\/[^'"]+)\1/g;

let fixedFiles = 0;
let totalReplacements = 0;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendJsExtensionToRelativeSpecifier(specifier, filePath) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return specifier;
  if (specifier.includes('?') || specifier.includes('#')) return specifier;
  const targetBase = path.resolve(path.dirname(filePath), specifier);
  if (path.posix.extname(specifier) === '.vue') {
    // `./Foo.vue.js` is the Node16/NodeNext-friendly declaration specifier:
    // TypeScript strips the trailing `.js` and resolves it to `Foo.vue.d.ts`.
    return fs.existsSync(`${targetBase}.d.ts`) ? `${specifier}.js` : specifier;
  }
  if (path.posix.extname(specifier)) return specifier;
  if (fs.existsSync(`${targetBase}.d.ts`)) return `${specifier}.js`;
  if (fs.existsSync(path.join(targetBase, 'index.d.ts'))) return `${specifier}/index.js`;
  return specifier;
}

// SD-2815: rewrite `@superdoc/document-api` bare specifiers to point
// at the document-api dist that vite-plugin-dts now emits at
// `dist/document-api/`. Without this, packed consumers see the bare
// specifier in the .d.ts files, fail to resolve it, and fall through
// to the `_internal-shims.d.ts` `any` shim that is generated below.
// The doc-api types re-exported via `superdoc/ui` would then be
// useless (every value assignable, no checking), defeating the public
// re-export surface added in SD-2815.
const DOC_API_PATH_RE = /(['"])@superdoc\/document-api(\/[^'"]+)?\1/g;
function rewriteDocApiPaths(fileContent, filePath) {
  return fileContent.replace(DOC_API_PATH_RE, (_match, quote, subpath = '') => {
    const target = path.join(distRoot, 'document-api/src/index.d.ts');
    let rel = path.relative(path.dirname(filePath), target).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    // Drop the trailing `.d.ts` so the import path follows the
    // module-resolution convention used everywhere else in the dist
    // (`...index.js` form, which TS resolves to `index.d.ts`).
    rel = rel.replace(/\.d\.ts$/, '.js');
    if (subpath) rel = rel.replace(/\/index\.js$/, subpath);
    return `${quote}${rel}${quote}`;
  });
}

// SD-2842: relocate workspace packages whose types appear on the
// public surface. Same idea as the document-api rewrite above: emit
// their declarations into superdoc's dist (via vite-plugin-dts include)
// and redirect bare specifiers in emitted .d.ts files to relative
// paths the consumer can resolve.
//
// SD-2893 note for pm-adapter: only specific type subpaths are
// relocated (see vite.config.js include list). Do not add a broad
// `@superdoc/pm-adapter` rule unless the barrel declaration is also
// emitted; otherwise a bare specifier would rewrite to a missing
// relative path and evade the audit gate.
const RELOCATION_RULES = [
  { pkg: '@superdoc/contracts',     distEntry: 'layout-engine/contracts/src/index.d.ts', matchSubpaths: true },
  { pkg: '@superdoc/dom-contract',  distEntry: 'layout-engine/dom-contract/src/index.d.ts', matchSubpaths: true },
  { pkg: '@superdoc/layout-bridge', distEntry: 'layout-engine/layout-bridge/src/index.d.ts', matchSubpaths: true },
  { pkg: '@superdoc/layout-engine', distEntry: 'layout-engine/layout-engine/src/index.d.ts', matchSubpaths: true },
  { pkg: '@superdoc/painter-dom',   distEntry: 'layout-engine/painters/dom/src/index.d.ts', matchSubpaths: true },
  {
    pkg: '@superdoc/pm-adapter/converter-context.js',
    distEntry: 'layout-engine/pm-adapter/src/converter-context.d.ts',
    matchSubpaths: false,
  },
  {
    pkg: '@superdoc/pm-adapter/sections/types.js',
    distEntry: 'layout-engine/pm-adapter/src/sections/types.d.ts',
    matchSubpaths: false,
  },
  // SD-2893: list-marker-utils is the only @superdoc/common subpath publicly
  // reachable today (via painter-dom). Relocate just this file so the bare
  // @superdoc/common shim does not capture it; the parent @superdoc/common
  // package and other subpaths stay shimmed until separately drained.
  {
    pkg: '@superdoc/common/list-marker-utils',
    distEntry: 'shared/common/list-marker-utils.d.ts',
    matchSubpaths: false,
  },
  // SD-2893: only the /ooxml subpath of style-engine is publicly reachable.
  // Relocate just this subpath plus its sibling cascade.ts dependency
  // (see vite.config.js include list). The bare @superdoc/style-engine is
  // guarded but unrewritten; if a future bare-barrel leak appears the audit
  // gate fails rather than producing a missing relative path.
  {
    pkg: '@superdoc/style-engine/ooxml',
    distEntry: 'layout-engine/style-engine/src/ooxml/index.d.ts',
    matchSubpaths: false,
  },
  // SD-2893: bare @superdoc/common appears in three internal-only dist d.ts
  // files for the four Comment* types (Comment, CommentContent, CommentJSON,
  // CommentThreadingProfile). Point the bare specifier at comments-types.d.ts
  // (emitted via SHARED_COMMON_DTS_TARGETS) so the rewrite resolves to a real
  // file. matchSubpaths: false because only the bare specifier is referenced;
  // any future @superdoc/common/<other-subpath> import would not be auto-
  // rewritten, falling through to the audit gate. The runtime-value imports
  // from the main entry (DOCX, PDF, HTML, getFileObject, compareVersions,
  // BlankDOCX) are still handled by the inline-replacement step above.
  {
    pkg: '@superdoc/common',
    distEntry: 'shared/common/comments-types.d.ts',
    matchSubpaths: false,
  },
];

// Guard packages that must never fall back to `_internal-shims.d.ts`.
// `@superdoc/pm-adapter` is guarded as a root package even though only
// two exact subpaths are relocated today; a future bare-barrel leak should
// fail the build rather than ship as `any`.
const RELOCATION_GUARD_PACKAGES = [
  '@superdoc/document-api',
  '@superdoc/contracts',
  '@superdoc/dom-contract',
  '@superdoc/layout-bridge',
  '@superdoc/layout-engine',
  '@superdoc/painter-dom',
  '@superdoc/pm-adapter',
  '@superdoc/style-engine',
  '@superdoc/common',
  '@superdoc/common/list-marker-utils',
];

function isRelocatedSpecifier(mod) {
  return RELOCATION_RULES.some((rule) =>
    rule.matchSubpaths
      ? mod === rule.pkg || mod.startsWith(rule.pkg + '/')
      : mod === rule.pkg,
  );
}

function makeRelocationRewriter({ pkg, distEntry, matchSubpaths }) {
  // Match the package name with optional subpath, e.g. `@superdoc/contracts` or
  // `@superdoc/contracts/engines/tabs.js`. Anchored to either side of the
  // package segment so `@superdoc/contracts-something` is not matched.
  const escaped = escapeRegExp(pkg);
  const subpathPattern = matchSubpaths ? `(\\/[^'"]+)?` : '';
  const re = new RegExp(`(['"])${escaped}${subpathPattern}\\1`, 'g');
  return (fileContent, filePath) => {
    return fileContent.replace(re, (_match, quote, subpath = '') => {
      const target = path.join(distRoot, distEntry);
      let rel = path.relative(path.dirname(filePath), target).split(path.sep).join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      rel = rel.replace(/\.d\.ts$/, '.js');
      if (matchSubpaths && subpath) rel = rel.replace(/\/index\.js$/, subpath);
      return `${quote}${rel}${quote}`;
    });
  };
}

const RELOCATION_REWRITERS = RELOCATION_RULES.map((rule) => ({
  pkg: rule.pkg,
  rewrite: makeRelocationRewriter(rule),
}));

// Any root specifier added here should also be listed in
// RELOCATION_GUARD_PACKAGES so it cannot fall back to an ambient `any`
// shim after we intentionally skip shim generation.
const UNSHIMMED_PRIVATE_SPECIFIERS = new Set([
  '@superdoc/pm-adapter',
  '@superdoc/style-engine',
]);

function shouldSkipWorkspaceShim(mod) {
  return (
    mod.startsWith('.') ||
    mod.startsWith('@superdoc/super-editor') ||
    mod.startsWith('@superdoc/document-api') ||
    isRelocatedSpecifier(mod) ||
    UNSHIMMED_PRIVATE_SPECIFIERS.has(mod)
  );
}

const dtsFiles = findDtsFiles(distRoot);
for (const filePath of dtsFiles) {
  let fileContent = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Rewrite @superdoc/document-api → relative path to dist/document-api.
  // Run BEFORE the pnpm path rewrite so imports surface as bare paths
  // pointing at the dist tree, not at node_modules.
  const beforeDocApi = fileContent;
  fileContent = rewriteDocApiPaths(fileContent, filePath);
  if (fileContent !== beforeDocApi) {
    changed = true;
    totalReplacements++;
  }

  // SD-2842: apply each relocation rewriter in turn. Each one redirects
  // its own private-package specifier to a relative path in the local dist.
  for (const { rewrite } of RELOCATION_REWRITERS) {
    const before = fileContent;
    fileContent = rewrite(fileContent, filePath);
    if (fileContent !== before) {
      changed = true;
      totalReplacements++;
    }
  }

  // Fix pnpm node_modules paths → bare specifiers
  fileContent = fileContent.replace(PNPM_PATH_RE, (match, quote, _fullPath, packageName) => {
    changed = true;
    totalReplacements++;
    return `${quote}${packageName}${quote}`;
  });

  // Fix broken absolute-looking paths → relative paths
  const relDir = path.relative(path.dirname(filePath), path.join(distRoot, 'superdoc/src'));
  fileContent = fileContent.replace(BAD_ABSOLUTE_PATH_RE, (match, quote, rest) => {
    changed = true;
    totalReplacements++;
    let relativePath = path.posix.join(
      relDir.split(path.sep).join('/'),
      rest,
    );
    // Ensure relative paths start with ./ (bare names are treated as package specifiers)
    if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
      relativePath = './' + relativePath;
    }
    return `${quote}${relativePath}${quote}`;
  });

  // Fix broken subpath exports (index.js/types → types.js)
  fileContent = fileContent.replace(BAD_SUBPATH_RE, (match, quote, basePath, subpath) => {
    changed = true;
    totalReplacements++;
    // Replace 'foo/index.js/types' or 'foo/index.ts/types' with 'foo/types.js'
    const dir = basePath.replace(/\/index\.(?:js|ts)$/, '');
    return `${quote}${dir}${subpath}.js${quote}`;
  });


  // Fix .ts extensions in import specifiers → .js
  // vite-plugin-dts preserves .ts extensions from the source when the entry
  // point is a .ts file. TypeScript expects .js extensions in .d.ts files.
  fileContent = fileContent.replace(
    /(?<=from\s+['"]|import\(['"])([^'"]+)\.ts(?=['"])/g,
    (match, pathWithoutExt) => {
      changed = true;
      totalReplacements++;
      return `${pathWithoutExt}.js`;
    },
  );

  // Node16/NodeNext consumers run stricter ESM declaration resolution than
  // bundler consumers. vite-plugin-dts and tsup can emit relative imports like
  // `export * from './foo'` and Vue SFC imports like `./Foo.vue`; rewrite those
  // to `.js` specifiers that TypeScript maps back to the sibling `.d.ts` file.
  fileContent = fileContent.replace(
    /(?<=from\s+['"]|import\(['"])(\.{1,2}\/[^'"]+)(?=['"])/g,
    (specifier) => {
      const rewritten = appendJsExtensionToRelativeSpecifier(specifier, filePath);
      if (rewritten === specifier) return specifier;
      changed = true;
      totalReplacements++;
      return rewritten;
    },
  );

  if (changed) {
    fs.writeFileSync(filePath, fileContent);
    fixedFiles++;
  }
}

if (fixedFiles > 0) {
  console.log(`[ensure-types] ✓ Fixed ${totalReplacements} import paths in ${fixedFiles} .d.ts files`);
}

// ---------------------------------------------------------------------------
// Normalize the public superdoc/super-editor facade types.
//
// The runtime bundle intentionally exposes a curated facade over the packaged
// super-editor output. vite-plugin-dts currently collapses this file down to a
// plain `export *` and drops the extra helper re-exports, so patch the entry
// point explicitly to keep the type surface aligned with runtime.
// ---------------------------------------------------------------------------

const superEditorFacadePath = path.join(distRoot, 'superdoc/src/super-editor.d.ts');
const expectedSuperEditorFacade = [
  "export * from '../../super-editor/src/editors/v1/index.js';",
  "export * from '../../super-editor/src/index.js';",
  "export { BLANK_DOCX_BASE64 } from '../../super-editor/src/editors/v1/core/blank-docx.js';",
  "export { getDocumentApiAdapters } from '../../super-editor/src/editors/v1/document-api-adapters/index.js';",
  "export { markdownToPmDoc } from '../../super-editor/src/editors/v1/core/helpers/markdown/index.js';",
  "export { initPartsRuntime } from '../../super-editor/src/editors/v1/core/parts/init-parts-runtime.js';",
  '',
].join('\n');

if (fs.readFileSync(superEditorFacadePath, 'utf8') !== expectedSuperEditorFacade) {
  fs.writeFileSync(superEditorFacadePath, expectedSuperEditorFacade);
  console.log('[ensure-types] ✓ Normalized superdoc/super-editor facade types');
}

// ---------------------------------------------------------------------------
// Generate ambient module declarations for private workspace packages (SD-2227)
//
// Internal .d.ts files reference @superdoc/* workspace packages that consumers
// can't install. Generate a shim so TypeScript can resolve these imports.
// ---------------------------------------------------------------------------

// Collect @superdoc/* workspace module specifiers and their named imports from
// all .d.ts files. These are private packages consumers can't install — we
// generate ambient `declare module` shims for them.
const workspaceImports = new Map(); // module → Set<name>

for (const filePath of dtsFiles) {
  const fileContent = fs.readFileSync(filePath, 'utf8');

  // Match: import/export { Foo, Bar } from '...' and import/export type { Foo } from '...'
  const namedImports = fileContent.matchAll(/(?:import|export)\s+(?:type\s+)?\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g);
  for (const m of namedImports) {
    const mod = m[2];

    // Skip relative imports and already-handled packages
    if (shouldSkipWorkspaceShim(mod)) continue;

    if (mod.startsWith('@superdoc/')) {
      if (!workspaceImports.has(mod)) workspaceImports.set(mod, new Set());
      const names = m[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      for (const name of names) workspaceImports.get(mod).add(name);
    }
  }

  // Match: import('...').SomeName — dynamic import type references
  const dynamicImports = fileContent.matchAll(/import\(['"]([^'"]+)['"]\)\.(\w+)/g);
  for (const m of dynamicImports) {
    const mod = m[1];
    if (shouldSkipWorkspaceShim(mod)) continue;

    if (mod.startsWith('@superdoc/')) {
      if (!workspaceImports.has(mod)) workspaceImports.set(mod, new Set());
      workspaceImports.get(mod).add(m[2]);
    }
  }

  // Match bare @superdoc/* module references
  const bareRefs = fileContent.matchAll(/['"](@superdoc\/[^'"]+)['"]/g);
  for (const m of bareRefs) {
    const mod = m[1];
    // Skip @superdoc/super-editor (consumer-facing, not internal). All
    // other @superdoc/* references (including @superdoc/common root and
    // its subpaths) fall through to shim generation. The strip-and-inline
    // step above handles `superdoc/src/index.d.ts`'s @superdoc/common
    // import explicitly; other files importing from @superdoc/common
    // resolve through the shim and collapse internal-only types
    // (Comment, CommentContent, CommentJSON) to `any`. None of those
    // appear on superdoc's public surface, so the collapse is safe.
    if (shouldSkipWorkspaceShim(mod)) continue;
    if (!workspaceImports.has(mod)) workspaceImports.set(mod, new Set());
  }
}

// ---------------------------------------------------------------------------
// Write _internal-shims.d.ts
//
// Only contains auto-generated shims for @superdoc/* workspace packages.
// External packages (prosemirror-*, vue, eventemitter3, yjs, etc.) are NOT
// shimmed — ambient `declare module` overrides real types globally, breaking
// consumers who depend on those packages (IT-852).
// ---------------------------------------------------------------------------

const shimLines = [
  '// Auto-generated ambient declarations for internal workspace packages.',
  '// These are private @superdoc/* packages that consumers cannot install.',
  '// This file prevents TypeScript errors when skipLibCheck is false.',
  '//',
  '// External packages (prosemirror-*, vue, eventemitter3, yjs, etc.) are NOT',
  '// shimmed here — their real types come from node_modules. Ambient shims for',
  '// external packages would override real types globally, breaking consumers',
  '// who depend on those packages (e.g. Tiptap users need real prosemirror types).',
  '//',
  '// NOTE: This is a script file (no exports), so `declare module` creates',
  '// global ambient declarations and top-level declarations are global.',
  '',
];

// --- Auto-generated @superdoc/* workspace package shims ---

let wsCount = 0;
if (workspaceImports.size > 0) {
  shimLines.push('// --- Internal workspace packages (auto-generated) ---');
  shimLines.push('');
  for (const [mod, names] of [...workspaceImports.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    wsCount++;
    const sortedNames = [...names].sort();
    const exportLines = [];
    for (const n of sortedNames) {
      // `default` is a reserved word and cannot appear in `export type
      // default = any;`. When a file imports the default export of a
      // private module (e.g. `import { default as Foo } from '@superdoc/common/components/Foo.vue'`),
      // the named-imports collector picks up `default` as a name; emit
      // a proper `export default` declaration instead.
      if (n === 'default') {
        exportLines.push('  const _default: any;');
        exportLines.push('  export default _default;');
      } else {
        exportLines.push(`  export type ${n} = any;`);
      }
    }
    if (exportLines.length > 0) {
      shimLines.push(`declare module '${mod}' {\n${exportLines.join('\n')}\n}`);
    } else {
      shimLines.push(`declare module '${mod}' { const _: any; export default _; }`);
    }
  }
}
shimLines.push('');

const shimPath = path.join(distRoot, '_internal-shims.d.ts');
fs.writeFileSync(shimPath, shimLines.join('\n'));

// Add reference directive to entry points so TypeScript includes the shims
const shimRef = '/// <reference path="../../_internal-shims.d.ts" />\n';
for (const entry of requiredEntryPoints) {
  const entryPath = path.join(distRoot, entry);
  const entryContent = fs.readFileSync(entryPath, 'utf8');
  if (!entryContent.includes('_internal-shims.d.ts')) {
    fs.writeFileSync(entryPath, shimRef + entryContent);
  }
}

console.log(`[ensure-types] ✓ Generated ambient shims for ${wsCount} workspace modules`);

// SD-2842 regression net: assert that no relocated package leaked back
// into the shim file. If one shows up, a future change broke the
// rewrite or include for that package and customers would see `any`
// for those types again.
const shimContent = fs.readFileSync(shimPath, 'utf8');
const SHIM_FORBIDDEN = RELOCATION_GUARD_PACKAGES;
for (const pkg of SHIM_FORBIDDEN) {
  const re = new RegExp(`declare module '${escapeRegExp(pkg)}(\\/[^']+)?'`);
  if (re.test(shimContent)) {
    console.error(`[ensure-types] ✗ ${pkg} appears in _internal-shims.d.ts. Its types should resolve via a relocation rewrite or fail the audit as an unrelocated leak, not via an ambient any shim. Investigate the include glob, the rewrite rule, and the shim-skip predicate for this package.`);
    process.exit(1);
  }
}
console.log(`[ensure-types] ✓ Verified ${SHIM_FORBIDDEN.length} relocated packages do not appear in shim file`);

console.log('[ensure-types] ✓ Verified type entry points');
