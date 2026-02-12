import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/comments-tcs/tracked-changes.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test('@behavior tracked change replacement in existing document', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.screenshot('tc-existing-doc-loaded');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select first line and type replacement
  await superdoc.tripleClickLine(0);

  await superdoc.waitForStable();
  await superdoc.type('programmatically inserted');
  await superdoc.waitForStable();
  await superdoc.screenshot('tc-existing-doc-replaced');
});
