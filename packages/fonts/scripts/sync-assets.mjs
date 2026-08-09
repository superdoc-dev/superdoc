// Copies the bundled font binaries + license texts from the canonical source
// (shared/font-system/assets) into this package's assets/ dir.
//
// The binaries have ONE home in the repo: shared/font-system/assets. This package does NOT
// commit its own copy (assets/ is gitignored); instead it assembles them here so the published
// tarball ships them and so `new URL('../assets/<file>', import.meta.url)` resolves in dev and in
// consumer bundlers. Runs in `prepare` (after install, and before pack/publish), so the monorepo
// dev server and the npm tarball both have the files. A published consumer install does NOT run
// this (no `prepare` for registry deps); they get the assets straight from the tarball.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_SYSTEM_ASSETS, resolveFontSystemPath } from './font-system-source.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = FONT_SYSTEM_ASSETS;
const dst = resolve(here, '../assets');

const assets = resolveFontSystemPath(src, 'assets directory');
if (!assets.ok) {
  if (assets.skip) {
    // A published install ships the assets in its own tarball, so there is
    // nothing to sync and nothing wrong.
    console.warn(`${assets.message}; skipping sync (assets assumed present)`);
    process.exit(0);
  }
  // Inside the monorepo, syncing from a path that does not exist would wipe
  // `assets/` and copy nothing, publishing a font package with no fonts.
  console.error(assets.message);
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
// Copy the .woff2 faces and the license texts (LICENSES.md, *.txt) so provenance ships with them.
for (const name of readdirSync(src)) {
  if (name.endsWith('.woff2') || name.endsWith('.txt') || name.endsWith('.md')) {
    cpSync(resolve(src, name), resolve(dst, name));
  }
}
const count = readdirSync(dst).filter((f) => f.endsWith('.woff2')).length;
console.log(`[@superdoc/fonts] synced ${count} font faces from ${relative(resolve(here, '../../..'), src)} -> assets/`);
