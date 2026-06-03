import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, getDocumentText } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/tiff-image.docx');

test.use({ config: { toolbar: 'full', comments: 'off' } });

test('loads DOCX with TIFF image and renders it as PNG', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  // Document text is present
  const text = await getDocumentText(superdoc.page);
  expect(text).toContain('TIFF test document');

  // Editor is functional — pages and lines rendered
  await expect(superdoc.page.locator('.superdoc-page').first()).toBeVisible();
  await expect(superdoc.page.locator('.superdoc-line').first()).toBeVisible();

  // The TIFF was converted to PNG — the rendered <img> should have a PNG data URI
  const imgSrc = await superdoc.page.locator('img').first().getAttribute('src');
  expect(imgSrc).toBeTruthy();
  expect(imgSrc).toContain('data:image/png');
});
