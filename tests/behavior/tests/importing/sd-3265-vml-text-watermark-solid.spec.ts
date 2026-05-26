import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/rendering/sd-3265-vml-text-watermark-solid.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('imports a Word-native solid VML watermark with full opacity (SD-3265)', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  const watermark = superdoc.page.locator('.superdoc-page img[src^="data:image/svg+xml"]').first();
  await expect(watermark).toBeVisible();

  const src = await watermark.getAttribute('src');
  expect(src).toBeTruthy();
  const svg = src!.startsWith('data:image/svg+xml;base64,')
    ? Buffer.from(src!.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')
    : decodeURIComponent(src!.replace('data:image/svg+xml;utf8,', ''));

  expect(svg).toContain('fill-opacity="1"');
  expect(svg).toContain('SOLID');
});
