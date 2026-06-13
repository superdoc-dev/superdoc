// Non-mutating drift check (CI-safe): fails if the committed src/bundled-families.ts no longer
// matches @superdoc/font-system's runtime curation set (getBundledFamilyNames). Guards the
// Verdana-bug class - a font-offerings change that regenerates the list in a CI working tree but
// merges without the committed update, so the published list silently drifts.
//
// Skips when the font-system source is absent (a standalone install cannot recompute the set); in the
// monorepo it runs and a real import error fails loudly. Run via
// `pnpm --filter @superdoc-dev/fonts check:families`.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_FAMILY_NAMES } from '../src/bundled-families';

const here = dirname(fileURLToPath(import.meta.url));
const fontSystemSource = resolve(here, '../../../shared/font-system/src/font-offerings.ts');

if (!existsSync(fontSystemSource)) {
  console.log('[@superdoc-dev/fonts] font-system source not present (standalone install); skipping curation-drift check');
  process.exit(0);
}

// eslint-disable-next-line import-x/no-relative-packages -- build-only script (not shipped); @superdoc-dev/fonts stays a dependency-free runtime package and font-system exposes no /src export, so reading its source relatively here is intentional
const { getBundledFamilyNames } = await import('../../../shared/font-system/src/font-offerings');
const expected = [...getBundledFamilyNames()].sort();
const committed = [...BUNDLED_FAMILY_NAMES].sort();

if (JSON.stringify(expected) !== JSON.stringify(committed)) {
  const missing = expected.filter((name) => !committed.includes(name));
  const extra = committed.filter((name) => !expected.includes(name));
  console.error(
    '[@superdoc-dev/fonts] src/bundled-families.ts is STALE: it no longer matches the font-system curation set.',
  );
  if (missing.length) console.error(`  missing (in offerings, not committed): ${missing.join(', ')}`);
  if (extra.length) console.error(`  extra (committed, not in offerings):    ${extra.join(', ')}`);
  console.error('  Fix: run `pnpm --filter @superdoc-dev/fonts generate` and commit src/bundled-families.ts');
  process.exit(1);
}

console.log(`[@superdoc-dev/fonts] curation list in sync with font-system (${committed.length} families)`);
