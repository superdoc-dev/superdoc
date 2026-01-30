import { defineConfig } from 'vitest/config';
import baseConfig from '../../../vitest.baseConfig';

const includeBench = process.env.VITEST_BENCH === 'true';

// Files that must stay on Vitest (use fake timers, DOM, or have circular dependency issues)
const vitestFiles = [
  'test/cursor-renderer.test.ts',
  'test/debounced-passes.test.ts',
  'test/dom-mapping.test.ts',
  'test/dom-reconciler.test.ts',
  'test/focus-watchdog.test.ts',
  'test/font-metrics-cache.test.ts',
  'test/headerFooterLayout.test.ts',
  'test/layout-epoch.test.ts',
  'test/layout-pipeline.test.ts',
  'test/layout-version-manager.test.ts',
  'test/pm-dom-fallback.test.ts',
  'test/resolveMeasurementConstraints.test.ts',
  'test/safety-net.test.ts',
  'test/table-handler.test.ts',
];

export default defineConfig({
  ...baseConfig,
  test: {
    environment: 'node',
    include: includeBench ? ['test/**/performance*.test.ts'] : vitestFiles,
    exclude: includeBench ? [] : ['test/**/performance*.test.ts'],
    globals: true,
  },
});
