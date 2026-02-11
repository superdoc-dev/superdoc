import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/formatting/sd-1778-apply-font.docx');

test.use({ config: { toolbar: 'full' } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available (R2)');

test('@behavior apply Courier New font to selected text', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.selectAll();
  await superdoc.waitForStable();

  await superdoc.executeCommand('setFontFamily', { fontFamily: 'Courier New' });
  await superdoc.waitForStable();
  await superdoc.screenshot('apply-font-courier');
});
