import { defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.baseConfig';

export default defineConfig({
  ...baseConfig,
  test: {
    name: '@url-validation',
    environment: 'node',
    globals: true,
    include: ['**/*.test.js'],
  },
});
