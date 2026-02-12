import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/formatting/sd-1727-formatting-lost.docx');

test.use({ config: { toolbar: 'full', hideCaret: false, hideSelection: false } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available (R2)');

test('@behavior toggle bold off retains other formatting', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.screenshot('toggle-format-initial');

  await superdoc.selectAll();
  await superdoc.waitForStable();
  await superdoc.screenshot('toggle-format-selected');

  await superdoc.bold();
  await superdoc.press('ArrowRight');
  await superdoc.waitForStable();
  await superdoc.screenshot('toggle-format-bold-applied');

  await superdoc.bold();
  await superdoc.waitForStable();
  await superdoc.screenshot('toggle-format-bold-off');

  await superdoc.press('Enter');
  await superdoc.italic();
  await superdoc.type('hello italic');
  await superdoc.waitForStable();
  await superdoc.screenshot('toggle-format-italic-typed');
});
