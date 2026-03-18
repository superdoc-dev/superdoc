#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

// Verify that vite-plugin-dts generated the expected type entry points.
// Path aliases are resolved by vite-plugin-dts via tsconfig.json paths.
const distRoot = path.resolve(__dirname, '..', 'dist');

const requiredEntryPoints = [
  'superdoc/src/index.d.ts',
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
// @superdoc/common is a private workspace package — inline its types.
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
// Fix: rewrite index.js/<subpath> → <subpath>.js
const BAD_SUBPATH_RE = /(['"])([^'"]*\/index\.js)(\/[^'"]+)\1/g;

let fixedFiles = 0;
let totalReplacements = 0;

const dtsFiles = findDtsFiles(distRoot);
for (const filePath of dtsFiles) {
  let fileContent = fs.readFileSync(filePath, 'utf8');
  let changed = false;

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
    // Replace 'foo/index.js/types' with 'foo/types.js'
    const dir = basePath.replace(/\/index\.js$/, '');
    return `${quote}${dir}${subpath}.js${quote}`;
  });


  if (changed) {
    fs.writeFileSync(filePath, fileContent);
    fixedFiles++;
  }
}

if (fixedFiles > 0) {
  console.log(`[ensure-types] ✓ Fixed ${totalReplacements} import paths in ${fixedFiles} .d.ts files`);
}

// ---------------------------------------------------------------------------
// Generate ambient module declarations for private workspace packages (SD-2227)
//
// Internal .d.ts files reference @superdoc/* workspace packages that consumers
// can't install. Generate a shim so TypeScript can resolve these imports.
// Also shim prosemirror peer deps that are bundled (not in consumer node_modules).
// ---------------------------------------------------------------------------

// Collect @superdoc/* workspace module specifiers and their named imports from
// all .d.ts files. These are private packages consumers can't install — we
// generate ambient `declare module` shims for them. External packages
// (prosemirror, vue, yjs, etc.) are handled by the hand-written shims below.
const workspaceImports = new Map(); // module → Set<name>

for (const filePath of dtsFiles) {
  const fileContent = fs.readFileSync(filePath, 'utf8');

  // Match: import { Foo, Bar } from '...' and import type { Foo } from '...'
  const namedImports = fileContent.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g);
  for (const m of namedImports) {
    const mod = m[2];

    // Skip relative imports and already-handled packages
    if (mod.startsWith('.') || mod.startsWith('@superdoc/common') || mod.startsWith('@superdoc/super-editor')) continue;

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
    if (mod.startsWith('.') || mod.startsWith('@superdoc/common') || mod.startsWith('@superdoc/super-editor')) continue;

    if (mod.startsWith('@superdoc/')) {
      if (!workspaceImports.has(mod)) workspaceImports.set(mod, new Set());
      workspaceImports.get(mod).add(m[2]);
    }
  }

  // Match bare @superdoc/* module references
  const bareRefs = fileContent.matchAll(/['"](@superdoc\/[^'"]+)['"]/g);
  for (const m of bareRefs) {
    const mod = m[1];
    if (mod.startsWith('@superdoc/common') || mod.startsWith('@superdoc/super-editor')) continue;
    if (!workspaceImports.has(mod)) workspaceImports.set(mod, new Set());
  }
}

// ---------------------------------------------------------------------------
// Write _internal-shims.d.ts
//
// Two sections:
//   1. Hand-written shims for external packages (prosemirror-*, vue, yjs,
//      eventemitter3, @hocuspocus/provider). See KNOWN LIMITATION note in the
//      generated file about ambient shims overriding real package types.
//   2. Auto-generated shims for @superdoc/* workspace packages.
// ---------------------------------------------------------------------------

const shimLines = [
  '// Auto-generated ambient declarations for internal/bundled packages.',
  '// These packages are bundled into superdoc or are internal workspace packages.',
  '// Consumers do not need to install them. This file prevents TypeScript errors',
  '// when skipLibCheck is false.',
  '//',
  '// KNOWN LIMITATION: ambient `declare module` with `export type X = any`',
  '// overrides real package types when both are present. This affects:',
  '//   - vue, eventemitter3: direct deps of superdoc — ALWAYS in consumer',
  '//     node_modules, so real types are always replaced by `any`.',
  '//   - yjs, @hocuspocus/provider: peer deps — affected when installed.',
  '//   - prosemirror-*: bundled (not in consumer node_modules) — no conflict.',
  '// The proper fix is adding prosemirror-* as peerDependencies and removing',
  '// shims for packages consumers already have installed.',
  '//',
  '// NOTE: This is a script file (no exports), so `declare module` creates',
  '// global ambient declarations and top-level declarations are global.',
  '',
  '// --- Well-known external packages (hand-written for correctness) ---',
  '',
  "declare module 'prosemirror-model' {",
  '  export type DOMOutputSpec = any;',
  '  export type Fragment = any;',
  '  export type Mark = any;',
  '  export type MarkType = any;',
  '  export type Node = any;',
  '  export type NodeType = any;',
  '  export type ParseRule = any;',
  '  export type ResolvedPos = any;',
  '  export type Schema<N extends string = any, M extends string = any> = any;',
  '  export type Slice = any;',
  '}',
  '',
  "declare module 'prosemirror-state' {",
  '  export type EditorState = any;',
  '  export type Plugin<T = any> = any;',
  '  export type PluginKey<T = any> = any;',
  '  export type TextSelection = any;',
  '  export type Transaction = any;',
  '}',
  '',
  "declare module 'prosemirror-transform' {",
  '  export type Mapping = any;',
  '  export type ReplaceAroundStep = any;',
  '  export type ReplaceStep = any;',
  '  export type Step = any;',
  '}',
  '',
  "declare module 'prosemirror-view' {",
  '  export type Decoration = any;',
  '  export type DecorationSet = any;',
  '  export type DecorationSource = any;',
  '  export type EditorProps = any;',
  '  export type EditorView = any;',
  '  export type NodeView = any;',
  '}',
  '',
  "declare module 'eventemitter3' {",
  '  export class EventEmitter<EventTypes extends string | symbol = string | symbol, Context = any> {',
  '    on(event: EventTypes, fn: (...args: any[]) => void, context?: Context): this;',
  '    off(event: EventTypes, fn: (...args: any[]) => void, context?: Context): this;',
  '    emit(event: EventTypes, ...args: any[]): boolean;',
  '    removeAllListeners(event?: EventTypes): this;',
  '  }',
  '  export default EventEmitter;',
  '}',
  '',
  "declare module 'vue' {",
  '  export type App<T = any> = any;',
  '  export type ComponentOptionsBase<P = any, B = any, D = any, C = any, M = any, Mixin = any, Extends = any, E = any, EE = any, Defaults = any, I = any, II = any, S = any, LC = any, Directives = any, Exposed = any, Provide = any> = any;',
  '  export type ComponentOptionsMixin = any;',
  '  export type ComponentProvideOptions = any;',
  '  export type ComponentPublicInstance<P = any, B = any, D = any, C = any, M = any, E = any, S = any, Options = any, Defaults = any, MakeDefaultsOptional = any, I = any, PublicMixin = any, A = any, B2 = any, C2 = any> = any;',
  '  export type ComputedRef<T = any> = any;',
  '  export type CreateComponentPublicInstanceWithMixins<T = any, S = any, U = any, V = any, W = any, X = any, Y = any, Z = any, A = any, B = any, C = any, D = any> = any;',
  '  export type DefineComponent<P = any, B = any, D = any, C = any, M = any, Mixin = any, Extends = any, E = any, EE = any, PP = any, Props = any, Defaults = any, S = any> = any;',
  '  export type ExtractPropTypes<T = any> = any;',
  '  export type GlobalComponents = any;',
  '  export type GlobalDirectives = any;',
  '  export type PublicProps = any;',
  '  export type Ref<T = any> = any;',
  '  export type RendererElement = any;',
  '  export type RendererNode = any;',
  '  export type ShallowRef<T = any> = any;',
  '  export type VNode = any;',
  '}',
  '',
  "declare module 'yjs' {",
  '  export type Doc = any;',
  '  export type XmlFragment = any;',
  '  export type RelativePosition = any;',
  '}',
  '',
  "declare module '@hocuspocus/provider' {",
  '  export type HocuspocusProvider = any;',
  '}',
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
    const exportLines = sortedNames
      .map(n => `  export type ${n} = any;`);
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

console.log(`[ensure-types] ✓ Generated ambient shims for ${wsCount} workspace + 8 external modules`);

console.log('[ensure-types] ✓ Verified type entry points');
