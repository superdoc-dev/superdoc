import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'document-api-smoke',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.d.ts'],
    testTimeout: 45_000,
  },
});
