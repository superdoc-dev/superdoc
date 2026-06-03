import { defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.baseConfig';

export default defineConfig({
  ...baseConfig,
  test: {
    name: '@font-system',
    environment: 'node',
    globals: true,
  },
});
