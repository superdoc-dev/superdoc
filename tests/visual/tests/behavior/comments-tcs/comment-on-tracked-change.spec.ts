import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../../test-data');
const DOC_PATH = path.join(DOCS_DIR, 'behavior/comments-tcs/gdocs-comment-on-change.docx');

test.use({ config: { comments: 'panel', trackChanges: true, hideSelection: false } });

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available (R2)');

test('@behavior comment highlighting on tracked change text', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await superdoc.screenshot('comment-on-tc-initial');

  await superdoc.clickOnCommentedText('new text');
  await superdoc.waitForStable();
  await superdoc.screenshot('comment-on-tc-selected');

  await superdoc.clickOnCommentedText('Test');
  await superdoc.waitForStable();
  await superdoc.screenshot('comment-on-tc-regular');

  await superdoc.clickOnLine(4);
  await superdoc.waitForStable();
  await superdoc.screenshot('comment-on-tc-deselected');
});
