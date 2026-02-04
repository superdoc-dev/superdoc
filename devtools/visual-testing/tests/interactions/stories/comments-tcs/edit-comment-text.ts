import { defineStory } from '@superdoc-testing/helpers';
import { clickOnCommentedText, waitForCommentPanelStable } from '../../helpers/index.js';

const WAIT_MS = 400;
const START_DOC = 'comments-tcs/basic-comments.docx';

/**
 * Tests the comment editing flow to prevent regression of SD-1731.
 *
 * Bug SD-1731: When clicking "Edit" on an existing comment, the comment text
 * was being cleared instead of being preserved in the input field.
 *
 * This test verifies:
 * - Clicking "Edit" from overflow menu shows the original comment text
 * - The edit input is properly focused and contains the existing text
 * - Editing can be cancelled, restoring the original view
 */
export default defineStory({
  name: 'edit-comment-text',
  description: 'Test that editing a comment preserves and displays the original text',
  tickets: ['SD-1731'],
  startDocument: START_DOC,
  layout: true,
  comments: 'panel',
  hideCaret: false,
  hideSelection: false,

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone, type } = helpers;

    await step('Wait for document and comments to load', async () => {
      await page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
      await waitForStable(WAIT_MS);
      await milestone('initial', 'Document loaded with comment visible in panel');
    });

    await step('Click on commented text to select the comment', async () => {
      // Click on any commented text to activate the comment
      const highlight = page.locator('.superdoc-comment-highlight').first();
      await highlight.click();
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('comment-selected', 'Comment is selected and active in panel');
    });

    await step('Click overflow menu to open options', async () => {
      // Find the active comment dialog and click its overflow menu icon
      const activeDialog = page.locator('.comments-dialog.is-active');
      const overflowIcon = activeDialog.locator('.overflow-icon').first();
      await overflowIcon.click();
      await waitForStable(300);
      await milestone('overflow-menu-open', 'Overflow menu is open showing Edit option');
    });

    await step('Click Edit to enter edit mode', async () => {
      // Click the "Edit" option in the dropdown
      // n-dropdown renders options in a portal, so we need to find it in the document
      const editOption = page.locator('.n-dropdown-option').filter({ hasText: 'Edit' });
      await editOption.click();
      await waitForStable(WAIT_MS);
      await milestone(
        'edit-mode-active',
        'Edit mode active - input should show original comment text (regression test for SD-1731)',
      );
    });

    await step('Type additional text to verify editing works', async () => {
      // The input should be focused, type some additional text
      await type(' - edited');
      await waitForStable(300);
      await milestone('text-modified', 'Additional text typed into comment input');
    });

    await step('Cancel the edit to restore original state', async () => {
      // Click the Cancel button
      const cancelButton = page.locator('.comment-editing .sd-button').filter({ hasText: 'Cancel' });
      await cancelButton.click();
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('edit-cancelled', 'Edit cancelled - original comment text restored');
    });
  },
});
