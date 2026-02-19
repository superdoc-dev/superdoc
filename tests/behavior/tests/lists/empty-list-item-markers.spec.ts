import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/lists/sd-1543-empty-list-items.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('empty list items show markers and accept typed content', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // List markers should be present in the loaded document
  const markers = superdoc.page.locator('.superdoc-paragraph-marker');
  const markerCount = await markers.count();
  expect(markerCount).toBeGreaterThan(0);

  // Type into an empty list item (pos 229 is an empty paragraph in the list,
  // cursor inside it is at pos 230)
  await superdoc.clickOnLine(0); // focus the editor first
  await superdoc.setTextSelection(230);
  await superdoc.waitForStable();
  await superdoc.type('New content in empty list item');
  await superdoc.waitForStable();

  // Typed text should appear in the document
  await superdoc.assertTextContains('New content in empty list item');

  // Markers should still be present
  const markersAfter = await superdoc.page.locator('.superdoc-paragraph-marker').count();
  expect(markersAfter).toBeGreaterThan(0);

  await superdoc.snapshot('empty-list-item-markers');
});
