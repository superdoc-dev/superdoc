import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentViaUIWithId } from '../../helpers/comments.js';
import { assertDocumentApiReady, replyToComment } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

// WebKit: v-click-outside fights with $patch-based activation after replyToComment
// calls shift activeComment to a child ID, making the is-active class unstable.
test.fixme(
  ({ browserName }) => browserName === 'webkit',
  'v-click-outside races with programmatic activation on WebKit',
);

test('thread with 2+ replies collapses and expands on click', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Type text and add a comment through the UI
  await superdoc.type('collapse test paragraph');
  await superdoc.waitForStable();

  const commentId = await addCommentViaUIWithId(superdoc, {
    textToSelect: 'collapse',
    commentText: 'parent comment',
  });

  // Add 4 replies to trigger collapse (threshold is childComments.length >= 2)
  await replyToComment(superdoc.page, { parentCommentId: commentId, text: 'reply one' });
  await replyToComment(superdoc.page, { parentCommentId: commentId, text: 'reply two' });
  await replyToComment(superdoc.page, { parentCommentId: commentId, text: 'reply three' });
  await replyToComment(superdoc.page, { parentCommentId: commentId, text: 'reply four' });
  await superdoc.waitForStable();

  // Re-assert highlight exists — replies trigger re-renders that may temporarily remove highlights
  await superdoc.assertCommentHighlightExists({ text: 'collapse', timeoutMs: 10_000 });

  // Deactivate first so the dialog renders in collapsed state, then re-activate.
  // On Firefox, replyToComment shifts activeComment to a child ID which can leave
  // the thread in an expanded state.
  await superdoc.page.evaluate(() => {
    const sd = (window as any).superdoc;
    sd.commentsStore.$patch({ activeComment: null });
  });
  await superdoc.waitForStable();

  // Activate parent thread deterministically (avoid click-path races in Firefox).
  await superdoc.page.evaluate((id: string) => {
    const sd = (window as any).superdoc;
    sd.commentsStore.$patch({ activeComment: id });
  }, commentId);
  await superdoc.waitForStable();

  const dialog = superdoc.page.locator(`.comment-placeholder[data-comment-id="${commentId}"] .comments-dialog`).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // The collapsed-replies pill should be visible with "more replies" text
  const collapsedPill = dialog.locator('.collapsed-replies');
  await expect(collapsedPill).toBeVisible({ timeout: 10_000 });
  await expect(collapsedPill).toContainText('more replies');

  // In collapsed state: parent + last reply = 2 visible conversation items
  await expect(dialog.locator('.conversation-item')).toHaveCount(2);

  // Click the collapsed pill to expand all replies
  await collapsedPill.click();
  await superdoc.waitForStable();

  // All 5 conversation items should now be visible (parent + 4 replies)
  await expect(dialog.locator('.conversation-item')).toHaveCount(5);

  // The collapsed pill should be gone
  await expect(collapsedPill).not.toBeVisible();
});
