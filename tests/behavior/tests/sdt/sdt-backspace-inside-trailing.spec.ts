import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { getInlineSdtRange, getInlineSdtSnapshot, type InlineSdtRange } from '../../helpers/sdt.js';

/**
 * Backspace with the caret at the inline SDT trailing edge, INSIDE the content
 * (the other half of the boundary: inside-edge editing vs the outside-edge
 * select-then-delete in sdt-backspace-outside-trailing).
 *
 * Expected behavior from the word-api parity contract
 *   sdt/inline-backspace-inside-trailing, Word 16.0
 * Editable modes delete a character per press (content shrinks, wrapper kept);
 * content-locked modes are blocked (content unchanged). Loads the exact .docx
 * fixtures the contract pinned by sha256.
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = {
  unlocked: path.resolve(DIR, 'fixtures/sd3237-inline-unlocked.docx'),
  sdtLocked: path.resolve(DIR, 'fixtures/sd3218-inline-sdtLocked.docx'),
  contentLocked: path.resolve(DIR, 'fixtures/sd3237-inline-contentlocked.docx'),
  sdtContentLocked: path.resolve(DIR, 'fixtures/sd3218-inline-sdtContentLocked.docx'),
} as const;

async function setupInsideTrailing(superdoc: SuperDocFixture, fixture: string): Promise<InlineSdtRange> {
  await superdoc.loadDocument(fixture);
  await superdoc.waitForStable();
  const sdt = await getInlineSdtRange(superdoc.page);
  expect(sdt).not.toBeNull();
  await superdoc.setTextSelection(sdt!.end); // last position inside the content
  await superdoc.page.evaluate(() => (window as any).editor.view.focus());
  await superdoc.waitForStable();
  return sdt!;
}

async function pressN(superdoc: SuperDocFixture, key: string, n: number) {
  for (let i = 0; i < n; i++) {
    await superdoc.press(key);
    await superdoc.waitForStable();
  }
}

test.describe('SDT Backspace inside the trailing edge - Word parity', () => {
  // Contract: sdt/inline-backspace-inside-trailing, Word 16.0

  for (const mode of ['unlocked', 'sdtLocked'] as const) {
    test(`${mode}: each Backspace deletes one character; wrapper preserved`, async ({ superdoc }) => {
      const sdt = await setupInsideTrailing(superdoc, FIXTURE[mode]);
      const original = sdt.content;
      // Step-based, matching the contract: one character gone per press.
      for (let i = 1; i <= 3; i++) {
        await superdoc.press('Backspace');
        await superdoc.waitForStable();
        const s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
        expect(s.sdtExists).toBe(true); // wrapper preserved throughout
        expect(s.empty).toBe(true); // collapsed caret
        expect(s.sdtContent!.length).toBe(original.length - i); // one char gone per press
        expect(original.startsWith(s.sdtContent!)).toBe(true); // removed from the trailing edge
      }
    });
  }

  for (const mode of ['contentLocked', 'sdtContentLocked'] as const) {
    test(`${mode}: Backspace is blocked; content unchanged`, async ({ superdoc }) => {
      const sdt = await setupInsideTrailing(superdoc, FIXTURE[mode]);
      const original = sdt.content;
      await pressN(superdoc, 'Backspace', 3);
      const s = await getInlineSdtSnapshot(superdoc.page, sdt.id);
      expect(s.sdtExists).toBe(true);
      expect(s.sdtContent).toBe(original); // blocked: nothing deleted
    });
  }
});
