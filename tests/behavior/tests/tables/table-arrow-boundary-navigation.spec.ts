import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showCaret: true, showSelection: true } });

const TEST_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../test-data/tables/sd-2236-table-arrow-key-navigation.docx',
);

test.skip(!fs.existsSync(TEST_FILE), 'Test document not available — run pnpm corpus:pull');

test('ArrowRight from the end of the bottom-right table cell exits to the paragraph after the table', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(TEST_FILE);

  const testingPos = await superdoc.findTextPos('Testing');
  const afterTablePos = await superdoc.findTextPos('This is more text after the table');

  await superdoc.setTextSelection(testingPos + 'Testing'.length);
  await superdoc.waitForStable();
  await superdoc.assertSelection(testingPos + 'Testing'.length);

  const hiddenEditor = superdoc.page.locator('[contenteditable="true"]').first();
  await hiddenEditor.focus();
  await superdoc.press('ArrowRight');
  await superdoc.waitForStable();

  await superdoc.assertSelection(afterTablePos);
});

test('ArrowLeft from the paragraph after the table re-enters the bottom-right table cell', async ({ superdoc }) => {
  await superdoc.loadDocument(TEST_FILE);

  const testingPos = await superdoc.findTextPos('Testing');
  const afterTablePos = await superdoc.findTextPos('This is more text after the table');

  await superdoc.setTextSelection(testingPos + 'Testing'.length);
  await superdoc.waitForStable();
  await superdoc.assertSelection(testingPos + 'Testing'.length);

  const hiddenEditor = superdoc.page.locator('[contenteditable="true"]').first();
  await hiddenEditor.focus();

  await superdoc.press('ArrowRight');
  await superdoc.waitForStable();
  await superdoc.assertSelection(afterTablePos);

  await superdoc.press('ArrowLeft');
  await superdoc.waitForStable();
  await superdoc.assertSelection(testingPos + 'Testing'.length);
});
