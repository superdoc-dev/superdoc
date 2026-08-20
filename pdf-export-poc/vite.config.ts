import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  worker: { format: 'es' },
  // SuperDoc's V2 engine spawns a module worker via
  // `new Worker(new URL('./assets/...', import.meta.url))`. Dep pre-bundling
  // rewrites import.meta.url and orphans the worker asset, so serve these
  // packages from their real node_modules location instead.
  optimizeDeps: { exclude: ['superdoc', '@superdoc/docx-engine'] },
});
