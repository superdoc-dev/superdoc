/**
 * Public-barrel regression for SD-3157 React bindings.
 *
 * The `useSuperDocContentControls` hook is the customer-facing entry
 * point for the new `ui.contentControls` surface. If `ui-react.js` or
 * `ui-react.d.ts` drops the re-export, the public path
 * `superdoc/ui/react` silently loses the hook even though the
 * underlying super-editor surface still exports it. Vitest strips
 * types and the workspace tsc config excludes `*.test.ts` files, so
 * scan both barrel files' text and assert the hook name is present.
 *
 * Mirrors the SD-3156 scan strategy in `ui.barrel.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JS_BARREL = readFileSync(resolve(__dirname, 'ui-react.js'), 'utf8');
const DTS_BARREL = readFileSync(resolve(__dirname, 'ui-react.d.ts'), 'utf8');

describe('superdoc/ui/react public barrels (SD-3157)', () => {
  it('runtime barrel (ui-react.js) re-exports useSuperDocContentControls', () => {
    expect(JS_BARREL).toMatch(/\buseSuperDocContentControls\b/);
  });

  it('types barrel (ui-react.d.ts) re-exports useSuperDocContentControls', () => {
    expect(DTS_BARREL).toMatch(/\buseSuperDocContentControls\b/);
  });

  it('useSuperDocComments / Selection / TrackChanges stay on the public path (regression guard)', () => {
    // If a future barrel edit accidentally truncates the export list,
    // existing consumers break too. Sanity-check the neighbors.
    for (const name of [
      'useSuperDocComments',
      'useSuperDocSelection',
      'useSuperDocTrackChanges',
      'useSuperDocCommand',
      'useSuperDocDocument',
      'useSuperDocToolbar',
    ]) {
      expect(JS_BARREL).toContain(name);
      expect(DTS_BARREL).toContain(name);
    }
  });
});
