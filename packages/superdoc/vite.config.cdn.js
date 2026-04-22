import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { version } from './package.json';
import { getAliases } from './vite.config.js';

// Standalone browser bundle for CDN / <script> tag consumption.
// Exposes `window.SuperDoc`. Inlines all runtime deps (Vue, ProseMirror,
// Yjs, Hocuspocus) so a single <script> tag is enough — these peers are
// ESM-only and can't be loaded as globals. Only pdfjs-dist stays external
// because of its size; PDF viewing requires the ESM + import-map path.
export default defineConfig(({ command }) => {
  const plugins = [vue()];
  const isDev = command === 'serve';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __SUPERDOC_BUILD__: JSON.stringify('cdn-iife'),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins,
    resolve: {
      alias: getAliases(isDev),
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
      conditions: ['source'],
    },
    build: {
      ...(process.argv.includes('--watch') && { watch: { buildDelay: 300 } }),
      emptyOutDir: false,
      target: 'es2022',
      cssCodeSplit: false,
      lib: {
        entry: 'src/cdn-entry.js',
        formats: ['iife'],
        name: 'SuperDoc',
        cssFileName: 'style',
        fileName: () => 'superdoc.min.js',
      },
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        external: [
          'pdfjs-dist',
          'pdfjs-dist/build/pdf.mjs',
          'pdfjs-dist/legacy/build/pdf.mjs',
          'pdfjs-dist/web/pdf_viewer.mjs',
        ],
        output: {
          globals: {
            'pdfjs-dist': 'pdfjsLib',
            'pdfjs-dist/build/pdf.mjs': 'pdfjsLib',
            'pdfjs-dist/legacy/build/pdf.mjs': 'pdfjsLib',
            'pdfjs-dist/web/pdf_viewer.mjs': 'pdfjsViewer',
          },
        },
      },
    },
  };
});
