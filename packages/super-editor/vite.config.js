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
      // AIDEV-NOTE: `environmentMatchGlobs` used to route ~630 pure-logic tests
      // in super-converter, commands, helpers, parts, document-api-adapters,
      // ooxml-encryption and utils to the node environment, skipping happy-dom
      // setup. Vitest 4 removed the option, so every test now runs in the
      // environment above. Only the two headless command suites depended on
      // node for correctness, and they declare it with a `@vitest-environment`
      // docblock. What is left is the lost startup saving: restoring it needs
      // node and DOM `projects`, which is a topology change (this package is
      // itself a project of the root config) and is deliberately not bundled
      // into the Vitest 4 upgrade.
      retry: 2,
      // Vitest 4 no longer clears mock history between retry attempts,
      // so any call-count assertion under `retry` accumulates calls
      // across attempts. Clearing before each test keeps attempts
      // independent.
      clearMocks: true,
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
          // Externalize the JSX runtime so the ui-react entry (the
          // only TSX in this build) does not inline React 19's
          // jsx-runtime bytes. The published `superdoc/ui/react`
          // bundle resolves @superdoc/super-editor from source via
          // aliases, so end users hit superdoc's externalization,
          // not this dist directly. Externalizing here keeps the
          // intermediate bundle compatible if it's ever consumed
          // through pnpm-link / examples that use the dist path,
          // which would otherwise feed React-17/18 hosts a runtime
          // their renderer can't read.
          'react/jsx-runtime',
          'vue',
          'yjs',
          'y-protocols',
        ],
        input: {
          'headless-toolbar-react': 'src/headless-toolbar/react.ts',
          'headless-toolbar-vue': 'src/headless-toolbar/vue.ts',
          'super-editor': 'src/index.ts',
          'ui': 'src/ui/index.ts',
          'ui-react': 'src/ui/react/index.ts',
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
