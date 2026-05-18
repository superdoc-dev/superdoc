import path from 'path';
import copy from 'rollup-plugin-copy'
import dts from 'vite-plugin-dts'
import sirv from 'sirv';
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { visualizer } from 'rollup-plugin-visualizer';
import vue from '@vitejs/plugin-vue'

import { version } from './package.json';
import sourceResolve from '../../vite.sourceResolve';

// SD-2864: derive the dts include list from the canonical type-surface
// config so vite, ensure-types, audit, and the tsconfig parity check
// share one source of truth for relocations.
const cjsRequire = createRequire(import.meta.url);
const typeSurface = cjsRequire('./scripts/type-surface.config.cjs');

// WORKAROUND: rolldown doesn't support trailing-slash imports (e.g. 'punycode/')
// which Node.js treats as "resolve the package entry point". node-stdlib-browser's
// url polyfill uses `import from 'punycode/'` and rolldown tries to open the
// directory as a file. We resolve the actual entry point here and redirect via a
// small plugin in optimizeDeps.rollupOptions below.
// Track: https://github.com/nicolo-ribaudo/tc39-proposal-import-deferral/issues/3
// TODO: Remove once rolldown supports trailing-slash imports or node-stdlib-browser drops them.
const require = createRequire(import.meta.url);
const stdlibRequire = createRequire(require.resolve('node-stdlib-browser/package.json'));
const repoRequire = createRequire(path.resolve(__dirname, '../../package.json'));
const superEditorRequire = createRequire(path.resolve(__dirname, '../super-editor/package.json'));
const punycodeEntry = stdlibRequire.resolve('punycode/punycode.js');

const resolvePackageEsmEntry = (pkg, resolver = repoRequire) => {
  const resolved = resolver.resolve(pkg);
  if (resolved.endsWith(`${path.sep}index.cjs`)) {
    return resolved.slice(0, -'index.cjs'.length) + 'index.js';
  }
  return resolved;
};

// y-prosemirror cursor/selection plugins return DecorationSet instances that must share
// identity with the EditorView's prosemirror-view copy. If multiple ProseMirror module
// instances are bundled, `instanceof DecorationSet` checks fail and collaborative startup
// can crash during the first Yjs rerender.
// In the pnpm workspace these packages are installed under super-editor, not necessarily
// at the repo root, so resolve them from the package that owns the dependency edges.
const proseMirrorSingletonAliases = [
  { find: 'prosemirror-model', replacement: resolvePackageEsmEntry('prosemirror-model', superEditorRequire) },
  { find: 'prosemirror-state', replacement: resolvePackageEsmEntry('prosemirror-state', superEditorRequire) },
  { find: 'prosemirror-transform', replacement: resolvePackageEsmEntry('prosemirror-transform', superEditorRequire) },
  { find: 'prosemirror-view', replacement: resolvePackageEsmEntry('prosemirror-view', superEditorRequire) },
];

const visualizerConfig = {
  filename: './dist/bundle-analysis.html',
  template: 'treemap',
  gzipSize: true,
  brotliSize: true,
  open: true
}

// Internal @superdoc/ paths that map to ./src/ (not workspace packages).
// Rolldown doesn't support regex capture groups ($1) in alias replacements,
// so we list these explicitly instead of using /^@superdoc\/(.*)$/.
// Update this list when adding new src/ subdirectories imported via @superdoc/.
const superdocSrcAliases = ['components', 'composables', 'core', 'helpers', 'stores', 'dev', 'icons.js', 'index.js'];

export const getAliases = (_isDev) => {
  const aliases = [
    ...proseMirrorSingletonAliases,

    // Workspace packages (source paths for dev)
    { find: '@stores', replacement: fileURLToPath(new URL('./src/stores', import.meta.url)) },

    // Force super-editor to resolve from source (not dist) so builds always use latest code
    { find: '@superdoc/super-editor/docx-zipper', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/core/DocxZipper.js') },
    { find: '@superdoc/super-editor/toolbar', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/components/toolbar/Toolbar.vue') },
    { find: '@superdoc/super-editor/file-zipper', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/core/super-converter/zipper.js') },
    { find: '@superdoc/super-editor/converter/internal', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/core/super-converter') },
    { find: '@superdoc/super-editor/converter', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/core/super-converter/SuperConverter.js') },
    { find: '@superdoc/super-editor/editor', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/core/Editor.ts') },
    { find: '@superdoc/super-editor/blank-docx', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/core/blank-docx.ts') },
    { find: '@superdoc/super-editor/document-api-adapters', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/document-api-adapters/index.ts') },
    { find: '@superdoc/super-editor/markdown', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/core/helpers/markdown/index.ts') },
    { find: '@superdoc/super-editor/parts-runtime', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/core/parts/init-parts-runtime.ts') },
    { find: '@superdoc/super-editor/super-input', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/components/SuperInput.vue') },
    { find: '@superdoc/super-editor/ai-writer', replacement: path.resolve(__dirname, '../super-editor/src/editors/v1/components/toolbar/AIWriter.vue') },
    { find: '@superdoc/super-editor/style.css', replacement: path.resolve(__dirname, '../super-editor/src/style.css') },
    { find: '@superdoc/super-editor/headless-toolbar/react', replacement: path.resolve(__dirname, '../super-editor/src/headless-toolbar/react.ts') },
    { find: '@superdoc/super-editor/headless-toolbar/vue', replacement: path.resolve(__dirname, '../super-editor/src/headless-toolbar/vue.ts') },
    { find: '@superdoc/super-editor/presentation-editor', replacement: path.resolve(__dirname, '../super-editor/src/index.ts') },
    // The longer `/ui/react` alias must come before `/ui` so the
    // prefix match resolves it first; otherwise `/ui` would swallow
    // `/ui/react` and the React entry would resolve to the controller.
    { find: '@superdoc/super-editor/ui/react', replacement: path.resolve(__dirname, '../super-editor/src/ui/react/index.ts') },
    { find: '@superdoc/super-editor/ui', replacement: path.resolve(__dirname, '../super-editor/src/ui/index.ts') },
    { find: '@superdoc/super-editor', replacement: path.resolve(__dirname, '../super-editor/src/index.ts') },

    // Map @superdoc/<name> to ./src/<name> for internal paths
    ...superdocSrcAliases.map(name => ({
      find: `@superdoc/${name}`,
      replacement: path.resolve(__dirname, `./src/${name}`),
    })),

    // Super Editor aliases
    { find: '@', replacement: '@superdoc/super-editor' },
    ...sourceResolve.alias,
  ];

  return aliases;
};


// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const skipDts = process.env.SUPERDOC_SKIP_DTS === '1';
  const plugins = [
    vue(),
    !skipDts && dts({
      // Foundational sources (superdoc, super-editor, document-api) are
      // always included; relocation patterns come from the canonical
      // type-surface config (SD-2864). Each `relocations` entry pairs the
      // ensure-types rewriter rule with the vite include patterns so the
      // two cannot drift.
      include: [
        'src/**/*',
        '../super-editor/src/**/*',
        '../document-api/src/**/*',
        ...typeSurface.relocations.flatMap((r) => r.viteIncludes),
      ],
      outDir: 'dist',
      // vite-plugin-dts still gathers diagnostics for this mixed JS/Vue source
      // tree, but we do not use this build as the authoritative type-check gate.
      // Keep declaration generation enabled and silence the plugin's diagnostic
      // logger so build:es stays clean while postbuild validates emitted entries.
      logLevel: 'silent',
    }),
    copy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/web/images/*',
          dest: 'dist/images',
        },
      ],
      hook: 'writeBundle'
    }),
    // visualizer(visualizerConfig)
    {
      // Serve dist/ as static files so the docs dev server can load the local UMD build - Development only.
      name: 'serve-dist-for-docs',
      configureServer(server) {
        server.middlewares.use(
          '/dist',
          sirv(path.resolve(__dirname, 'dist'), {
            dev: true,
            setHeaders(res) {
              res.setHeader('Access-Control-Allow-Origin', '*');
            },
          }),
        );
      },
    },
  ].filter(Boolean);
  if (mode !== 'test') plugins.push(nodePolyfills());
  const isDev = command === 'serve';

  // Use emoji marker instead of ANSI colors to avoid reporter layout issues
  const projectLabel = '🦋 @superdoc';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __IS_DEBUG__: true,
    },
    plugins,
    test: {
      name: projectLabel,
      globals: true,
      // Use happy-dom for faster tests (set VITEST_DOM=jsdom to use jsdom)
      environment: process.env.VITEST_DOM || 'happy-dom',
      retry: 2,
      testTimeout: 20000,
      hookTimeout: 10000,
      exclude: [
        ...configDefaults.exclude,
        '**/*.spec.js',
        'tests/cdn-smoke/**',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'lcov'],
        include: ['src/**'],
        exclude: [
          'src/dev/**',
          'src/index.js',
          'src/main.js',
          'src/types.ts',
          'src/super-editor.js',
          'src/headless-toolbar.js',
          'src/headless-toolbar-react.js',
          'src/headless-toolbar-vue.js',
          'src/ui.js',
          // Same pattern as the other public re-export barrels above:
          // `ui-react.js` is a thin pass-through to
          // `@superdoc/super-editor/ui/react`. The provider / hook
          // implementations are tested in the super-editor package
          // (`src/ui/react/*.test.tsx`).
          'src/ui-react.js',
          // Pure JSDoc typedef files (body is `export {}`, no runtime code)
          'src/core/types/**',
          '**/types.js',
        ],
      },
    },
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      lib: {
        entry: "src/index.js",
        name: "SuperDoc",
        cssFileName: 'style',
      },
      minify: false,
      sourcemap: false,
      rollupOptions: {
        input: {
          'superdoc': 'src/index.js',
          'headless-toolbar': 'src/headless-toolbar.js',
          'headless-toolbar-react': 'src/headless-toolbar-react.js',
          'headless-toolbar-vue': 'src/headless-toolbar-vue.js',
          'ui': 'src/ui.js',
          'ui-react': 'src/ui-react.js',
          'super-editor': 'src/super-editor.js',
          'types': 'src/types.ts',
          'super-editor/docx-zipper': '@core/DocxZipper',
          'super-editor/converter': '@core/super-converter/SuperConverter',
          'super-editor/file-zipper': '@core/super-converter/zipper.js',
          // SD-3178 (Phase 3 of SD-3175): explicit public facade entries.
          // Build emits the artifacts alongside the existing entries so the
          // facade declarations are available for postbuild verification.
          // AIDEV-NOTE: `package.json#exports` is intentionally not yet
          // updated to point at these entries. Phase 4 (a separate child
          // of SD-3175) owns the contract switch. Adding `./public` or
          // `./public/...` entries here without that ticket ships new
          // public subpaths under the radar.
          'public': 'src/public/index.ts',
          // SD-3179: legacy headless-toolbar facade entry. Classified as
          // legacy public compatibility surface in
          // `docs/architecture/package-boundaries.md` Decision 4. New
          // custom UI integrations should use the `superdoc/ui` /
          // `superdoc/ui/react` entries instead.
          'public/legacy/headless-toolbar': 'src/public/legacy/headless-toolbar.ts',
          // SD-3180: legacy leaf facade entries mirroring the existing
          // single-export legacy subpaths. Same classification as
          // headless-toolbar above.
          'public/legacy/converter': 'src/public/legacy/converter.ts',
          'public/legacy/docx-zipper': 'src/public/legacy/docx-zipper.ts',
          'public/legacy/file-zipper': 'src/public/legacy/file-zipper.ts',
          // SD-3182: first supported-surface facade entry. The
          // `superdoc/ui/react` subpath is the strategic React binding
          // surface. SD-3147 classification: 12 public + 1 legacy/public-compat.
          'public/ui-react': 'src/public/ui-react.ts',
          // SD-3183: ui controller facade. 70 symbols (49 public + 21
          // legacy/public-compat per SD-3147). Re-export source MUST stay
          // `@superdoc/super-editor/ui` (narrow), not the root barrel —
          // `audit-bundle.cjs` enforces shape on `dist/public/ui.es.js`.
          'public/ui': 'src/public/ui.ts',
        },
        external: [
          'yjs',
          '@hocuspocus/provider',
          'pdfjs-dist',
          'pdfjs-dist/build/pdf.mjs',
          'pdfjs-dist/legacy/build/pdf.mjs',
          'pdfjs-dist/web/pdf_viewer.mjs',
          'react',
          'react/jsx-runtime',
          'vue',
        ],
        output: [
          {
            format: 'es',
            entryFileNames: '[name].es.js',
            chunkFileNames: 'chunks/[name]-[hash].es.js',
            manualChunks(id) {
              if (id.includes('/node_modules/vue/')) return 'vue';
              if (id.includes('/node_modules/jszip/')) return 'jszip';
              if (id.includes('/node_modules/eventemitter3/')) return 'eventemitter3';
              if (id.includes('/node_modules/uuid/')) return 'uuid';
              if (id.includes('/node_modules/xml-js/')) return 'xml-js';
              if (id.includes('blank.docx')) return 'blank-docx';
            }
          },
          {
            format: 'cjs',
            entryFileNames: '[name].cjs',
            chunkFileNames: 'chunks/[name]-[hash].cjs',
            manualChunks(id) {
              if (id.includes('/node_modules/vue/')) return 'vue';
              if (id.includes('/node_modules/jszip/')) return 'jszip';
              if (id.includes('/node_modules/eventemitter3/')) return 'eventemitter3';
              if (id.includes('/node_modules/uuid/')) return 'uuid';
              if (id.includes('/node_modules/xml-js/')) return 'xml-js';
              if (id.includes('blank.docx')) return 'blank-docx';
            }
          }
        ],
      }
    },
    optimizeDeps: {
      include: ['yjs', '@hocuspocus/provider'],
      // Rolldown treats trailing-slash imports as directory paths.
      // node-stdlib-browser's url polyfill imports 'punycode/' — resolve it to the
      // actual file since punycode is also a Node.js builtin and pnpm isolates it.
      rollupOptions: {
        plugins: [
          {
            name: 'fix-punycode-trailing-slash',
            resolveId(source) {
              if (source === 'punycode/' || source === 'punycode') {
                return { id: punycodeEntry };
              }
            },
          },
        ],
      },
    },
    resolve: {
      alias: getAliases(isDev),
      dedupe: ['prosemirror-model', 'prosemirror-state', 'prosemirror-transform', 'prosemirror-view', 'y-prosemirror'],
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
      conditions: ['source'],
      preserveSymlinks: false,
    },
    css: {
      postcss: './postcss.config.mjs',
    },
    server: {
      port: 9094,
      host: '0.0.0.0',
      fs: {
        allow: [
          path.resolve(__dirname, '../super-editor'),
          path.resolve(__dirname, '../layout-engine'),
          '../',
          '../../',
        ],
      },
    },
  }
});
