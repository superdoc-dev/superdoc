import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.resolve(__dirname, '../formatting/fixtures/rtl-table-cell-alignment.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

async function clickAlignment(superdoc: SuperDocFixture, ariaLabel: string): Promise<void> {
  await superdoc.page.locator('[data-item="btn-textAlign"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator(`[data-item="btn-textAlign-option"][aria-label="${ariaLabel}"]`).click();
  await superdoc.waitForStable();
}

// SD-3094: paragraphs inside RTL-direction table cells should be treated
// the same as standalone RTL paragraphs by the alignment writer. The
// fixture is a bidiVisual table with Hebrew cell content; clicking
// Align Left on a cell paragraph should store w:jc="right" if the cell
// content is recognized as RTL.

test('Align Left on a Hebrew cell stores w:jc="right" (writer mirror under cell-level RTL)', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC);
  await superdoc.waitForStable();

  const cellLine = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'תא 1' })
    .first();
  await cellLine.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align left');
  await superdoc.assertTextAlignment('תא 1', 'right');
});
