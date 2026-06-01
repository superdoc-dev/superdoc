import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { getInlineSdtRange, getInlineSdtSnapshot, caretLocation } from '../../helpers/sdt.js';

/**
 * Right-arrow at the inline SDT trailing edge. Word parity contract
 *   sdt/inline-right-arrow-trailing, Word 16.0 (lock-invariant)
 * One press moves the caret from inside the control to just after it
 * (inside-cc -> after-cc); navigation does not depend on lock mode.
 *
 * First consumer of the parity axis helper caretLocation().
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = {
  unlocked: path.resolve(DIR, 'fixtures/sd3237-inline-unlocked.docx'),
  contentLocked: path.resolve(DIR, 'fixtures/sd3237-inline-contentlocked.docx'),
} as const;

test.describe('SDT Right-arrow at the trailing edge - Word parity', () => {
  for (const mode of ['unlocked', 'contentLocked'] as const) {
    test(`${mode}: one Right-arrow moves the caret from inside the SDT to after it`, async ({ superdoc }) => {
      await superdoc.loadDocument(FIXTURE[mode]);
      await superdoc.waitForStable();
      const sdt = await getInlineSdtRange(superdoc.page);
      expect(sdt).not.toBeNull();

      await superdoc.setTextSelection(sdt!.end); // last position inside the content
      await superdoc.page.evaluate(() => (window as any).editor.view.focus());
      await superdoc.waitForStable();
      expect(caretLocation(await getInlineSdtSnapshot(superdoc.page, sdt!.id), sdt!)).toBe('inside-cc');

      await superdoc.press('ArrowRight');
      await superdoc.waitForStable();

      const after = await getInlineSdtSnapshot(superdoc.page, sdt!.id);
      expect(caretLocation(after, sdt!)).toBe('after-cc'); // exited in one press
      expect(after.sdtExists).toBe(true); // navigation does not mutate
    });
  }
});
