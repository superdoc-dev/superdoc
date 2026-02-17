import { defineConfig } from 'vitest/config';

const testPool = process.env.VITEST_POOL ?? 'threads';
const minWorkers = process.env.VITEST_MIN_WORKERS ?? '50%';
const maxWorkers = process.env.VITEST_MAX_WORKERS ?? '75%';

export default defineConfig({
  test: {
    pool: testPool,
    minWorkers,
    maxWorkers,
    // Use package directories; Vitest will pick up each package's vite.config.js
    projects: [
      './packages/super-editor',
      './packages/document-api',
      './packages/superdoc',
      './packages/ai',
      './packages/collaboration-yjs',
      './packages/layout-engine/contracts',
      './packages/layout-engine/geometry-utils',
      './packages/layout-engine/layout-bridge',
      './packages/layout-engine/layout-engine',
      './packages/layout-engine/measuring/dom',
      './packages/layout-engine/painters/dom',
      './packages/layout-engine/pm-adapter',
      './packages/layout-engine/style-engine',
      './packages/layout-engine/tests',
      './packages/word-layout',
      './shared/common',
      './shared/font-utils',
      './shared/locale-utils',
      './shared/url-validation',
    ],
    coverage: {
      exclude: [
        '**/index.js',
        '**/postcss.config.cjs',
        '**/postcss.config.mjs',
        '**/main.js',
        '**/types.js',
        '**/migration_after_0_4_14.js',
      ],
    },
  },
});
