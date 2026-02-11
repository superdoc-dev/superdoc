import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data/rendering');

test.use({ config: { hideSelection: false } });

test('@behavior select all in complex document', async ({ superdoc }) => {
  await superdoc.loadDocument(path.join(DOCS_DIR, 'advanced-tables.docx'));
  await superdoc.screenshot('select-all-loaded');

  await superdoc.selectAll();
  await superdoc.screenshot('select-all-selected');
});
