import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../test-data/rendering');

test('@rendering basic document renders correctly', async ({ superdoc }) => {
  await superdoc.loadDocument(path.join(DOCS_DIR, 'advanced-text.docx'));
  await superdoc.screenshotPages('rendering/advanced-text');
});

test('@rendering table document renders correctly', async ({ superdoc }) => {
  await superdoc.loadDocument(path.join(DOCS_DIR, 'advanced-tables.docx'));
  await superdoc.screenshotPages('rendering/advanced-tables');
});
