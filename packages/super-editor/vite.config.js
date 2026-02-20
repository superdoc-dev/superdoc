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
  ['converter', ['/src/core/super-converter/SuperConverter', '@core/super-converter/SuperConverter']],
  ['editor', ['/src/core/Editor', '@core/Editor']],
  ['docx-zipper', ['/src/core/DocxZipper', '@core/DocxZipper']],
  ['toolbar', ['/src/components/toolbar/Toolbar.vue', '@components/toolbar/Toolbar.vue']],
  ['super-input', ['/src/components/SuperInput.vue', '@components/SuperInput.vue']],
  ['file-zipper', ['/src/core/super-converter/zipper', '@core/super-converter/zipper']],
  ['ai-writer', ['/src/components/toolbar/AIWriter.vue', '@components/toolbar/AIWriter.vue']],
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
        entry: "src/index.js",
        formats: ['es'],
        name: "super-editor",
        cssFileName: 'style',
      },
      rollupOptions: {
        external: [
          'vue',
          'yjs',
          'y-protocols',
        ],
        input: {
          'super-editor': 'src/index.js',
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
