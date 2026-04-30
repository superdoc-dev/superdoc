import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../../fixtures/superdoc.js';
import { listTrackChanges } from '../../helpers/document-api.js';
import { activateFooter } from '../../helpers/story-surfaces.js';

const FOOTER_PAGE_NUMBER_DOC_PATH = fileURLToPath(
  new URL('../../test-data/footer-page-number-test.docx', import.meta.url),
);

test.skip(!fs.existsSync(FOOTER_PAGE_NUMBER_DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    documentMode: 'suggesting',
    showCaret: true,
    showSelection: true,
  },
});

test('activating a footer with page-number content does not create a tracked change', async ({ superdoc }) => {
  await superdoc.loadDocument(FOOTER_PAGE_NUMBER_DOC_PATH);
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total).toBe(0);

  await activateFooter(superdoc);
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total).toBe(0);
});
