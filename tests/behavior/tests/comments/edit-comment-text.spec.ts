import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listComments } from '../../helpers/document-api.js';
import { addCommentViaUI, activateCommentDialog } from '../../helpers/comments.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('editing a comment updates its text', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('hello comments');
  await superdoc.waitForStable();

  // Add a comment on "comments" through the UI
  await addCommentViaUI(superdoc, { textToSelect: 'comments', commentText: 'original comment' });

  // Activate the comment dialog
  const dialog = await activateCommentDialog(superdoc, 'comments');
  await expect(dialog.locator('.comment-body .comment').first()).toContainText('original comment');

  // Open the overflow "..." menu and click Edit
  await dialog.locator('.overflow-icon').click();
  await superdoc.waitForStable();

  const editOption = superdoc.page.locator('.n-dropdown-option-body__label', { hasText: 'Edit' });
  await expect(editOption.first()).toBeVisible({ timeout: 5_000 });
  await editOption.first().click();
  await superdoc.waitForStable();

  // The comment should now be in edit mode
  const editInput = dialog.locator('.comment-editing .superdoc-field');
  await expect(editInput).toBeVisible({ timeout: 5_000 });

  // Select all text in the edit input, then type the replacement
  await editInput.click();
  await superdoc.shortcut('a');
  await superdoc.page.keyboard.type('changed comment');
  await superdoc.waitForStable();

  // Click Update
  await dialog.locator('.comment-editing .sd-button.primary', { hasText: 'Update' }).click();
  await superdoc.waitForStable();

  // After update the dialog loses is-active; verify the text changed via the visible sidebar dialog
  const updatedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog');
  await expect(updatedDialog.locator('.comment-body .comment').first()).toContainText('changed comment', {
    timeout: 10_000,
  });
  // CommentInfo.text is optional in the contract — some adapters don't populate it.
  // Verify via the API when available; the DOM assertion above covers all adapters.
  const listed = await listComments(superdoc.page, { includeResolved: true });
  expect(listed.total).toBeGreaterThanOrEqual(1);
  const commentTexts = listed.matches.map((e) => e.text).filter(Boolean);
  if (commentTexts.length > 0) {
    expect(commentTexts).toContain('changed comment');
  }

  // Comment highlight should still exist
  await superdoc.assertCommentHighlightExists({ text: 'comments' });

  await superdoc.snapshot('comment edited');
});
