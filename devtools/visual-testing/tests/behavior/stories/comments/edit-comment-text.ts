import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;

/**
 * Tests the comment editing flow to prevent regression of SD-1731.
 *
 * Bug SD-1731: When clicking "Edit" on an existing comment, the comment text
 * was being cleared instead of being preserved in the input field.
 */
export default defineStory({
  name: 'edit-comment-text',
  description: 'Test that editing a comment preserves and displays the original text',
  tickets: ['SD-1731'],
  startDocument: null,
  layout: true,
  comments: 'panel',

  async run(page, helpers): Promise<void> {
    const { type, waitForStable, milestone, pressTimes, pressShortcut } = helpers;

    // Type initial text
    await type('hello comments');
    await waitForStable(WAIT_MS);
    await milestone('typed', 'Typed "hello comments"');

    // Select the word "comments" (8 characters from the end)
    await pressShortcut('ArrowRight'); // Move to end
    await pressTimes('Shift+ArrowLeft', 8); // Select "comments"
    await waitForStable(WAIT_MS);
    await milestone('selected', 'Selected the word "comments"');

    // Click the comment tool button to open comment dialog
    const commentTool = page.locator('.harness-main .tools-item[data-id="is-tool"]');
    await commentTool.click();
    await waitForStable(WAIT_MS);
    await milestone('comment-dialog-open', 'Comment dialog opened');

    // Type into the auto-focused comment input
    await page.keyboard.type('original comment');
    await waitForStable(WAIT_MS);
    await milestone('comment-typed', 'Typed "original comment" into comment input');

    // Click the Comment button to submit
    const commentButton = page.locator('.harness-main .sd-button.primary').filter({ hasText: 'Comment' });
    await commentButton.click();
    await waitForStable(WAIT_MS);
    await milestone('comment-submitted', 'Comment submitted');

    // Click the overflow menu icon (three dots) in the comment dialog
    const overflowIcon = page.locator('.harness-main .floating-comment .overflow-icon').last();
    await overflowIcon.click();
    await waitForStable(WAIT_MS);
    await milestone('overflow-menu-open', 'Overflow menu opened');

    // Click the Edit option in the dropdown (rendered via teleport, outside harness-main)
    const editOption = page.locator('.n-dropdown-option-body__label').filter({ hasText: 'Edit' });
    await editOption.click();
    await waitForStable(WAIT_MS);
    await milestone('edit-mode-active', 'Edit mode active - input should show original comment text');

    // Select the word "original" in the comment input
    await pressShortcut('ArrowLeft'); // Move to start
    await pressTimes('Shift+ArrowRight', 8); // Select "original"
    await waitForStable(WAIT_MS);
    await milestone('original-selected', 'Selected the word "original" in comment input');

    // Type "changed" to replace the selected word
    await page.keyboard.type('changed');
    await waitForStable(WAIT_MS);
    await milestone('text-changed', 'Replaced "original" with "changed"');

    // Click the Update button to save the edited comment
    const updateButton = page
      .locator('.harness-main .comment-editing .sd-button.primary')
      .filter({ hasText: 'Update' })
      .last();
    await updateButton.click();
    await waitForStable(WAIT_MS);
    await milestone('comment-updated', 'Comment updated - should now show "changed comment"');
  },
});
