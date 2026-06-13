// Copies the bundled font binaries + license texts from the canonical source
// (shared/font-system/assets) into this package's assets/ dir.
//
// The binaries have ONE home in the repo: shared/font-system/assets. This package does NOT
// commit its own copy (assets/ is gitignored); instead it assembles them here so the published
// tarball ships them and so `new URL('../assets/<file>', import.meta.url)` resolves in dev and in
// consumer bundlers. Runs in `prepare` (after install, and before pack/publish), so the monorepo
// dev server and the npm tarball both have the files. A published consumer install does NOT run
// this (no `prepare` for registry deps); they get the assets straight from the tarball.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../shared/font-system/assets');
const dst = resolve(here, '../assets');

if (!existsSync(src)) {
  // Not in the monorepo (e.g. a published install that somehow ran prepare). The assets are
  // expected to already be present from the tarball, so this is a no-op, not an error.
  console.warn(`[@superdoc-dev/fonts] canonical assets not found at ${src}; skipping sync (assets assumed present)`);
  process.exit(0);
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
console.log(`[@superdoc-dev/fonts] synced ${count} font faces from shared/font-system/assets -> assets/`);
