import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.resolve(__dirname, '../formatting/fixtures/rtl-heading-alignment.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

async function clickAlignment(superdoc: SuperDocFixture, ariaLabel: string): Promise<void> {
  await superdoc.page.locator('[data-item="btn-textAlign"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator(`[data-item="btn-textAlign-option"][aria-label="${ariaLabel}"]`).click();
  await superdoc.waitForStable();
}

// SD-3094: setTextAlign + the doc-api setAlignment paths both apply to
// heading nodes (not just body paragraphs). Verify the RTL mirror logic
// works the same for headings as for paragraphs when w:bidi is set.

test('Align Left on RTL heading stores OOXML w:jc="right" (writer mirror)', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC);
  await superdoc.waitForStable();

  const heading = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'Heading 1' })
    .first();
  await heading.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align left');
  await superdoc.assertTextAlignment('Heading 1', 'right');
});

test('Align Right on RTL heading stores OOXML w:jc="left" (writer mirror)', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC);
  await superdoc.waitForStable();

  const heading = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'Heading 2' })
    .first();
  await heading.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align right');
  await superdoc.assertTextAlignment('Heading 2', 'left');
});
