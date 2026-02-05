import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests from all packages
    include: ['packages/**/*.test.ts', 'scripts/**/*.test.ts'],

    // Exclude node_modules and dist
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Enable globals (describe, it, expect) without imports
    globals: true,
  },
});
