import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/svg-image.docx');

test.use({ config: { toolbar: 'full', comments: 'off' } });

test('loads DOCX with SVG image and renders it with the correct MIME type', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  await expect(superdoc.page.locator('.superdoc-page').first()).toBeVisible();

  const mediaEntry = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const media = editor?.storage?.image?.media ?? {};
    const svgKey = Object.keys(media).find((k) => k.toLowerCase().endsWith('.svg'));
    return svgKey ? { key: svgKey, value: media[svgKey] } : null;
  });

  expect(mediaEntry, 'imported SVG should be registered in editor.storage.image.media').not.toBeNull();
  expect(mediaEntry!.value, 'SVG data URI must use the image/svg+xml MIME type').toMatch(
    /^data:image\/svg\+xml;base64,/,
  );

  const imgSrc = await superdoc.page.locator('img').first().getAttribute('src');
  expect(imgSrc, 'rendered <img> should resolve to the SVG data URI').toMatch(/^data:image\/svg\+xml;base64,/);
});
