import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 9989,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['superdoc'],
  },
});
