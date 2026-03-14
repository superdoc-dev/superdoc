import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'doc-api-stories',
    environment: 'node',
    include: ['tests/**/*.ts'],
    exclude: ['**/*.d.ts', 'tests/harness.ts', 'tests/**/harness.ts'],
  },
});
