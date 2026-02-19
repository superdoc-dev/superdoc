import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/styles/sd-1727-formatting-lost.docx');

test.use({ config: { toolbar: 'full' } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('toggle bold off retains other formatting', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const originalText = await superdoc.getTextContent();
  expect(originalText.length).toBeGreaterThan(0);

  // Focus editor, then select all and apply bold
  await superdoc.clickOnLine(0);
  await superdoc.waitForStable();
  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.bold();
  await superdoc.waitForStable();

  // Verify bold mark is now present
  const firstChunk = originalText.substring(0, 5);
  await superdoc.assertTextHasMarks(firstChunk, ['bold']);

  // Toggle bold off on same selection
  await superdoc.selectAll();
  await superdoc.bold();
  await superdoc.waitForStable();

  // Bold mark should be removed
  await superdoc.assertTextLacksMarks(firstChunk, ['bold']);

  // Move cursor to end of current selection, then press Enter.
  // This avoids PM-specific doc-size introspection.
  await superdoc.press('ArrowRight');
  await superdoc.waitForStable();
  await superdoc.press('Enter');
  await superdoc.italic();
  await superdoc.type('hello italic');
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('[data-item="btn-italic"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-bold"]')).not.toHaveClass(/active/);

  await superdoc.snapshot('toggle-formatting-off');
});
