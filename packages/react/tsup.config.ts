import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: false,
  outDir: 'dist',
  target: 'es2020',
  external: ['react', 'react-dom', 'superdoc'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
