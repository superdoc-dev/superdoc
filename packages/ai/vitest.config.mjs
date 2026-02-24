import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import baseConfig from '../../vitest.baseConfig';
import path from 'path';

export default defineConfig({
  ...baseConfig,
  resolve: {
    ...baseConfig.resolve,
    alias: [
      ...baseConfig.resolve.alias,

      // TODO: This package includes superdoc built from source, so this
      // requires replicating superdoc's aliases as well. Find a way to avoid
      // this duplication while also avoiding the need to have a separate build
      // step to build superdoc before running packages/ai tests.

      { find: '@stores', replacement: path.resolve(__dirname, '../superdoc/src/stores') },
      // Rolldown doesn't support regex capture groups ($1) in alias replacements.
      // Keep in sync with packages/superdoc/vite.config.js superdocSrcAliases.
      ...['components', 'composables', 'core', 'helpers', 'stores', 'dev', 'icons.js'].map(name => ({
        find: `@superdoc/${name}`,
        replacement: path.resolve(__dirname, `../superdoc/src/${name}`),
      })),
    ],
  },
  plugins: [vue()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
