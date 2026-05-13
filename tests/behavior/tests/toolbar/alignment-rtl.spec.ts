import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RTL_DOC = path.resolve(__dirname, '../formatting/fixtures/rtl-paragraph-alignment.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

async function clickAlignment(superdoc: SuperDocFixture, ariaLabel: string): Promise<void> {
  await superdoc.page.locator('[data-item="btn-textAlign"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator(`[data-item="btn-textAlign-option"][aria-label="${ariaLabel}"]`).click();
  await superdoc.waitForStable();
}

// SD-3094: toolbar writer must mirror display alignment to the stored OOXML
// value on RTL paragraphs (per ECMA-376 §17.3.1.13: left = leading edge =
// stored 'right' in RTL). Visual rendering is verified separately by the
// rtl-paragraph-alignment-import.spec.ts that ships with SD-3093.

test('clicking Align Left on RTL paragraph stores OOXML w:jc="right"', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_DOC);
  await superdoc.waitForStable();

  const line = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'jc=center' })
    .first();
  await line.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align left');
  await superdoc.assertTextAlignment('jc=center', 'right');
});

test('clicking Align Right on RTL paragraph stores OOXML w:jc="left"', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_DOC);
  await superdoc.waitForStable();

  const line = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'jc=center' })
    .first();
  await line.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align right');
  await superdoc.assertTextAlignment('jc=center', 'left');
});

test('clicking Justify on RTL paragraph stores OOXML w:jc="both" (normalized)', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_DOC);
  await superdoc.waitForStable();

  const line = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'jc=center' })
    .first();
  await line.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Justify');
  // The doc-api normalizes OOXML 'both' to 'justify' on read.
  await superdoc.assertTextAlignment('jc=center', 'justify');
});

test('clicking Align Center on RTL paragraph stores OOXML w:jc="center" (no mirror)', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_DOC);
  await superdoc.waitForStable();

  const line = superdoc.page
    .locator('.superdoc-page .superdoc-fragment .superdoc-line')
    .filter({ hasText: 'jc=left' })
    .first();
  await line.click();
  await superdoc.waitForStable();

  await clickAlignment(superdoc, 'Align center');
  await superdoc.assertTextAlignment('jc=left', 'center');
});
