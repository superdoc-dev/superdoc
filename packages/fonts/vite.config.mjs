import { defineConfig } from 'vite';

// Browser / <script> (IIFE) build of @superdoc-dev/fonts: emits dist/superdoc-fonts.min.js exposing
// the `SuperDocFonts` global ({ superdocFonts, createSuperDocFonts, resolveBundledFontAssetUrl }).
// The bundler entry (src/index.ts) stays tsc-built; this build exists only for plain <script>/CDN
// consumption, where the import.meta.url asset URLs don't apply. tsc runs first and writes the
// dist/*.js + dist/*.d.ts, so this build must NOT empty the output dir.
export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/cdn-entry.ts',
      formats: ['iife'],
      name: 'SuperDocFonts',
      fileName: () => 'superdoc-fonts.min.js',
    },
    minify: 'esbuild',
    sourcemap: true,
  },
});
