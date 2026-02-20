import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/other/sd-1778-apply-font.docx');

test.use({ config: { toolbar: 'full' } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('apply Courier New font to selected text in loaded document', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const originalText = await superdoc.getTextContent();
  expect(originalText.length).toBeGreaterThan(0);

  // Focus editor by clicking into it, then select all
  await superdoc.clickOnLine(0);
  await superdoc.waitForStable();
  await superdoc.selectAll();
  await superdoc.waitForStable();

  // Apply font
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setFontFamily('Courier New');
  });
  await superdoc.waitForStable();

  // Text content should be unchanged
  await superdoc.assertTextContains(originalText.substring(0, 20));

  // Verify font applied via toolbar state for the current selection.
  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText('Courier New');

  await superdoc.snapshot('apply-font-courier');
});
