import path from 'path';
import copy from 'rollup-plugin-copy'
import dts from 'vite-plugin-dts'
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
const punycodeEntry = stdlibRequire.resolve('punycode/punycode.js');

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
    // Workspace packages (source paths for dev)
    { find: '@stores', replacement: fileURLToPath(new URL('./src/stores', import.meta.url)) },

    // Force super-editor to resolve from source (not dist) so builds always use latest code
    { find: '@superdoc/super-editor/docx-zipper', replacement: path.resolve(__dirname, '../super-editor/src/core/DocxZipper.js') },
    { find: '@superdoc/super-editor/toolbar', replacement: path.resolve(__dirname, '../super-editor/src/components/toolbar/Toolbar.vue') },
    { find: '@superdoc/super-editor/file-zipper', replacement: path.resolve(__dirname, '../super-editor/src/core/super-converter/zipper.js') },
    { find: '@superdoc/super-editor/converter/internal', replacement: path.resolve(__dirname, '../super-editor/src/core/super-converter') },
    { find: '@superdoc/super-editor/converter', replacement: path.resolve(__dirname, '../super-editor/src/core/super-converter/SuperConverter.js') },
    { find: '@superdoc/super-editor/editor', replacement: path.resolve(__dirname, '../super-editor/src/core/Editor.ts') },
    { find: '@superdoc/super-editor/super-input', replacement: path.resolve(__dirname, '../super-editor/src/components/SuperInput.vue') },
    { find: '@superdoc/super-editor/ai-writer', replacement: path.resolve(__dirname, '../super-editor/src/core/components/AIWriter.vue') },
    { find: '@superdoc/super-editor/style.css', replacement: path.resolve(__dirname, '../super-editor/src/style.css') },
    { find: '@superdoc/super-editor/presentation-editor', replacement: path.resolve(__dirname, '../super-editor/src/index.js') },
    { find: '@superdoc/super-editor', replacement: path.resolve(__dirname, '../super-editor/src/index.js') },

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
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
      conditions: ['source'],
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
