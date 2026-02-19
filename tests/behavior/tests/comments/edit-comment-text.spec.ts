import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listComments } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('editing a comment updates its text', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('hello comments');
  await superdoc.waitForStable();

  // Select "comments" and add an initial comment through the UI.
  const pos = await superdoc.findTextPos('comments');
  await superdoc.setTextSelection(pos, pos + 'comments'.length);
  await superdoc.waitForStable();

  const bubble = superdoc.page.locator('.superdoc__tools');
  await expect(bubble).toBeVisible({ timeout: 5_000 });
  await bubble.locator('[data-id="is-tool"]').click();
  await superdoc.waitForStable();

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
