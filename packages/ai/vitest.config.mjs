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
      {
        find: /^@superdoc\/(?!common|contracts|geometry-utils|pm-adapter|layout-engine|layout-bridge|painter-dom|style-engine|measuring-dom|word-layout|url-validation|preset-geometry|super-editor|locale-utils|font-utils)(.*)/,
        replacement: path.resolve(__dirname, '../superdoc/src/$1'),
      },
    ],
  },
  plugins: [vue()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
