// Copies the locally built CDN bundles + a sample DOCX into this example dir so `index.html` is
// self-contained and can be served with `npx serve .`. Run before `dev` or the Playwright smoke test.
//
// SuperDoc's CDN build ships no fonts; the optional @superdoc-dev/fonts browser build provides them.
// Its IIFE resolves each .woff2 at `../assets/<file>` relative to its own <script>, which is
// `/assets/<file>` when this dir is served at the root - so we place superdoc-fonts.min.js here and
// the faces under assets/.

import { copyFileSync, cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../../../packages/superdoc/dist');
const fontsPkg = resolve(here, '../../../packages/fonts');
const sampleSource = resolve(
  here,
  '../../advanced/headless-toolbar/vanilla/public/test_file.docx',
);

const assets = [
  [resolve(dist, 'superdoc.min.js'), resolve(here, 'superdoc.min.js')],
  [resolve(dist, 'style.css'), resolve(here, 'style.css')],
  [resolve(fontsPkg, 'dist/superdoc-fonts.min.js'), resolve(here, 'superdoc-fonts.min.js')],
  [sampleSource, resolve(here, 'test_file.docx')],
];

// The reviewed fallback faces. superdoc-fonts.min.js resolves them at ../assets/<file> relative to
// its own <script> - i.e. /assets/<file> when this dir is served at the root.
const fontsSrc = resolve(fontsPkg, 'assets');
const fontsDst = resolve(here, 'assets');

const missing = assets.filter(([src]) => !existsSync(src));
if (missing.length || !existsSync(fontsSrc)) {
  console.error('[cdn-example/setup] Build the bundles first:');
  console.error('  pnpm --filter superdoc build');
  console.error('  pnpm --filter @superdoc-dev/fonts build');
  console.error('Missing files:');
  for (const [src] of missing) console.error(`  ${src}`);
  if (!existsSync(fontsSrc)) console.error(`  ${fontsSrc} (@superdoc-dev/fonts faces)`);
  process.exit(1);
}

for (const [src, dst] of assets) {
  copyFileSync(src, dst);
  console.log('[cdn-example/setup] copied', dst.replace(`${here}/`, ''));
}

cpSync(fontsSrc, fontsDst, { recursive: true });
console.log('[cdn-example/setup] copied assets/ (@superdoc-dev/fonts faces)');
