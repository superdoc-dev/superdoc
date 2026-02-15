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
  },
  server: {
    port: 3000,
    fs: {
      allow: [superdocPkg, '.'],
    },
  },
});
