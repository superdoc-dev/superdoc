import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, getDocumentText } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(
  __dirname,
  '../../test-data/rendering/sd-2440-field-based-toc-list-of-tables-figures.docx',
);

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test.use({ config: { toolbar: 'full', comments: 'off' } });

test('loads document with field-based TOC list of tables/figures without schema errors (SD-2440)', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  const text = await getDocumentText(superdoc.page);
  expect(text.length).toBeGreaterThan(0);

  await expect(superdoc.page.locator('.superdoc-page').first()).toBeVisible();
  await expect(superdoc.page.locator('.superdoc-line').first()).toBeVisible();
});
