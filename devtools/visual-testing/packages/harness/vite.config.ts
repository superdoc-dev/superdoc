import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../..');

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 9989,
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    port: 9989,
  },
  // Exclude superdoc from dependency pre-bundling to use the local linked package
  // instead of a cached/optimized version. Required for local development.
  optimizeDeps: {
    exclude: ['superdoc'],
  },
});
