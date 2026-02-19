import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('SD-1739 tracked change replacement does not duplicate text in bubble', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('editing');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select "editing" and replace with "redlining"
  await superdoc.tripleClickLine(0);
  await superdoc.waitForStable();
  await superdoc.type('redlining');
  await superdoc.waitForStable();

  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total)
    .toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);

  // The floating dialog should show the tracked change with correct text
  // (Bug SD-1739 would show "Added: redliningg" with duplicated trailing char)
  const dialog = superdoc.page.locator('.floating-comment > .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text'),
  });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // "Added:" label with "redlining" text — must NOT contain "redliningg"
  const addedText = dialog.locator('.tracked-change-text').first();
  await expect(addedText).toContainText('redlining');
  // Verify exact text doesn't have the duplication bug
  const textContent = await addedText.textContent();
  expect(textContent).not.toContain('redliningg');

  // "Deleted:" label with "editing" text
  await expect(dialog.locator('.change-type', { hasText: 'Deleted' }).first()).toBeVisible();

  await superdoc.snapshot('tracked-change-replacement-bubble');
});
