import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import { getAliases } from '../../../packages/superdoc/vite.config.js';

const superdocRequire = createRequire(new URL('../../../packages/superdoc/package.json', import.meta.url));
const vue = superdocRequire('@vitejs/plugin-vue').default;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('behavior-harness'),
    __IS_DEBUG__: true,
  },
  plugins: [vue()],
  resolve: {
    alias: getAliases(true),
    conditions: ['source'],
  },
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
