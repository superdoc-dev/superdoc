/**
 * Vite config for building the /dev demo as a deployable static site.
 * Usage: vite build --config vite.config.dev-deploy.js
 */
import path from 'path';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import vue from '@vitejs/plugin-vue';

import sourceResolve from '../../vite.sourceResolve';

const require = createRequire(import.meta.url);
const stdlibRequire = createRequire(require.resolve('node-stdlib-browser/package.json'));
const punycodeEntry = stdlibRequire.resolve('punycode/punycode.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const superdocSrcAliases = ['components', 'composables', 'core', 'helpers', 'stores', 'dev', 'icons.js', 'index.js'];

export default defineConfig({
  plugins: [vue(), nodePolyfills()],
  define: {
    __APP_VERSION__: JSON.stringify('dev'),
    __IS_DEBUG__: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist-dev',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: 'index.html',
    },
  },
  optimizeDeps: {
    include: ['yjs', '@hocuspocus/provider'],
    rollupOptions: {
      plugins: [
        {
          name: 'fix-punycode-trailing-slash',
          resolveId(source) {
            if (source === 'punycode/' || source === 'punycode') {
              return { id: punycodeEntry };
            }
          },
        },
      ],
    },
  },
  resolve: {
    alias: [
      { find: '@stores', replacement: fileURLToPath(new URL('./src/stores', import.meta.url)) },
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
      ...superdocSrcAliases.map(name => ({
        find: `@superdoc/${name}`,
        replacement: path.resolve(__dirname, `./src/${name}`),
      })),
      { find: '@', replacement: '@superdoc/super-editor' },
      ...sourceResolve.alias,
    ],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    conditions: ['source'],
  },
  css: {
    postcss: './postcss.config.mjs',
  },
});
