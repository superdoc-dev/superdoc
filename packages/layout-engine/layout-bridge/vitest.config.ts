import { defineConfig } from 'vitest/config';
import baseConfig from '../../../vitest.baseConfig';

const includeBench = process.env.VITEST_BENCH === 'true';

export default defineConfig({
  ...baseConfig,
  test: {
    environment: 'node',
    include: includeBench ? ['test/**/performance*.test.ts'] : ['test/**/*.test.ts'],
    exclude: includeBench ? [] : ['test/**/performance*.test.ts'],
    globals: true,
  },
});
