import { defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.baseConfig';

export default defineConfig({
  ...baseConfig,
  test: {
    name: '@font-utils',
    environment: 'node',
    globals: true,
  },
});
