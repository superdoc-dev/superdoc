import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { getAliases } from '../../../packages/superdoc/vite.config.js';

const superdocRequire = createRequire(new URL('../../../packages/superdoc/package.json', import.meta.url));
const vue = superdocRequire('@vitejs/plugin-vue').default;

// Serve the built bundled `.woff2` at `/fonts/` (the harness default assetBaseUrl) so the
// font-availability specs can assert real face loads (200) and the no-pack/curation absence of them.
// Production-faithful: it serves packages/superdoc/dist/fonts, the same set a CDN/npm consumer gets.
// Requires `superdoc` to be built (CI builds it before the behavior job; locally run
// `pnpm --filter superdoc build`). The `bad-url` mode points elsewhere on purpose, so it 404s here.
const here = path.dirname(fileURLToPath(import.meta.url));
const bundledFontsDir = path.resolve(here, '../../../packages/superdoc/dist/fonts');
const serveBundledFonts: Plugin = {
  name: 'serve-bundled-fonts',
  configureServer(server) {
    server.middlewares.use('/fonts', (req, res, next) => {
      const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
      const file = path.join(bundledFontsDir, name);
      if (name && file.startsWith(bundledFontsDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.setHeader('Content-Type', 'font/woff2');
        res.setHeader('Access-Control-Allow-Origin', '*');
        fs.createReadStream(file).pipe(res);
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('behavior-harness'),
    __IS_DEBUG__: true,
  },
  plugins: [vue(), serveBundledFonts],
  resolve: {
    // Alias the optional published pack to its source so the harness can import it without declaring
    // a dep (pnpm's isolated linker would otherwise not link it here). This still exercises the real
    // DX: Vite resolves the package's `new URL('../assets/x.woff2', import.meta.url)` and emits the
    // asset, which is what the `fonts: 'package'` mode verifies end to end.
    alias: [
      { find: '@superdoc-dev/fonts', replacement: path.resolve(here, '../../../packages/fonts/src/index.ts') },
      ...getAliases(true),
    ],
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
