import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'doc-api-stories',
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/ex*.ts'],
    exclude: ['**/*.d.ts'],
  },
});
