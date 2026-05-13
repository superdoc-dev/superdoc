import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    solidPlugin(),
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      outDir: 'dist',
      rollupTypes: true,
    }),
  ],
  build: {
    target: 'es2020',
    lib: {
      entry: 'src/index.ts',
      name: 'SuperDocSolid',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    minify: true,
    sourcemap: false,
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store', 'superdoc'],
      output: {
        exports: 'named',
        globals: {
          'solid-js': 'Solid',
          'solid-js/h/jsx-runtime': 'jsxRuntime',
          superdoc: 'SuperDoc',
        },
      },
    },
  },
});
