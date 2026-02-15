import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const superdocPkg = path.resolve(__dirname, '../../../packages/superdoc');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'superdoc/style.css': path.join(superdocPkg, 'dist/style.css'),
      superdoc: path.join(superdocPkg, 'dist/superdoc.es.js'),
    },
    // Force a single copy of yjs. Without this, Vite resolves `import "yjs"`
    // from superdoc's dist chunks to the monorepo's copy, while the example
    // app resolves to its own node_modules copy — two physical files of the
    // same version. Y.js detects this and prints "Yjs was already imported",
    // breaking instanceof checks and corrupting Liveblocks rooms (code 1011).
    dedupe: ['yjs'],
  },
  server: {
    port: 3000,
    fs: {
      allow: [superdocPkg, '.'],
    },
  },
});
