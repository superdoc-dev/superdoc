import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The bundled reviewed fallback pack lives in @superdoc/font-system as raw assets.
// This plugin serves them at /fonts/* in dev and emits them as SEPARATE output assets
// (dist/fonts/*) in build, so the font bytes are never inlined into the JS bundle
// (Vite lib mode otherwise base64-inlines imported assets, which busts the size budget).
// The provider registers `url(/fonts/<file>)` faces against this same path.
const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(here, '../../shared/font-system/assets');
const THIRD_PARTY_LICENSES_PATH = path.resolve(here, '../../THIRD_PARTY_LICENSES.md');
const URL_PREFIX = '/fonts/';

const contentType = (file) => {
  if (file.endsWith('.woff2')) return 'font/woff2';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'text/plain; charset=utf-8';
};

export default function bundledFontsPlugin() {
  return {
    name: 'superdoc-bundled-fonts',

    // Dev: serve the pack (.woff2 + license texts) at /fonts/<file>.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith(URL_PREFIX)) return next();
        const name = path.basename(url.split('?')[0]);
        const file = path.join(ASSETS_DIR, name);
        // Confine to the assets dir; fall through for anything else.
        if (path.dirname(file) !== ASSETS_DIR || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', contentType(name));
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        const stream = fs.createReadStream(file);
        // A mid-read failure would otherwise emit an unhandled 'error' on the stream and
        // take down the dev server. Respond 500 if nothing was sent yet, then close.
        stream.on('error', () => {
          if (!res.headersSent) res.statusCode = 500;
          res.end();
        });
        stream.pipe(res);
      });
    },

    // Build: emit each asset as a separate output file under fonts/ (explicit emitFile,
    // so it is NOT subject to lib-mode asset inlining).
    generateBundle() {
      if (!fs.existsSync(ASSETS_DIR)) {
        this.warn(`[bundled-fonts] assets dir not found: ${ASSETS_DIR}`);
        return;
      }
      for (const name of fs.readdirSync(ASSETS_DIR)) {
        const full = path.join(ASSETS_DIR, name);
        if (!fs.statSync(full).isFile()) continue;
        this.emitFile({ type: 'asset', fileName: `fonts/${name}`, source: fs.readFileSync(full) });
      }
      if (fs.existsSync(THIRD_PARTY_LICENSES_PATH)) {
        this.emitFile({
          type: 'asset',
          fileName: 'THIRD_PARTY_LICENSES.md',
          source: fs.readFileSync(THIRD_PARTY_LICENSES_PATH),
        });
      }
    },
  };
}
