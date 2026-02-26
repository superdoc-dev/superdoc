import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentViaUI, activateCommentDialog } from '../../helpers/comments.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('reply via the reply pill adds a reply to the thread', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Type text and add a comment through the UI
  await superdoc.type('hello world');
  await superdoc.waitForStable();

  await addCommentViaUI(superdoc, { textToSelect: 'world', commentText: 'initial comment' });
  await superdoc.assertCommentHighlightExists({ text: 'world' });

  // Activate the comment dialog
  const dialog = await activateCommentDialog(superdoc, 'world');

  // The reply pill should be visible in the active dialog
  const replyPill = dialog.locator('.reply-pill');
  await expect(replyPill).toBeVisible({ timeout: 5_000 });

  // Click the reply pill to expand the reply input
  await replyPill.click();
  await superdoc.waitForStable();

  // The expanded reply input should appear and the pill should be gone
  await expect(dialog.locator('.reply-expanded .reply-input-wrapper')).toBeVisible({ timeout: 5_000 });
  await expect(replyPill).not.toBeVisible();

  // Type reply text and submit
  await dialog.locator('.reply-expanded .reply-input-wrapper .superdoc-field').first().click();
  await superdoc.page.keyboard.type('this is a reply');
  await superdoc.waitForStable();

  await dialog.locator('.reply-btn-primary', { hasText: 'Reply' }).click();
  await superdoc.waitForStable();

  // Re-activate the dialog after reply submission
  const reactivatedDialog = await activateCommentDialog(superdoc, 'world');
  await expect.poll(async () => reactivatedDialog.locator('.conversation-item').count()).toBeGreaterThanOrEqual(2);
  await expect(reactivatedDialog.locator('.comment-body .comment').last()).toContainText('this is a reply');
});
