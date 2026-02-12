import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/lists/sd-1658-lists-same-level.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available (R2)');

test('@behavior list items with same indicator at same level render correctly', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.screenshot('same-level-same-indicator');
});
