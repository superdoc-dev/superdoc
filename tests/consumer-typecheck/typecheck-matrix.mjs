/**
 * TypeScript compatibility matrix.
 *
 * Tests that superdoc's type declarations work across all common
 * tsconfig combinations consumers might use:
 *   - moduleResolution: bundler, node16, nodenext
 *   - skipLibCheck: true (targeted compat scenarios), false (public-surface gate)
 *   - strict: true and false
 *   - Import paths: "superdoc", "superdoc/super-editor"
 *   - Node.js headless usage (Buffer return types)
 *   - Guarded public types must not collapse to `any` (SD-2831)
 *
 * The optional `allowNodeModuleErrors` scenario flag remains available for
 * documented upstream exceptions, but current public-surface scenarios should
 * pass with `skipLibCheck: false`.
 *
 * The fixture installs superdoc from the packed tarball at
 * ../../packages/superdoc/superdoc.tgz, so the matrix tests the
 * customer-visible surface, not the source repo.
 *
 * Run: npm run typecheck:matrix
 *
 * By default, the matrix re-packs superdoc and reinstalls the fixture so
 * results reflect the current source. Pass --skip-pack to use whatever
 * tarball is already installed (faster local iteration; risky in CI).
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const skipPack = process.argv.includes('--skip-pack');
const skipTypeCheck = process.argv.includes('--skip-public-types-check');

// SD-2860: before doing any of the matrix work, fail fast if the public-type
// surface drifted from the assertion list. Otherwise a developer who added a
// new public typedef can ship past every other gate without an assertion for
// the new type.
if (!skipTypeCheck) {
  console.log('Checking public-type surface against the assertion list...');
  try {
    execSync('node check-public-types.mjs', {
      cwd: __dirname,
      stdio: 'inherit',
    });
  } catch (e) {
    console.error('\nPublic-type surface check failed (see message above).');
    console.error('Run `node tests/consumer-typecheck/check-public-types.mjs --write` from the repo root (or `npm run check:types:write` from inside `tests/consumer-typecheck/`) to regenerate the assertion list, then commit the result.');
    console.error('(`tests/consumer-typecheck` is intentionally outside the pnpm workspace, so `pnpm --filter` cannot reach it.)');
    process.exit(1);
  }
  console.log();
}

if (!skipPack) {
  console.log('Packing superdoc and reinstalling fixture...');
  const tarballPath = join(repoRoot, 'packages', 'superdoc', 'superdoc.tgz');
  try {
    execSync('pnpm --filter superdoc run pack:es', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (e) {
    console.error('Failed to pack superdoc. Run with --skip-pack to use the existing tarball.');
    process.exit(1);
  }
  if (!existsSync(tarballPath)) {
    console.error(`Expected tarball at ${tarballPath} but it is missing.`);
    process.exit(1);
  }
  // The fixture is intentionally outside the pnpm workspace so it exercises
  // the published tarball's contract, not workspace symlinks. Use the same
  // install strategy the pre-SD-2831 workflow used: `npm install` with the
  // tarball passed as an argument and `--no-save`. The committed
  // `package-lock.json` pins the fixture's dev deps (typescript, @types/node,
  // prosemirror-*) so they install at deterministic versions. The reason for
  // `--no-save` instead of a strict-mode install (`npm ci`,
  // `pnpm --frozen-lockfile`) is that strict modes hash the file: tarball
  // and the tarball's bytes change on every rebuild, which would invalidate
  // the lockfile on every CI run. `--no-save` keeps the dev-dep pinning while
  // accepting whatever bytes the fresh tarball has.
  try {
    execSync(
      'npm install ../../packages/superdoc/superdoc.tgz --no-save --prefer-offline --no-audit --no-fund --silent',
      {
        cwd: __dirname,
        stdio: 'inherit',
      },
    );
  } catch (e) {
    console.error('Failed to install fixture from tarball.');
    process.exit(1);
  }
  console.log('Fresh tarball installed.\n');
}

const scenarios = [
  // Core scenarios — must all pass
  {
    name: 'bundler / strict / skipLibCheck',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-main.ts', 'src/imports-sub-export.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / strict / skipLibCheck',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-main.ts'],
    mustPass: true,
  },
  {
    name: 'nodenext / strict / skipLibCheck',
    module: 'NodeNext',
    moduleResolution: 'nodenext',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-main.ts'],
    mustPass: true,
  },
  // SD-2978: the package advertises CJS runtime conditions for these
  // entries. CommonJS TypeScript consumers must resolve `.d.cts` declarations
  // through the require branch under Node16/NodeNext.
  {
    name: 'node16 / CJS require entries / strict / skipLibCheck=false',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-cjs.cts'],
    mustPass: true,
  },
  {
    name: 'node16 / CJS require entries / loose / skipLibCheck=false',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: false,
    strict: false,
    files: ['src/imports-cjs.cts'],
    mustPass: true,
  },
  {
    name: 'nodenext / CJS require entries / strict / skipLibCheck=false',
    module: 'NodeNext',
    moduleResolution: 'nodenext',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-cjs.cts'],
    mustPass: true,
  },
  {
    name: 'nodenext / CJS require entries / loose / skipLibCheck=false',
    module: 'NodeNext',
    moduleResolution: 'nodenext',
    skipLibCheck: false,
    strict: false,
    files: ['src/imports-cjs.cts'],
    mustPass: true,
  },
  {
    name: 'bundler / headless Node.js',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/headless-node.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / headless Node.js',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/headless-node.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / sub-export only',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-sub-export.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / sub-export only',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-sub-export.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / headless-toolbar',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-headless-toolbar.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / headless-toolbar',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-headless-toolbar.ts'],
    mustPass: true,
  },
  // SD-2861: every supported public subpath listed in the RFC inventory
  // gets at least one strict-mode scenario that imports a representative
  // public symbol. Subpaths classified runtime-only in the RFC
  // (./converter, ./docx-zipper, ./file-zipper, ./style.css) are
  // intentionally not covered: they have no published `types` entry.
  {
    name: 'bundler / types entry',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-types-entry.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / types entry',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-types-entry.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / ui',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-ui.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / ui',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-ui.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / ui/react',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-ui-react.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / ui/react',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-ui-react.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / headless-toolbar/react',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-headless-toolbar-react.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / headless-toolbar/react',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-headless-toolbar-react.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / headless-toolbar/vue',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-headless-toolbar-vue.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / headless-toolbar/vue',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/imports-headless-toolbar-vue.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / loose (non-strict)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: false,
    files: ['src/imports-main.ts', 'src/imports-sub-export.ts'],
    mustPass: true,
  },
  // IT-852 regression: prosemirror types must NOT be overridden by ambient shims
  {
    name: 'bundler / prosemirror coexistence (IT-852)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/prosemirror-coexistence.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / prosemirror coexistence (IT-852)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/prosemirror-coexistence.ts'],
    mustPass: true,
  },
  // SD-2833: trackChangesHelpers are public through `superdoc/super-editor`.
  // These targeted scenarios guard runtime-valid call shapes that `@ts-check`
  // does not reject when JSDoc over-tightens generated declarations.
  {
    name: 'bundler / track changes helper call shapes (SD-2833)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: false,
    strict: true,
    noPropertyAccessFromIndexSignature: true,
    files: ['src/track-changes-helpers.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / track changes helper call shapes (SD-2833)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: false,
    strict: true,
    noPropertyAccessFromIndexSignature: true,
    files: ['src/track-changes-helpers.ts'],
    mustPass: true,
  },
  {
    name: 'nodenext / track changes helper call shapes (SD-2833)',
    module: 'NodeNext',
    moduleResolution: 'nodenext',
    skipLibCheck: false,
    strict: true,
    noPropertyAccessFromIndexSignature: true,
    files: ['src/track-changes-helpers.ts'],
    mustPass: true,
  },
  // SD-2892: full public-facing surface with skipLibCheck=false. These
  // scenarios pack SuperDoc, install it into the consumer fixture, and compile
  // every public consumer assertion under the resolution modes customers use.
  // SuperDoc-owned declaration leaks surface as node_modules/superdoc errors,
  // so these scenarios are required gates with no dependency-error allowance.
  // If this aggregate gate fails, rerun tsc against individual fixture files
  // to narrow the broken public entry point.
  {
    name: 'bundler / all public surface / skipLibCheck=false',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: false,
    strict: true,
    noPropertyAccessFromIndexSignature: true,
    files: ['src/**/*.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / all public surface / skipLibCheck=false',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: false,
    strict: true,
    noPropertyAccessFromIndexSignature: true,
    files: ['src/**/*.ts'],
    mustPass: true,
  },
  {
    name: 'nodenext / all public surface / skipLibCheck=false',
    module: 'NodeNext',
    moduleResolution: 'nodenext',
    skipLibCheck: false,
    strict: true,
    noPropertyAccessFromIndexSignature: true,
    files: ['src/**/*.ts'],
    mustPass: true,
  },
  // SD-2842: every public type re-exported via `superdoc` must resolve
  // to a real interface, not collapse to `any` and not be missing.
  // This guards the customer-acute fix that landed alongside SD-2815
  // and SD-2842 against future regressions.
  {
    name: 'bundler / all public types are real (SD-2842)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/all-public-types.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / all public types are real (SD-2842)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/all-public-types.ts'],
    mustPass: true,
  },
  // SD-2842: end-to-end smoke test for the runtime entry point. Asserts
  // editor.doc is typed (not any), method calls return real types,
  // wrong method names and wrong argument shapes are rejected at compile
  // time. Catches regressions where a named import still resolves but
  // the getter on the live Editor class is typed loosely.
  {
    name: 'bundler / editor.doc runtime smoke (SD-2842)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/editor-doc-runtime.ts'],
    mustPass: true,
  },
  // The broad public API compatibility assertions in `customer-scenario.ts`
  // were previously only exercised by a bare `tsc --noEmit` over the
  // fixture's tsconfig.json (which compiles every file under `src/`).
  // The matrix replaced that step, so the scenario was no longer being
  // run. Restore it as a required matrix entry, propagating the strict
  // `noPropertyAccessFromIndexSignature: true` setting from the base
  // tsconfig.
  {
    name: 'bundler / customer scenario (broad API compat)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    noPropertyAccessFromIndexSignature: true,
    files: ['src/customer-scenario.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / customer scenario (broad API compat)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    noPropertyAccessFromIndexSignature: true,
    files: ['src/customer-scenario.ts'],
    mustPass: true,
  },
  // SD-2869 review found the JSDoc → TS conversion silently narrowed
  // `Modules.comments`, `Modules.toolbar`, etc. into closed object literals,
  // rejecting pass-through fields the runtime forwards via `...moduleConfig`
  // spread. This fixture pins a realistic Config with the documented fields
  // plus the runtime-supported extras (useInternalExternalComments,
  // toolbar.pagination, awareness state.user, etc.) so future regressions of
  // the same shape fail CI before reaching customers.
  {
    name: 'bundler / modules config pass-through (SD-2869)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/modules-config-passthrough.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / modules config pass-through (SD-2869)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/modules-config-passthrough.ts'],
    mustPass: true,
  },
  // SD-2886: internal-only fields on Config / SuperDocLayoutEngineOptions
  // must not appear on the published surface. They are hidden via
  // `Omit<...>` re-exports in `packages/superdoc/src/index.js`. The fixture
  // relies on `@ts-expect-error` markers that stop erroring (TS2578) if a
  // future change leaks an internal field back onto the public surface.
  {
    name: 'bundler / internal fields stripped (SD-2886)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/internal-fields-stripped.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / internal fields stripped (SD-2886)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/internal-fields-stripped.ts'],
    mustPass: true,
  },
  // SD-2867 phase B: SuperDoc.canPerformPermission forwards `comment` and
  // `trackedChange` to isAllowed() unchanged, so the public contract must
  // accept the wide payloads the editor's permission helper produces
  // (tracked-change `type`, `attrs`, `from`, `to`, `segments`, etc.). The
  // fixture pins this so a future PR cannot re-narrow the typedef into a
  // closed shape that rejects valid runtime payloads.
  {
    name: 'bundler / canPerformPermission wide payloads (SD-2867)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/can-perform-permission-payload.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / canPerformPermission wide payloads (SD-2867)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/can-perform-permission-payload.ts'],
    mustPass: true,
  },
  // SD-2867 Kind II: `User.email` accepts both `string` and `null`. The
  // runtime has always exposed `null` (DEFAULT_USER.email), and this
  // fixture pins the typedef to that contract so a future PR cannot
  // re-narrow `email` to `string` without a typecheck failure here.
  {
    name: 'bundler / User.email accepts string | null (SD-2867)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/user-email-nullable.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / User.email accepts string | null (SD-2867)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/user-email-nullable.ts'],
    mustPass: true,
  },
  // SD-2828: `Document.provider` and `SuperDoc.provider` are typed as
  // `CollaborationProvider`, not `HocuspocusProvider`. The runtime stores
  // whatever provider the consumer passed (Hocuspocus, Liveblocks-Yjs,
  // TiptapCollab, etc.); pinning the wider contract here so a future
  // re-narrowing to `HocuspocusProvider` would surface as a typecheck
  // failure on the public surface.
  {
    name: 'bundler / provider is CollaborationProvider (SD-2828)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/provider-collaboration-provider.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / provider is CollaborationProvider (SD-2828)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/provider-collaboration-provider.ts'],
    mustPass: true,
  },

  // SD-2828: `SuperDoc.search()` returns `SearchMatch[] | undefined`, and
  // `SuperDoc.goToSearchResult()` accepts `SearchMatch`. Promoting the
  // search-match shape to the public type contract so consumers wiring
  // a custom search UI get real types on `id`, `from`, `to`, `text`
  // instead of `any`. Pinned here so a future change that strips or
  // re-narrows fields would surface as a typecheck failure.
  {
    name: 'bundler / search returns SearchMatch[] (SD-2828)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/search-match.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / search returns SearchMatch[] (SD-2828)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/search-match.ts'],
    mustPass: true,
  },

  // SD-2828: `ExportParams.fieldsHighlightColor` accepts `string | null
  // | undefined`. The runtime defaults the field to `null` when omitted
  // and forwards that `null` straight through to `Editor.exportDocx`
  // (which already types it as `string | null`). The previous public
  // typedef narrowed to `string`, so consumers passing the
  // runtime-equivalent `null` failed strict-mode typechecks. Pinned
  // here so a future re-narrowing surfaces as a typecheck failure.
  {
    name: 'bundler / fieldsHighlightColor accepts null (SD-2828)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: true,
    strict: true,
    files: ['src/export-params-fields-highlight.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / fieldsHighlightColor accepts null (SD-2828)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: true,
    strict: true,
    files: ['src/export-params-fields-highlight.ts'],
    mustPass: true,
  },
  // SD-2953: runtime-only subpaths (./converter, ./docx-zipper, ./file-zipper)
  // were exported in package.json but lacked `types` fields, leaving strict
  // consumers with TS7016. Each fixture imports through the public subpath
  // and asserts the type resolves to a real declaration.
  {
    name: 'bundler / converter subpath (SD-2953)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-converter.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / converter subpath (SD-2953)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-converter.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / docx-zipper subpath (SD-2953)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-docx-zipper.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / docx-zipper subpath (SD-2953)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-docx-zipper.ts'],
    mustPass: true,
  },
  {
    name: 'bundler / file-zipper subpath (SD-2953)',
    module: 'ESNext',
    moduleResolution: 'bundler',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-file-zipper.ts'],
    mustPass: true,
  },
  {
    name: 'node16 / file-zipper subpath (SD-2953)',
    module: 'Node16',
    moduleResolution: 'node16',
    skipLibCheck: false,
    strict: true,
    files: ['src/imports-file-zipper.ts'],
    mustPass: true,
  },
];

const tscPath = join(__dirname, 'node_modules', '.bin', 'tsc');
let passed = 0;
let failed = 0;
let warnings = 0;

console.log('TypeScript Compatibility Matrix');
console.log('='.repeat(80));
console.log();

for (const scenario of scenarios) {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: scenario.module,
      moduleResolution: scenario.moduleResolution,
      strict: scenario.strict,
      skipLibCheck: scenario.skipLibCheck,
      noEmit: true,
      esModuleInterop: true,
      types: ['node'],
      // Optional per-scenario stricter flags. Propagated only when the
      // scenario explicitly opts in so the base set of scenarios stays
      // unchanged.
      ...(scenario.noPropertyAccessFromIndexSignature
        ? { noPropertyAccessFromIndexSignature: true }
        : {}),
    },
    include: scenario.files,
  };

  const tsconfigPath = join(__dirname, 'tsconfig.matrix.json');
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

  let output = '';
  let exitCode = 0;
  try {
    output = execSync(`${tscPath} -p ${tsconfigPath} --noEmit 2>&1`, {
      cwd: __dirname,
      encoding: 'utf-8',
    });
  } catch (e) {
    output = e.stdout || '';
    exitCode = e.status || 1;
  }

  const srcErrors = (output.match(/^src\//gm) || []).length;
  const nmErrors = (output.match(/^node_modules\//gm) || []).length;

  let status;
  let icon;
  if (exitCode === 0) {
    icon = '✓';
    status = 'PASS';
    passed++;
  } else if (!scenario.mustPass) {
    // Informational scenario: any kind of error (src-level or in
    // node_modules) is reported as a warning. The `allowNodeModuleErrors`
    // flag is the explicit opt-in for scenarios where dep noise is the
    // expected outcome (e.g. the existing skipLibCheck=false probe whose
    // job is to surface 30+ pre-existing errors in node_modules).
    icon = '⚠';
    if (scenario.allowNodeModuleErrors && srcErrors === 0) {
      status = `DEPS (nm:${nmErrors})`;
    } else {
      status = `INFO (src:${srcErrors} nm:${nmErrors})`;
    }
    warnings++;
  } else {
    // Required scenario failed. Any error class fails CI. A broken
    // published declaration surfaces under `node_modules/superdoc/...`
    // even with `skipLibCheck: true` (parse errors are not skipped by
    // lib-check), so a `mustPass: true` scenario with all errors in
    // node_modules is exactly the regression class this gate exists to
    // catch.
    icon = '✗';
    status = `FAIL (src:${srcErrors} nm:${nmErrors})`;
    failed++;
    console.log(`  ${icon} ${scenario.name}: ${status}`);
    const errorLines = output
      .split('\n')
      .filter((l) => l.startsWith('src/') || l.startsWith('node_modules/'))
      .slice(0, 20);
    if (errorLines.length > 0) {
      console.log(errorLines.map((l) => `    ${l}`).join('\n'));
    }
    continue;
  }

  console.log(`  ${icon} ${scenario.name}: ${status}`);
}

console.log();
console.log('='.repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('\nFAILED — consumer types are broken for some configurations');
  process.exit(1);
} else {
  console.log('\nAll required scenarios pass.');
}
