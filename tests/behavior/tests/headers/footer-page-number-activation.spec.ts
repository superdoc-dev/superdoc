import { fileURLToPath } from 'node:url';
import { expect, test } from '../../fixtures/superdoc.js';
import { listTrackChanges } from '../../helpers/document-api.js';
import { activateFooter, getActiveStoryText } from '../../helpers/story-surfaces.js';

const FOOTER_PAGE_NUMBER_DOC_PATH = fileURLToPath(new URL('./fixtures/rtl-page-numpages.docx', import.meta.url));

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

test('editing footer with page-number content is safe (single expected tracked change)', async ({ superdoc }) => {
  await superdoc.loadDocument(FOOTER_PAGE_NUMBER_DOC_PATH);
  await superdoc.waitForStable();

  await activateFooter(superdoc);
  await superdoc.waitForStable();

  const beforeText = (await getActiveStoryText(superdoc.page)) ?? '';

  // One keystroke in suggesting mode should create exactly one tracked change.
  await superdoc.page.keyboard.type('X');
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total).toBe(1);

  const afterText = (await getActiveStoryText(superdoc.page)) ?? '';
  expect(afterText.length).toBeGreaterThanOrEqual(beforeText.length);
  expect(afterText).toContain('X');
});
