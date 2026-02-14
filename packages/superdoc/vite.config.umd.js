import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { version } from './package.json';
import { getAliases } from './vite.config.js';

export default defineConfig(({ command }) => {
  const plugins = [vue()];
  const isDev = command === 'serve';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins,
    resolve: {
      alias: getAliases(isDev),
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
      conditions: ['source'],
    },
    build: {
      emptyOutDir: false,
      target: 'es2022',
      cssCodeSplit: false,
      lib: {
        entry: 'src/index.js',
        formats: ['umd'],
        name: 'SuperDocLibrary',
        cssFileName: 'style',
        fileName: (format) => `superdoc.${format}.js`,
      },
      minify: false,
      sourcemap: true,
      rollupOptions: {
        external: [
          'yjs',
          '@hocuspocus/provider',
          'pdfjs-dist',
          'pdfjs-dist/build/pdf.mjs',
          'pdfjs-dist/legacy/build/pdf.mjs',
          'pdfjs-dist/web/pdf_viewer.mjs',
        ],
        output: {
          globals: {
            yjs: 'Yjs',
            '@hocuspocus/provider': 'HocuspocusProvider',
            'pdfjs-dist': 'PDFJS',
          },
        },
      },
    },
  };
});
