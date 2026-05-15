/**
 * Public-barrel regression for SD-3156.
 *
 * The new content-control viewport address types live in
 * `@superdoc/super-editor/src/ui/types.ts`. Consumers reach them
 * through the `superdoc/ui` sub-entry, which re-exports a hand-
 * maintained list. If `ui.d.ts` drops a re-export, a typed consumer
 * loses the ability to annotate a `getRect({ target })` call for a
 * content control — exactly the gap caught in code review on the
 * initial SD-3156 commit.
 *
 * Vitest strips types at runtime and the workspace tsc config
 * excludes `*.test.ts` files, so this can't be a pure type-import
 * test. Instead, scan the barrel file's text and assert the two new
 * type names appear in the export list. Fragile to a complete
 * refactor of the barrel format, but catches the realistic failure
 * mode: a future edit that omits one of these lines.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BARREL_PATH = resolve(__dirname, 'ui.d.ts');
const BARREL_TEXT = readFileSync(BARREL_PATH, 'utf8');

describe('superdoc/ui public barrel (SD-3156)', () => {
  it('re-exports ContentControlViewportAddress', () => {
    // Permissive matcher: any single line that mentions both the
    // `type` keyword and the type name passes, regardless of trailing
    // comma or surrounding whitespace.
    expect(BARREL_TEXT).toMatch(/type\s+ContentControlViewportAddress\b/);
  });

  it('re-exports ViewportEntityAddress', () => {
    expect(BARREL_TEXT).toMatch(/type\s+ViewportEntityAddress\b/);
  });

  it('re-exports ViewportEntityHit (already present, regression guard)', () => {
    // Pre-existing — but ViewportEntityHit also gained the
    // contentControl variant in this PR, so include it in the same
    // check so a future barrel diff removing the entire viewport
    // section doesn't silently drop the new variant.
    expect(BARREL_TEXT).toMatch(/type\s+ViewportEntityHit\b/);
  });

  it('re-exports ViewportGetRectInput (already present, regression guard)', () => {
    expect(BARREL_TEXT).toMatch(/type\s+ViewportGetRectInput\b/);
  });
});
