// Copy the bundled metric-compatible font substitutes into public/fonts/ so Laravel serves them
// at /fonts/ (the asset base set on the editor). Without this, the bundled .woff2 404 and SuperDoc
// paginates against a browser fallback. Runs before `vite build` in `start`.
//
// A real Laravel app would copy from `node_modules/@superdoc-dev/fonts/assets/` (or set
// `fonts.assetBaseUrl` / `fonts.resolveAssetUrl`); this example copies from the workspace package
// for a self-contained demo.
import { cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../packages/fonts/assets');
const dst = resolve(here, 'public/fonts');

if (existsSync(src)) {
  cpSync(src, dst, { recursive: true });
  console.log('[laravel] copied bundled fonts -> public/fonts/');
} else {
  console.warn(`[laravel] bundled fonts not found at ${src}; run \`pnpm --filter @superdoc-dev/fonts sync\` first`);
}
