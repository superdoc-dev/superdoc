import { defineConfig } from 'vitest/config';
import baseConfig from '../../../vitest.baseConfig';

const includeBench = process.env.VITEST_BENCH === 'true';

export default defineConfig({
  ...baseConfig,
  test: {
    // Use happy-dom for faster tests (set VITEST_DOM=jsdom to use jsdom)
    environment: process.env.VITEST_DOM || 'happy-dom',
    include: includeBench
      ? ['src/**/*.bench.ts']
      : ['src/**/*.test.ts'],
    exclude: includeBench ? [] : ['src/**/*.bench.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      enabled: false,
    },
  },
});
