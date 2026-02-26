import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentViaUIWithId, activeCommentDialog } from '../../helpers/comments.js';
import { assertDocumentApiReady, replyToComment } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('thread with 3+ replies collapses and expands on click', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Type text and add a comment through the UI
  await superdoc.type('collapse test paragraph');
  await superdoc.waitForStable();

  const commentId = await addCommentViaUIWithId(superdoc, {
    textToSelect: 'collapse',
    commentText: 'parent comment',
  });

  // Add 4 replies to trigger collapse (threshold is childComments.length >= 3)
  await replyToComment(superdoc.page, { parentCommentId: commentId, text: 'reply one' });
  await replyToComment(superdoc.page, { parentCommentId: commentId, text: 'reply two' });
  await replyToComment(superdoc.page, { parentCommentId: commentId, text: 'reply three' });
  await replyToComment(superdoc.page, { parentCommentId: commentId, text: 'reply four' });
  await superdoc.waitForStable();

  // Re-assert highlight exists — replies trigger re-renders that may temporarily remove highlights
  await superdoc.assertCommentHighlightExists({ text: 'collapse', timeoutMs: 10_000 });

  // Click the comment highlight to activate the dialog
  await superdoc.clickOnCommentedText('collapse');
  await superdoc.waitForStable();

  const dialog = activeCommentDialog(superdoc.page);
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // The collapsed-replies pill should be visible with "more replies" text
  const collapsedPill = dialog.locator('.collapsed-replies');
  await expect(collapsedPill).toBeVisible({ timeout: 5_000 });
  await expect(collapsedPill).toContainText('more replies');

  // In collapsed state: parent + first reply + last reply = 3 visible conversation items
  await expect(dialog.locator('.conversation-item')).toHaveCount(3);

  // Click the collapsed pill to expand all replies
  await collapsedPill.click();
  await superdoc.waitForStable();

  // All 5 conversation items should now be visible (parent + 4 replies)
  await expect(dialog.locator('.conversation-item')).toHaveCount(5);

  // The collapsed pill should be gone
  await expect(collapsedPill).not.toBeVisible();
});
