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
    // Packages migrated to bun test: document-api, layout-engine/{layout-engine,style-engine,geometry-utils},
    // word-layout, shared/{common,font-utils,locale-utils,url-validation}
    // Run them via: pnpm -r --filter '!@superdoc/super-editor' test
    projects: [
      './packages/super-editor',
      './packages/superdoc',
      './packages/ai',
      './packages/collaboration-yjs',
      './packages/layout-engine/contracts',
      './packages/layout-engine/layout-bridge',
      './packages/layout-engine/measuring/dom',
      './packages/layout-engine/painters/dom',
      './packages/layout-engine/pm-adapter',
      './packages/layout-engine/tests',
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
