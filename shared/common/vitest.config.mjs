import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import baseConfig from '../../vitest.baseConfig';

export default defineConfig({
  ...baseConfig,
  plugins: [vue()],
  test: {
    name: '@common',
    environment: 'node',
    globals: true,
  },
});
