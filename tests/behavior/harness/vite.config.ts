import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 9990,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['superdoc'],
  },
});
