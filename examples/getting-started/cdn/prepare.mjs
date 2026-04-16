// Copies the locally built CDN bundle + a sample DOCX into this example dir
// so `index.html` is self-contained and can be served with `npx serve .`.
// Run before `dev` or the Playwright smoke test.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../../../packages/superdoc/dist');
const sampleSource = resolve(
  here,
  '../../advanced/headless-toolbar/vanilla/public/test_file.docx',
);

const assets = [
  [resolve(dist, 'superdoc.min.js'), resolve(here, 'superdoc.min.js')],
  [resolve(dist, 'style.css'), resolve(here, 'style.css')],
  [sampleSource, resolve(here, 'test_file.docx')],
];

const missing = assets.filter(([src]) => !existsSync(src)).map(([src]) => src);
if (missing.length) {
  console.error('[cdn-example/prepare] Missing sources:\n  ' + missing.join('\n  '));
  console.error('Run `pnpm --filter superdoc build` first.');
  process.exit(1);
}

if (!existsSync(here)) mkdirSync(here, { recursive: true });
for (const [src, dst] of assets) {
  copyFileSync(src, dst);
  console.log('[cdn-example/prepare] copied', dst.replace(here + '/', ''));
}
