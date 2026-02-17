import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const superdocPkg = path.resolve(__dirname, '../../../packages/superdoc');

// Force all yjs imports to resolve to a single physical copy. Without this,
// Vite resolves `import "yjs"` from superdoc's dist chunks (located in the
// monorepo) to packages/superdoc/node_modules/yjs — a different file than
// this example's node_modules/yjs. Two copies of Y.js breaks constructor
// instanceof checks, producing invalid CRDT data that Liveblocks rejects
// with WebSocket close code 1011.
const yjsPkg = path.resolve(__dirname, 'node_modules/yjs');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'superdoc/style.css': path.join(superdocPkg, 'dist/style.css'),
      superdoc: path.join(superdocPkg, 'dist/superdoc.es.js'),
      yjs: yjsPkg,
    },
  },
  server: {
    port: 3000,
    fs: {
      allow: [superdocPkg, '.'],
    },
  },
});
