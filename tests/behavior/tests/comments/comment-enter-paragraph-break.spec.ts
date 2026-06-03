import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';
import { addCommentViaUI, activateCommentDialog } from '../../helpers/comments.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('comment with multi-paragraph text renders correctly (SD-2092)', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('hello world');
  await superdoc.waitForStable();

  // Add a comment, then edit it with multi-paragraph content
  await addCommentViaUI(superdoc, { textToSelect: 'world', commentText: 'placeholder' });
  await superdoc.waitForStable();

  // Activate the comment and enter edit mode
  const dialog = await activateCommentDialog(superdoc, 'world');
  await dialog.locator('.overflow-icon').click();
  await superdoc.waitForStable();

  const editOption = superdoc.page.locator('.comments-dropdown__option-label', { hasText: 'Edit' });
  await expect(editOption.first()).toBeVisible({ timeout: 5_000 });
  await editOption.first().click();
  await superdoc.waitForStable();

  // Set multi-paragraph content in the edit input.
  // This simulates what ProseMirror's splitBlock produces when Enter is pressed.
  const editInput = dialog.locator('.reply-expanded .superdoc-field .ProseMirror').first();
  await expect(editInput).toBeVisible({ timeout: 5_000 });
  await editInput.evaluate((el) => {
    el.innerHTML = '<p>first line</p><p>second line</p>';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await superdoc.waitForStable();

  // Save the edited comment
  await dialog.locator('.reply-expanded .sd-button.primary', { hasText: 'Update' }).click();
  await superdoc.waitForStable();

  // Verify the comment renders with two paragraphs
  const updatedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog');
  const commentBody = updatedDialog.locator('.comment-body .comment').first();
  await expect(commentBody.locator('p')).toHaveCount(2, { timeout: 10_000 });
  await expect(commentBody.locator('p').first()).toContainText('first line');
  await expect(commentBody.locator('p').last()).toContainText('second line');

  await superdoc.snapshot('comment with paragraph break');
});
