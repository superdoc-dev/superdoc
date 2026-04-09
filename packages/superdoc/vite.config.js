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
      include: ['src/**/*', '../super-editor/src/**/*'],
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
        'tests/umd-smoke/**',
      ],
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
          'super-editor': 'src/super-editor.js',
          'types': 'src/types.ts',
          'super-editor/docx-zipper': '@core/DocxZipper',
          'super-editor/converter': '@core/super-converter/SuperConverter',
          'super-editor/file-zipper': '@core/super-converter/zipper.js',
        },
        external: [
          'yjs',
          '@hocuspocus/provider',
          'pdfjs-dist',
          'pdfjs-dist/build/pdf.mjs',
          'pdfjs-dist/legacy/build/pdf.mjs',
          'pdfjs-dist/web/pdf_viewer.mjs',
          'react',
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
