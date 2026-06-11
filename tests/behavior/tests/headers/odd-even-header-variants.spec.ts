import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../../fixtures/superdoc.js';

// This test verifies the per-page header-variant selection behavior for documents
// with `w:evenAndOddHeaders` enabled. The layout engine picks the correct header
// rId per document page (odd pages use the default/odd header, even pages use the
// even header), and the DomPainter renders the correct header text per page.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `h_f-normal-odd-even.docx` (test-corpus/pagination/) has:
//   - settings.xml: <w:evenAndOddHeaders/>
//   - header default (rId8) text:  "1 | Odd page |  header, page numbers at the right"
//   - header even    (rId7) text:  "2 | Even page header, page numbers at the right"
//   - 110 paragraphs → many rendered pages
//   - No titlePg, so page 1 uses the default (odd) header.
const DOC_PATH = path.resolve(__dirname, '../../test-data/pagination/h_f-normal-odd-even.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm --dir tests/visual docs:download');

test('odd/even pages render the correct header variant per document page number', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const pages = superdoc.page.locator('.superdoc-page[data-page-number]');
  await expect(pages.first()).toBeVisible({ timeout: 15_000 });

  // Need at least three pages to observe the odd → even → odd alternation.
  await expect.poll(async () => await pages.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);

  const pageCount = await pages.count();

  // Page 1 — docPN=1, odd, no titlePg → default variant (rId8) → "Odd page" text.
  const page1Header = pages.nth(0).locator('.superdoc-page-header');
  await expect(page1Header).toContainText('Odd page');
  await expect(page1Header).not.toContainText('Even page');

  // Page 2 — docPN=2, even → even variant (rId7) → "Even page" text.
  const page2Header = pages.nth(1).locator('.superdoc-page-header');
  await expect(page2Header).toContainText('Even page');
  await expect(page2Header).not.toContainText('Odd page');

  // Page 3 — docPN=3, odd → default variant again → "Odd page" text.
  // This is what confirms the alternation is driven by documentPageNumber, not
  // a one-off flag.
  const page3Header = pages.nth(2).locator('.superdoc-page-header');
  await expect(page3Header).toContainText('Odd page');
  await expect(page3Header).not.toContainText('Even page');

  // Spot-check the data-block-id on each header so the test also catches
  // regressions that produce the right TEXT but from the wrong rId (e.g., if
  // every page linked to the same header fragment).
  const page1BlockId = await page1Header.locator('[data-block-id]').first().getAttribute('data-block-id');
  const page2BlockId = await page2Header.locator('[data-block-id]').first().getAttribute('data-block-id');
  const page3BlockId = await page3Header.locator('[data-block-id]').first().getAttribute('data-block-id');

  expect(page1BlockId, 'page 1 should use a different header fragment than page 2').not.toBe(page2BlockId);
  expect(page1BlockId, 'page 1 and page 3 should use the same (default/odd) header fragment').toBe(page3BlockId);

  // Bonus: if the doc produced enough pages, page 4 should alternate back to even.
  if (pageCount >= 4) {
    const page4Header = pages.nth(3).locator('.superdoc-page-header');
    await expect(page4Header).toContainText('Even page');
  }
});

test('footers follow the same odd/even alternation as headers', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const pages = superdoc.page.locator('.superdoc-page[data-page-number]');
  await expect.poll(async () => await pages.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);

  // Footers aren't always in the initial viewport; scroll to each page to make
  // sure the footer is mounted before asserting.
  for (const [idx, expected] of [
    [0, 'Odd page'],
    [1, 'Even'],
    [2, 'Odd page'],
  ] as const) {
    const pageEl = pages.nth(idx);
    await pageEl.scrollIntoViewIfNeeded();
    const footer = pageEl.locator('.superdoc-page-footer');
    await expect(footer).toContainText(expected);
  }
});
