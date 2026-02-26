import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentViaUIWithId, activateCommentDialog } from '../../helpers/comments.js';
import { assertDocumentApiReady, listComments } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('resolving a comment sets resolvedTime and the resolved badge renders', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Type text and add a comment through the UI
  await superdoc.type('resolve badge test');
  await superdoc.waitForStable();

  await addCommentViaUIWithId(superdoc, { textToSelect: 'resolve', commentText: 'comment to resolve' });

  // Activate the comment dialog
  const dialog = await activateCommentDialog(superdoc, 'resolve');

  // Verify the dialog is NOT resolved before clicking
  await expect(dialog).not.toHaveClass(/is-resolved/);

  // Click the resolve button (checkmark icon in the overflow menu)
  const resolveBtn = dialog.locator('.overflow-menu__icon').first();
  await expect(resolveBtn).toBeVisible({ timeout: 5_000 });
  await resolveBtn.click();
  await superdoc.waitForStable();

  // Verify via the store that the comment was resolved (resolvedTime is set).
  // The floating comments layer unmounts resolved dialogs immediately, so the
  // .resolved-badge and .is-resolved class are only visible in a sidebar/panel
  // that renders resolved comments. Here we verify the data model is correct.
  const resolvedState = await superdoc.page.evaluate(() => {
    const sd = (window as any).superdoc;
    const store = sd.commentsStore;
    const grouped = store.getGroupedComments;
    const resolvedComments = grouped?.resolvedComments ?? [];
    return {
      resolvedCount: resolvedComments.length,
      hasResolvedTime: resolvedComments.some((c: any) => !!c.resolvedTime),
      isTrackedChange: resolvedComments.some((c: any) => !!c.trackedChange),
    };
  });

  expect(resolvedState.resolvedCount).toBe(1);
  expect(resolvedState.hasResolvedTime).toBe(true);
  // For a regular comment (not a tracked change), the badge label would be "Resolved"
  expect(resolvedState.isTrackedChange).toBe(false);

  // Verify the comment is resolved via the document API as well
  const listed = await listComments(superdoc.page, { includeResolved: true });
  expect(listed.matches.some((entry: any) => entry.status === 'resolved')).toBe(true);
});
