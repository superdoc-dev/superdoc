import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { getInlineSdtRange, getInlineSdtSnapshot, selectionScope, type SelectionScope } from '../../helpers/sdt.js';

/**
 * Shift+Right extending a selection across the inline SDT leading boundary.
 * Word parity contract sdt/inline-shift-right-boundary, Word 16.0 (lock-invariant).
 *
 * The parity fact: selection crosses into the control character-by-character
 * (the scope progresses outside-cc -> cc-and-beyond), it never snaps to the
 * whole control as a unit (whole-content-control). Lock-invariant.
 *
 * Consumes the parity axis helper selectionScope().
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = {
  unlocked: path.resolve(DIR, 'fixtures/sd3237-inline-unlocked.docx'),
  contentLocked: path.resolve(DIR, 'fixtures/sd3237-inline-contentlocked.docx'),
} as const;

test.describe('SDT Shift+Right across the leading boundary - Word parity', () => {
  for (const mode of ['unlocked', 'contentLocked'] as const) {
    test(`${mode}: Shift+Right crosses into the SDT character-by-character, not atomically`, async ({ superdoc }) => {
      await superdoc.loadDocument(FIXTURE[mode]);
      await superdoc.waitForStable();
      const sdt = await getInlineSdtRange(superdoc.page);
      expect(sdt).not.toBeNull();

      // Anchor in the text just before the SDT (mirrors the contract's
      // outside-leading placement); a collapsed caret exactly on the node
      // boundary steps into the node instead of extending.
      await superdoc.setTextSelection(sdt!.pos - 2);
      await superdoc.page.evaluate(() => (window as any).editor.view.focus());
      await superdoc.waitForStable();

      const scopes: SelectionScope[] = [];
      for (let i = 0; i < 6; i++) {
        await superdoc.press('Shift+ArrowRight');
        await superdoc.waitForStable();
        scopes.push(selectionScope(await getInlineSdtSnapshot(superdoc.page, sdt!.id), sdt!));
      }

      // Crossed into the content (overlaps + extends past the leading edge)...
      expect(scopes).toContain('cc-and-beyond');
      // ...but never selected the whole control as a unit - character-granular.
      expect(scopes).not.toContain('whole-content-control');
      // non-destructive
      expect((await getInlineSdtSnapshot(superdoc.page, sdt!.id)).sdtExists).toBe(true);
    });
  }
});
