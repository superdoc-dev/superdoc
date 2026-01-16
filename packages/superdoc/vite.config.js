import path from 'path';
import copy from 'rollup-plugin-copy'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { visualizer } from 'rollup-plugin-visualizer';
import vue from '@vitejs/plugin-vue'

import { version } from './package.json';
import sourceResolve from '../../vite.sourceResolve';

const visualizerConfig = {
  filename: './dist/bundle-analysis.html',
  template: 'treemap',
  gzipSize: true,
  brotliSize: true,
  open: true
}

export const getAliases = (_isDev) => {
  const aliases = [
    // NOTE: There are a number of packages named "@superdoc/PACKAGE", but we also alias
    // "@superdoc" to the src directory of the superdoc package. This is error-prone and
    // should be changed, e.g. by renaming the src alias to "@superdoc/superdoc".
    //
    // Until then, the alias for "./src" is a regexp that matches any imports starting
    // with "@superdoc/" that don't also match one of the known packages.
    //
    // Also note: this regexp is duplicated in packages/ai/vitest.config.mjs

    {
      find: /^@superdoc\/(?!common|contracts|geometry-utils|pm-adapter|layout-engine|layout-bridge|painter-dom|style-engine|measuring-dom|word-layout|url-validation|preset-geometry|super-editor|locale-utils|font-utils)(.*)/,
      replacement: path.resolve(__dirname, './src/$1'),
    },

    // Workspace packages (source paths for dev)
    { find: '@stores', replacement: fileURLToPath(new URL('./src/stores', import.meta.url)) },

    // Force super-editor to resolve from source (not dist) so builds always use latest code
    { find: '@superdoc/super-editor/docx-zipper', replacement: path.resolve(__dirname, '../super-editor/src/core/DocxZipper.js') },
    { find: '@superdoc/super-editor/toolbar', replacement: path.resolve(__dirname, '../super-editor/src/components/toolbar/Toolbar.vue') },
    { find: '@superdoc/super-editor/file-zipper', replacement: path.resolve(__dirname, '../super-editor/src/core/super-converter/zipper.js') },
    { find: '@superdoc/super-editor/converter/internal', replacement: path.resolve(__dirname, '../super-editor/src/core/super-converter') },
    { find: '@superdoc/super-editor/converter', replacement: path.resolve(__dirname, '../super-editor/src/core/super-converter/SuperConverter.js') },
    { find: '@superdoc/super-editor/editor', replacement: path.resolve(__dirname, '../super-editor/src/core/Editor.ts') },
    { find: '@superdoc/super-editor/super-input', replacement: path.resolve(__dirname, '../super-editor/src/components/SuperInput.vue') },
    { find: '@superdoc/super-editor/ai-writer', replacement: path.resolve(__dirname, '../super-editor/src/core/components/AIWriter.vue') },
    { find: '@superdoc/super-editor/style.css', replacement: path.resolve(__dirname, '../super-editor/src/style.css') },
    { find: '@superdoc/super-editor/presentation-editor', replacement: path.resolve(__dirname, '../super-editor/src/index.js') },
    { find: '@superdoc/super-editor', replacement: path.resolve(__dirname, '../super-editor/src/index.js') },

    // Super Editor aliases
    { find: '@', replacement: '@superdoc/super-editor' },
    ...sourceResolve.alias,
  ];

  return aliases;
};


// https://vitejs.dev/config/
export default defineConfig(({ mode, command}) => {
  const plugins = [
    vue(),
    dts({
      include: ['src/**/*', '../super-editor/src/**/*'],
      outDir: 'dist',
    }),
    copy({
      targets: [
        { 
          src: 'node_modules/pdfjs-dist/web/images/*',
          dest: 'dist/images',
        },
      ],
      hook: 'writeBundle'
    }),
    // visualizer(visualizerConfig)
  ];
  if (mode !== 'test') plugins.push(nodePolyfills());
  const isDev = command === 'serve';

  // Use emoji marker instead of ANSI colors to avoid reporter layout issues
  const projectLabel = '🦋 @superdoc';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __IS_DEBUG__: true,
    },
    plugins,
    test: {
      name: projectLabel,
      globals: true,
      environment: 'jsdom',
      retry: 2,
      testTimeout: 20000,
      hookTimeout: 10000,
      exclude: [
        ...configDefaults.exclude,
        '**/*.spec.js',
      ],
    },
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      lib: {
        entry: "src/index.js",
        name: "SuperDoc",
        cssFileName: 'style',
      },
      minify: false,
      sourcemap: false,
      rollupOptions: {
        input: {
          'superdoc': 'src/index.js',
          'super-editor': 'src/super-editor.js',
          'super-editor/docx-zipper': '@core/DocxZipper',
          'super-editor/converter': '@core/super-converter/SuperConverter',
          'super-editor/file-zipper': '@core/super-converter/zipper.js',
        },
        external: [
          'yjs',
          '@hocuspocus/provider',
          'pdfjs-dist',
          'pdfjs-dist/build/pdf.mjs',
          'pdfjs-dist/legacy/build/pdf.mjs',
          'pdfjs-dist/web/pdf_viewer.mjs',
        ],
        output: [
          {
            format: 'es',
            entryFileNames: '[name].es.js',
            chunkFileNames: 'chunks/[name]-[hash].es.js',
            manualChunks: {
              'vue': ['vue'],
              'blank-docx': ['@superdoc/common/data/blank.docx?url'],
              'jszip': ['jszip'],
              'eventemitter3': ['eventemitter3'],
              'uuid': ['uuid'],
              'xml-js': ['xml-js'],
            }
          },
          {
            format: 'cjs',
            entryFileNames: '[name].cjs',
            chunkFileNames: 'chunks/[name]-[hash].cjs',
            manualChunks: {
              'vue': ['vue'],
              'blank-docx': ['@superdoc/common/data/blank.docx?url'],
              'jszip': ['jszip'],
              'eventemitter3': ['eventemitter3'],
              'uuid': ['uuid'],
              'xml-js': ['xml-js'],
            }
          }
        ],        
      }
    },
    optimizeDeps: {
      include: ['yjs', '@hocuspocus/provider'],
      esbuildOptions: {
        target: 'es2020',
      },
    },
    resolve: {
      alias: getAliases(isDev),
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
      conditions: ['source'],
    },
    css: {
      postcss: './postcss.config.mjs',
    },
    server: {
      port: 9094,
      host: '0.0.0.0',
      fs: {
        allow: [
          path.resolve(__dirname, '../super-editor'),
          path.resolve(__dirname, '../layout-engine'),
          '../',
          '../../',
        ],
      },
    },
  }
});
