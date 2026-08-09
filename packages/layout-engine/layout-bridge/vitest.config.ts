import { defineConfig } from 'vite-plus';
import baseConfig from '../../../vitest.baseConfig';

export default defineConfig({
  ...baseConfig,
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: [],
    globals: true,
  },
});
