import { defineConfig } from 'vite-plus';
import baseConfig from '../../vitest.baseConfig';

export default defineConfig({
  ...baseConfig,
  test: {
    name: '@fonts',
    environment: 'node',
    globals: true,
  },
});
