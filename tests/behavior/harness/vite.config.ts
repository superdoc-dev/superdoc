import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 9990,
    strictPort: true,
  },
  optimizeDeps: {
    // Do NOT use /@fs dynamic imports in tests — they cause Vite to discover
    // and re-optimize deps mid-run, which invalidates browser contexts and
    // breaks parallel workers (especially WebKit) in CI.
    exclude: ['superdoc'],
  },
});
