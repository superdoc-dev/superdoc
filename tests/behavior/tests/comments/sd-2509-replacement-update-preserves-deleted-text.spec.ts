import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('SD-2509 replacement bubble preserves deleted text after follow-up edits', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Type baseline text in editing mode
  await superdoc.type('original');
  await superdoc.waitForStable();

  // Switch to suggesting mode and replace
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.tripleClickLine(0);
  await superdoc.waitForStable();
  await superdoc.type('replacement');
  await superdoc.waitForStable();

  // Wait for the tracked change to appear
  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total)
    .toBeGreaterThanOrEqual(1);

  // The bubble should show both the deleted and inserted text
  const dialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text'),
  });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const deletedText = dialog.locator('.tracked-change-text.is-deleted');
  const insertedText = dialog.locator('.tracked-change-text.is-inserted');

  // Both sides of the replacement must be visible
  await expect(deletedText).toBeVisible();
  await expect(deletedText).toContainText('original');
  await expect(insertedText).toContainText('replacement');

  // Type more inside the insertion to trigger update transactions with insert-only meta.
  // This is the SD-2509 bug scenario: subsequent keystrokes fire updates where only
  // insertedMark is in the transaction meta, but both marks still exist in the document.
  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.type(' extra');
  await superdoc.waitForStable();

  // The deleted text must still be visible after the update
  await expect(deletedText).toBeVisible();
  await expect(deletedText).toContainText('original');
  await expect(insertedText).toContainText('replacement extra');

  await superdoc.snapshot('sd-2509-replacement-update-preserves-deleted-text');
});
