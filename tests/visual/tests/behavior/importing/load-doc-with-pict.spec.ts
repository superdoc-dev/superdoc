import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/importing/sd-1558-fld-char-issue.docx');

test.use({ config: { comments: 'off' } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available (R2)');

test('@behavior load document with w:pict elements without schema errors', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await superdoc.screenshot('load-pict-loaded');

  // Screenshot first 5 pages (doc has 6+, later pages may not render in time)
  await superdoc.screenshotPages('importing/load-pict', 5);
});
