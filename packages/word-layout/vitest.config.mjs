import { defineConfig } from 'vite-plus';
import baseConfig from '../../vitest.baseConfig';

export default defineConfig({
  ...baseConfig,
  test: {
    globals: true,
  },
});
