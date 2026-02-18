/**
 * Auto-discovers all .docx files in test-data/rendering/ and generates
 * a pixel comparison test for each one. Drop a file in the folder = new test.
 *
 * Naming convention: <issue-id>-<description>.docx (e.g. sd-1679-anchor-table-overlap.docx)
 * General coverage docs can omit the issue ID (e.g. advanced-text.docx).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../test-data/rendering');

const docs = fs.existsSync(DOCS_DIR)
  ? fs
      .readdirSync(DOCS_DIR)
      .filter((f) => f.endsWith('.docx'))
      .sort()
  : [];

for (const doc of docs) {
  const name = path.basename(doc, '.docx');

  test(`@rendering ${name}`, async ({ superdoc }) => {
    await superdoc.loadDocument(path.join(DOCS_DIR, doc));
    await superdoc.screenshotPages(`rendering/${name}`);
  });
}
