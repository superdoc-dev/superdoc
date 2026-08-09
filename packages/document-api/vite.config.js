import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    name: '@superdoc/document-api',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
