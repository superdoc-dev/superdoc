import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/lists/sd-1543-empty-list-items.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available (R2)');

test('@behavior empty list items show correct markers', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.screenshot('empty-list-markers-loaded');

  // Type into a later empty list item first (position 229)
  await superdoc.setTextSelection(229);
  await superdoc.waitForStable();
  await superdoc.type('item 2');
  await superdoc.waitForStable();
  await superdoc.screenshot('empty-list-markers-typed-item2');

  // Type into an earlier empty list item (position 34)
  await superdoc.setTextSelection(34);
  await superdoc.waitForStable();
  await superdoc.type('New content in empty list item');
  await superdoc.waitForStable();
  await superdoc.screenshot('empty-list-markers-typed-item1');
});
