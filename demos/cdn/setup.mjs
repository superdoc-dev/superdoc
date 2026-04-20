// Copies the locally built CDN bundle into this demo dir so `index.html` is
// self-contained and can be served with `http-server`. The README still shows
// the jsDelivr URLs as the recommended production recipe.

import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../../packages/superdoc/dist');

const assets = [
  [resolve(dist, 'superdoc.min.js'), resolve(here, 'superdoc.min.js')],
  [resolve(dist, 'style.css'), resolve(here, 'style.css')],
];

const missing = assets.filter(([src]) => !existsSync(src));
if (missing.length) {
  console.error('[cdn-demo/setup] Build the SuperDoc bundle first:');
  console.error('  pnpm --filter superdoc build');
  console.error('Missing files:');
  for (const [src] of missing) console.error('  ' + src);
  process.exit(1);
}

for (const [src, dst] of assets) {
  copyFileSync(src, dst);
  console.log('[cdn-demo/setup] copied', dst.replace(here + '/', ''));
}
