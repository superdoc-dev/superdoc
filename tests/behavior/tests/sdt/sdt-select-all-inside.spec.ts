import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { getInlineSdtRange, getInlineSdtSnapshot } from '../../helpers/sdt.js';

/**
 * Select-all (Ctrl/Cmd+A) with the caret inside an inline SDT.
 *
 * Expected behavior from the word-api parity contract
 *   sdt/inline-select-all-inside, Word 16.0
 * which is lock-invariant (captured identical across unlocked and
 * contentLocked): select-all escapes the control and selects the whole
 * document, it does not scope-select the SDT content.
 */

test.use({ config: { toolbar: 'full', showSelection: true } });

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = {
  unlocked: path.resolve(DIR, 'fixtures/sd3237-inline-unlocked.docx'),
  contentLocked: path.resolve(DIR, 'fixtures/sd3237-inline-contentlocked.docx'),
} as const;

async function selectAllInside(superdoc: SuperDocFixture, fixture: string) {
  await superdoc.loadDocument(fixture);
  await superdoc.waitForStable();
  const sdt = await getInlineSdtRange(superdoc.page);
  expect(sdt).not.toBeNull();
  await superdoc.setTextSelection(sdt!.start + 1); // inside the content
  await superdoc.page.evaluate(() => (window as any).editor.view.focus());
  await superdoc.waitForStable();
  await superdoc.press('ControlOrMeta+a');
  await superdoc.waitForStable();
  return getInlineSdtSnapshot(superdoc.page, sdt!.id);
}

test.describe('SDT select-all from inside - Word parity', () => {
  // Contract: sdt/inline-select-all-inside, Word 16.0 (lock-invariant)

  for (const mode of ['unlocked', 'contentLocked'] as const) {
    test(`${mode}: select-all inside the SDT selects the whole document, not just the control`, async ({
      superdoc,
    }) => {
      const s = await selectAllInside(superdoc, FIXTURE[mode]);
      expect(s.empty).toBe(false);
      const docSize = await superdoc.page.evaluate(() => (window as any).editor.state.doc.content.size);
      // selection spans the whole body, not just the SDT content
      expect(s.from).toBeLessThanOrEqual(1);
      expect(s.to).toBeGreaterThanOrEqual(docSize - 1);
      // and the SDT is untouched by a non-destructive select-all
      expect(s.sdtExists).toBe(true);
    });
  }
});
