import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

/**
 * Vitest-authored tests for the repository scripts.
 *
 * These live outside the workspace projects in the root config, which cover
 * packages and apps. Without their own config they are collected by nothing and
 * pass by never running, which is the failure mode this file exists to prevent.
 *
 * Named explicitly rather than globbed: most files in `__tests__/` are written
 * for `node --test` and vitest cannot collect them, so a glob would report them
 * as failures that have nothing to do with the change being tested.
 */
export default defineConfig({
  // Pin the root to this directory: vitest resolves `include` from the
  // process cwd otherwise, so running from the repository root finds nothing.
  root: path.dirname(fileURLToPath(import.meta.url)),
  test: {
    name: 'public-scripts',
    environment: 'node',
    include: ['__tests__/docx-privacy.test.mjs'],
  },
});
