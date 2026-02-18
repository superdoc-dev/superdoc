import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@superdoc/document-api',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
