import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/comments-tcs/nested-comments-word.docx');

test.use({ config: { comments: 'panel', hideSelection: false } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available (R2)');

test('@behavior nested and overlapping comments from MS Word', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await superdoc.screenshot('nested-word-initial');

  await superdoc.clickOnCommentedText('modify');
  await superdoc.waitForStable();
  await superdoc.screenshot('nested-word-inner');

  await superdoc.clickOnCommentedText('Licensee');
  await superdoc.waitForStable();
  await superdoc.screenshot('nested-word-outer');

  await superdoc.clickOnCommentedText('proprietary');
  await superdoc.waitForStable();
  await superdoc.screenshot('nested-word-overlap-first');

  await superdoc.clickOnCommentedText('labels');
  await superdoc.waitForStable();
  await superdoc.screenshot('nested-word-overlap-second');

  await superdoc.clickOnLine(1, 50);
  await superdoc.waitForStable();
  await superdoc.screenshot('nested-word-deselected');
});
