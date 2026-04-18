import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import vue from '@vitejs/plugin-vue'

import { version as superdocVersion } from '../superdoc/package.json';
import sourceResolve from '../../vite.sourceResolve'

const testPool = process.env.VITEST_POOL ?? 'threads';
const minWorkers = process.env.VITEST_MIN_WORKERS ?? '50%';
const maxWorkers = process.env.VITEST_MAX_WORKERS ?? '75%';
const manualChunkRules = [
  ['converter', ['/src/editors/v1/core/super-converter/SuperConverter', '@core/super-converter/SuperConverter']],
  ['editor', ['/src/editors/v1/core/Editor', '@core/Editor']],
  ['docx-zipper', ['/src/editors/v1/core/DocxZipper', '@core/DocxZipper']],
  ['toolbar', ['/src/editors/v1/components/toolbar/Toolbar.vue', '@components/toolbar/Toolbar.vue']],
  ['super-input', ['/src/editors/v1/components/SuperInput.vue', '@components/SuperInput.vue']],
  ['file-zipper', ['/src/editors/v1/core/super-converter/zipper', '@core/super-converter/zipper']],
  ['ai-writer', ['/src/editors/v1/components/toolbar/AIWriter.vue', '@components/toolbar/AIWriter.vue']],
];

function resolveManualChunk(id) {
  const normalizedId = id.replace(/\\/g, '/');
  const match = manualChunkRules.find(([, patterns]) => patterns.some((pattern) => normalizedId.includes(pattern)));
  return match?.[0];
}

export default defineConfig(({ mode }) => {
  const plugins = [vue()];

  if (mode !== 'test') plugins.push(nodePolyfills());

  return {
    plugins,
    // Combined test configuration
    test: {
      name: '✏️ @super-editor',
      pool: testPool,
      minWorkers,
      maxWorkers,
      globals: true,
      // Use happy-dom for faster tests (set VITEST_DOM=jsdom to use jsdom)
      environment: process.env.VITEST_DOM || 'happy-dom',
      // Override environment to 'node' for directories that don't need DOM.
      // This avoids the cost of setting up happy-dom for pure logic tests.
      // Override to 'node' for directories that don't need DOM, with
      // explicit happy-dom exceptions for files that do (first match wins).
      environmentMatchGlobs: [
        // super-converter: all pure logic except tiff-converter (uses document.createElement)
        ['src/editors/v1/core/super-converter/**/tiff-converter.test.*', 'happy-dom'],
        ['src/editors/v1/core/super-converter/**', 'node'],
        // commands: mostly pure, except deleteSelection (document.getSelection)
        // and insertContent integration tests (Editor with DOM view)
        ['src/editors/v1/core/commands/deleteSelection.test.*', 'happy-dom'],
        ['src/editors/v1/core/commands/insertContent.test.*', 'happy-dom'],
        ['src/editors/v1/core/commands/**', 'node'],
        // helpers: several need DOM (HTML parsing, sanitizer, content processor)
        ['src/editors/v1/core/helpers/updateDOMAttributes.test.*', 'happy-dom'],
        ['src/editors/v1/core/helpers/catchAllSchema.test.*', 'happy-dom'],
        ['src/editors/v1/core/helpers/contentProcessor.test.*', 'happy-dom'],
        ['src/editors/v1/core/helpers/createNodeFromContent.test.*', 'happy-dom'],
        ['src/editors/v1/core/helpers/getHTMLFromFragment.test.*', 'happy-dom'],
        ['src/editors/v1/core/helpers/htmlSanitizer.test.*', 'happy-dom'],
        ['src/editors/v1/core/helpers/**', 'node'],
        ['src/editors/v1/core/parts/**', 'node'],
        // document-api-adapters: insert-structured-wrapper needs DOM for HTML insert
        ['src/editors/v1/document-api-adapters/**/insert-structured-wrapper.test.*', 'happy-dom'],
        ['src/editors/v1/document-api-adapters/**', 'node'],
        ['src/editors/v1/core/ooxml-encryption/**', 'node'],
        ['src/editors/v1/utils/**', 'node'],
      ],
      retry: 2,
      testTimeout: 20000,
      hookTimeout: 10000,
      exclude: [
        ...configDefaults.exclude,
        '**/*.spec.js',
        // Slow test excluded by default, run with VITEST_SLOW=1 (test:slow script)
        ...(process.env.VITEST_SLOW ? [] : ['**/node-import-timing.test.js']),
      ],
      coverage: {
        provider: 'v8',
        exclude: [
          '**/index.js',
          '**/v3/**/index.js',
          '**/examples/**',
          '**/types.js',
          '**/main.js',
          '**/migration_after_0_4_14.js',
        ],
        reporter: ['text'],
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(superdocVersion),
    },
    optimizeDeps: {
      exclude: [
        'yjs',
        'tippy.js',
        '@floating-ui/dom',
      ]
    },
    build: {
      target: 'es2020',
      lib: {
        entry: "src/index.ts",
        formats: ['es'],
        name: "super-editor",
        cssFileName: 'style',
      },
      rollupOptions: {
        external: [
          'react',
          'vue',
          'yjs',
          'y-protocols',
        ],
        input: {
          'headless-toolbar-react': 'src/headless-toolbar/react.ts',
          'headless-toolbar-vue': 'src/headless-toolbar/vue.ts',
          'super-editor': 'src/index.ts',
          'types': 'src/types.ts',
          'editor': '@core/Editor',
          'converter': '@core/super-converter/SuperConverter',
          'docx-zipper': '@core/DocxZipper',
          'toolbar': '@components/toolbar/Toolbar.vue',
          'file-zipper': '@core/super-converter/zipper.js',
          'ai-writer': '@components/toolbar/AIWriter.vue',
        },
        output: {
          globals: {
            'vue': 'Vue',
            'tippy.js': 'tippy',
          },
          // Rolldown requires function-form manualChunks.
          manualChunks(id) {
            return resolveManualChunk(id);
          },
          entryFileNames: '[name].es.js',
          chunkFileNames: 'chunks/[name]-[hash].js'
        }
      },
      minify: false,
      sourcemap: false,
    },
    server: {
      port: 9096,
      host: '0.0.0.0',
    },
    resolve: {
      ...sourceResolve,
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    },
    environments: {
      ssr: {
        resolve: {
          conditions: ['source'],
        },
      },
    },
    css: {
      postcss: './postcss.config.cjs',
    },
  }
})
