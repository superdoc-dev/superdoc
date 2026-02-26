import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges, listComments } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('@behavior SD-1997: floating comment bubbles render after tracked changes', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Switch to suggesting mode so edits create tracked changes
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Create several tracked changes
  for (let i = 0; i < 5; i++) {
    await superdoc.type(`tracked change ${i + 1}`);
    await superdoc.newLine();
    await superdoc.waitForStable();
  }

  // Verify tracked changes were created
  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total)
    .toBeGreaterThanOrEqual(5);

  // Verify floating comment placeholders appear in the sidebar
  const placeholders = superdoc.page.locator('.comment-placeholder');
  await expect(placeholders.first()).toBeAttached({ timeout: 10_000 });

  const count = await placeholders.count();
  expect(count).toBeGreaterThanOrEqual(5);

  // Verify at least one CommentDialog is mounted (visible near viewport)
  const dialogs = superdoc.page.locator('.comment-placeholder .comments-dialog');
  await expect(dialogs.first()).toBeAttached({ timeout: 10_000 });
});

test('@behavior SD-1997: typing does not flicker floating comments', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Create a tracked change in suggesting mode
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.type('initial tracked change');
  await superdoc.waitForStable();

  // Wait for the floating comment to appear
  const placeholders = superdoc.page.locator('.comment-placeholder');
  await expect(placeholders.first()).toBeAttached({ timeout: 10_000 });

  const initialCount = await placeholders.count();
  expect(initialCount).toBeGreaterThanOrEqual(1);

  // Now type more text — placeholders should remain in the DOM (no flicker)
  await superdoc.newLine();
  await superdoc.type('more text here');

  // Placeholders should still be attached without disappearing
  await expect(placeholders.first()).toBeAttached();
  const afterTypingCount = await placeholders.count();
  expect(afterTypingCount).toBeGreaterThanOrEqual(initialCount);

  // Verify the comment dialog content is still visible (not unmounted/remounted empty)
  const dialog = superdoc.page.locator('.comment-placeholder .comments-dialog');
  await expect(dialog.first()).toBeAttached({ timeout: 5_000 });
});
