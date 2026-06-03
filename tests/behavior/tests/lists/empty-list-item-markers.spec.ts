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

  // Find the first empty list line (a .superdoc-line inside a list with no visible text).
  const emptyLineIndex = await superdoc.page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.superdoc-line'));
    return lines.findIndex((line) => {
      const hasMarker = line.querySelector('.superdoc-paragraph-marker') !== null;
      const textContent = (line.textContent ?? '').replace(/[\s\u200B]/g, '');
      // A line is "empty" if it has a list marker but the text portion is blank.
      // Subtract the marker text to check only the content area.
      const markerText = line.querySelector('.superdoc-paragraph-marker')?.textContent ?? '';
      const contentOnly = textContent.replace(markerText.replace(/\s/g, ''), '');
      return hasMarker && contentOnly.length === 0;
    });
  });
  expect(emptyLineIndex).toBeGreaterThanOrEqual(0);

  // Click into that empty line to position cursor
  await superdoc.clickOnLine(emptyLineIndex);
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
