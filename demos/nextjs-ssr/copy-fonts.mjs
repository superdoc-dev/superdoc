// Copy SuperDoc's bundled metric-compatible font substitutes into public/fonts/ so they
// are served at /fonts/ (the default asset base). Without this, the bundled .woff2 404
// and SuperDoc paginates against a browser fallback. Runs as `predev`/`prebuild`.
//
// A real Next.js consumer would copy from `node_modules/@superdoc/font-system/assets/`
// (or set `fonts.assetBaseUrl` to wherever they serve them); this example copies from the
// workspace build for a self-contained demo.
import { cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../packages/superdoc/dist/fonts');
const dst = resolve(here, 'public/fonts');

if (existsSync(src)) {
  cpSync(src, dst, { recursive: true });
  console.log('[nextjs-ssr] copied bundled fonts -> public/fonts/');
} else {
  console.warn(`[nextjs-ssr] bundled fonts not found at ${src}; run \`pnpm build:superdoc\` first`);
}
