import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: false,
  outDir: 'dist',
  target: 'es2020',
  external: ['superdoc', 'prosemirror-model', 'prosemirror-state', 'prosemirror-view'],
});
