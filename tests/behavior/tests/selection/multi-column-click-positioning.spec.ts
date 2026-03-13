import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/two-column-simple.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Two-column fixture not available');

test.use({ config: { toolbar: 'none', showCaret: true, showSelection: true } });

test('clicking in second column does not crash (SD-1830 / IT-407)', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Get the first page bounding box to compute column positions
  const page = superdoc.page.locator('.superdoc-page').first();
  const pageBox = await page.boundingBox();
  if (!pageBox) throw new Error('Page not visible');

  // Click near the top of the second column (right half of page).
  // This is exactly where the customer reported the crash (IT-407):
  // "the first paragraph at the top of the second column"
  const secondColumnX = pageBox.x + pageBox.width * 0.75;
  const topOfColumnY = pageBox.y + 40;

  // Without the fix this throws: TypeError: can't access property "fromRun", line is undefined
  await superdoc.page.mouse.click(secondColumnX, topOfColumnY);
  await superdoc.waitForStable();

  // Cursor should be at a valid position (not crashed, not zero)
  const sel = await superdoc.getSelection();
  expect(sel.from).toBeGreaterThan(0);
});

test('clicking in both columns places cursor at different positions', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const page = superdoc.page.locator('.superdoc-page').first();
  const pageBox = await page.boundingBox();
  if (!pageBox) throw new Error('Page not visible');

  // Click well into the text area of the first column (left quarter, middle of page height)
  const firstColumnX = pageBox.x + pageBox.width * 0.25;
  const clickY = pageBox.y + pageBox.height * 0.5;

  await superdoc.page.mouse.click(firstColumnX, clickY);
  await superdoc.waitForStable();
  const selLeft = await superdoc.getSelection();

  // Click at the same Y in the second column (right quarter)
  const secondColumnX = pageBox.x + pageBox.width * 0.75;

  await superdoc.page.mouse.click(secondColumnX, clickY);
  await superdoc.waitForStable();
  const selRight = await superdoc.getSelection();

  // Both should be valid positions
  expect(selLeft.from).toBeGreaterThan(0);
  expect(selRight.from).toBeGreaterThan(0);

  // Cursor should land at different positions — text flows left column then right column,
  // so the right column position should be further into the document.
  expect(selRight.from).not.toBe(selLeft.from);
});

test('typing after clicking in second column inserts text (SD-1830)', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const page = superdoc.page.locator('.superdoc-page').first();
  const pageBox = await page.boundingBox();
  if (!pageBox) throw new Error('Page not visible');

  // Click in the second column
  const secondColumnX = pageBox.x + pageBox.width * 0.75;
  const topOfColumnY = pageBox.y + 40;

  await superdoc.page.mouse.click(secondColumnX, topOfColumnY);
  await superdoc.waitForStable();

  // Type a unique marker to prove the cursor is functional
  await superdoc.type('MARKER');
  await superdoc.waitForStable();

  // The marker should appear in the document
  const text = await superdoc.getTextContent();
  expect(text).toContain('MARKER');
});
