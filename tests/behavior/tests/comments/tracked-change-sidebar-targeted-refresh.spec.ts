import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

const commentsPanel = (superdoc: SuperDocFixture) => superdoc.page.locator('#comments-panel');
const insertedBubbleText = (superdoc: SuperDocFixture) =>
  commentsPanel(superdoc).locator('.tracked-change-text.is-inserted');
const deletedBubbleText = (superdoc: SuperDocFixture) =>
  commentsPanel(superdoc).locator('.tracked-change-text.is-deleted');

test('typing inside an existing tracked insertion refreshes the sidebar bubble', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type('hello');
  await superdoc.waitForStable();
  await expect.poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total).toBe(1);
  await expect(insertedBubbleText(superdoc)).toContainText('hello');

  const helloStart = await superdoc.findTextPos('hello');
  await superdoc.setTextSelection(helloStart + 2);
  await superdoc.type('X');
  await superdoc.waitForStable();

  await expect(insertedBubbleText(superdoc)).toContainText('heXllo');
});

test('typing inside an existing tracked replacement refreshes inserted text and preserves deleted text', async ({
  superdoc,
}) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('original');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();
  await superdoc.tripleClickLine(0);
  await superdoc.type('replacement');
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page, { type: 'replacement' })).total).toBe(1);
  await expect(insertedBubbleText(superdoc)).toContainText('replacement');
  await expect(deletedBubbleText(superdoc)).toContainText('original');

  const replacementStart = await superdoc.findTextPos('replacement');
  await superdoc.setTextSelection(replacementStart + 4);
  await superdoc.type('X');
  await superdoc.waitForStable();

  await expect(insertedBubbleText(superdoc)).toContainText('replXacement');
  await expect(deletedBubbleText(superdoc)).toContainText('original');
});
