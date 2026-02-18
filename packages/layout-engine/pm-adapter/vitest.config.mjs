import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import baseConfig from '../../../vitest.baseConfig';

export default defineConfig({
  ...baseConfig,
  test: {
    // Use happy-dom for faster tests (set VITEST_DOM=jsdom to use jsdom)
    environment: process.env.VITEST_DOM || 'happy-dom',
    include: ['src/**/*.test.ts'],
    setupFiles: [resolve(__dirname, './vitest.setup.ts')],
  },
});
