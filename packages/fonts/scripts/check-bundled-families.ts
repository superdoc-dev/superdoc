// Non-mutating drift check (CI-safe): fails if the committed src/bundled-families.ts no longer
// matches @superdoc/font-system's runtime curation set (getBundledFamilyNames). Guards the
// Verdana-bug class - a font-offerings change that regenerates the list in a CI working tree but
// merges without the committed update, so the published list silently drifts.
//
// Inside the monorepo a missing font-system source is a failure, not a skip: skipping there would
// make this check green while checking nothing. Outside it, absence is expected. See
// `font-system-source.mjs`.
import { pathToFileURL } from 'node:url';
import { FONT_SYSTEM_OFFERINGS, resolveFontSystemPath } from './font-system-source.mjs';
import { BUNDLED_FAMILY_NAMES } from '../src/bundled-families';

const source = resolveFontSystemPath(FONT_SYSTEM_OFFERINGS, 'source');
if (!source.ok) {
  if (source.skip) {
    console.log(`${source.message}; skipping curation-drift check`);
    process.exit(0);
  }
  console.error(source.message);
  process.exit(1);
}

// The path is resolved above rather than written literally, so a move updates one
// constant instead of this specifier too. Importing by file URL keeps it working
// from any cwd.
const { getBundledFamilyNames } = await import(pathToFileURL(FONT_SYSTEM_OFFERINGS).href);
const expected = [...getBundledFamilyNames()].sort();
const committed = [...BUNDLED_FAMILY_NAMES].sort();

if (JSON.stringify(expected) !== JSON.stringify(committed)) {
  const missing = expected.filter((name) => !committed.includes(name));
  const extra = committed.filter((name) => !expected.includes(name));
  console.error(
    '[@superdoc/fonts] src/bundled-families.ts is STALE: it no longer matches the font-system curation set.',
  );
  if (missing.length) console.error(`  missing (in offerings, not committed): ${missing.join(', ')}`);
  if (extra.length) console.error(`  extra (committed, not in offerings):    ${extra.join(', ')}`);
  console.error('  Fix: run `pnpm --filter @superdoc/fonts generate` and commit src/bundled-families.ts');
  process.exit(1);
}

console.log(`[@superdoc/fonts] curation list in sync with font-system (${committed.length} families)`);
