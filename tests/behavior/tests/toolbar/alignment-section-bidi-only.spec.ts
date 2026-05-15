import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECTION_BIDI_DOC = path.resolve(__dirname, '../formatting/fixtures/rtl-section-only-bidi.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

async function clickAlignment(superdoc: SuperDocFixture, ariaLabel: string): Promise<void> {
  await superdoc.page.locator('[data-item="btn-textAlign"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator(`[data-item="btn-textAlign-option"][aria-label="${ariaLabel}"]`).click();
  await superdoc.waitForStable();
}

// SD-3094 + ECMA-376 §17.6.1 (section bidi): when the section has w:bidi
// but the paragraph itself does NOT, the section bidi must NOT affect
// paragraph w:jc interpretation. The spec is explicit: "This property
// only affects section-level properties, and does not affect the layout
// of text within the contents of this section."
//
// Practical implication: clicking "Align Left" on such a paragraph
// should write w:jc="left" unchanged (the paragraph isn't RTL even
// though its section is).
test('Align Left on a non-bidi paragraph inside an RTL section stores w:jc="left" unchanged', async ({ superdoc }) => {
  await superdoc.loadDocument(SECTION_BIDI_DOC);
  await superdoc.waitForStable();

  const line = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'jc=right' })
    .first();
  await line.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align left');
  // No mirror: stored value is 'left' (the display value), not 'right'.
  await superdoc.assertTextAlignment('jc=right', 'left');
});

test('Align Right on a non-bidi paragraph inside an RTL section stores w:jc="right" unchanged', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(SECTION_BIDI_DOC);
  await superdoc.waitForStable();

  const line = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'jc=left' })
    .first();
  await line.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align right');
  await superdoc.assertTextAlignment('jc=left', 'right');
});
