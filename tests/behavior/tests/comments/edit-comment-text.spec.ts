import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('editing a comment updates its text', async ({ superdoc }) => {
  await superdoc.type('hello comments');
  await superdoc.waitForStable();

  // Select "comments"
  const pos = await superdoc.findTextPos('comments');
  await superdoc.setTextSelection(pos, pos + 'comments'.length);
  await superdoc.waitForStable();

  // Click the comment tool button in the bubble
  const bubble = superdoc.page.locator('.superdoc__tools');
  await expect(bubble).toBeVisible({ timeout: 5_000 });
  await bubble.locator('[data-id="is-tool"]').click();
  await superdoc.waitForStable();

  // Pending comment dialog should open — type and submit
  const pendingDialog = superdoc.page.locator('.comments-dialog').first();
  await pendingDialog.locator('.comment-entry .editor-element').first().click();
  await superdoc.page.keyboard.type('original comment');
  await superdoc.waitForStable();

  await pendingDialog.locator('.sd-button.primary', { hasText: 'Comment' }).first().click();
  await superdoc.waitForStable();

  // Click on the comment highlight to activate the floating dialog
  await superdoc.clickOnCommentedText('comments');
  await superdoc.waitForStable();

  // The active dialog should show the submitted comment (use .last() to skip measure layer)
  const activeDialog = superdoc.page.locator('.comments-dialog.is-active').last();
  await expect(activeDialog).toBeVisible({ timeout: 5_000 });
  await expect(activeDialog.locator('.comment-body .comment').first()).toContainText('original comment');

  // Open the overflow "..." menu and click Edit
  await activeDialog.locator('.overflow-icon').click();
  await superdoc.waitForStable();

  const editOption = superdoc.page.locator('.n-dropdown-option-body__label', { hasText: 'Edit' });
  await expect(editOption.first()).toBeVisible({ timeout: 5_000 });
  await editOption.first().click();
  await superdoc.waitForStable();

  // The comment should now be in edit mode
  const editInput = activeDialog.locator('.comment-editing .editor-element');
  await expect(editInput).toBeVisible({ timeout: 5_000 });

  // Select all text in the edit input, then type the replacement
  await editInput.click();
  await superdoc.shortcut('a');
  await superdoc.page.keyboard.type('changed comment');
  await superdoc.waitForStable();

  // Click Update
  await activeDialog.locator('.comment-editing .sd-button.primary', { hasText: 'Update' }).click();
  await superdoc.waitForStable();

  // After update the dialog loses is-active; verify the text changed via the visible sidebar dialog
  const updatedDialog = superdoc.page.locator('.floating-comment > .comments-dialog');
  await expect(updatedDialog.locator('.comment-body .comment').first()).toContainText('changed comment');

  // Comment highlight should still exist
  await superdoc.assertCommentHighlightExists({ text: 'comments' });

  await superdoc.snapshot('comment edited');
});
