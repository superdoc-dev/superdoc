import { test } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'panel' } });

test('@behavior editing comment preserves original text', async ({ superdoc }) => {
  await superdoc.type('hello comments');
  await superdoc.waitForStable();
  await superdoc.screenshot('edit-comment-typed');

  // Select "comments" (8 chars from end)
  await superdoc.shortcut('ArrowRight');
  await superdoc.pressTimes('Shift+ArrowLeft', 8);
  await superdoc.waitForStable();
  await superdoc.screenshot('edit-comment-selected');

  // Click the comment tool button
  const commentTool = superdoc.page.locator('.tools-item[data-id="is-tool"]');
  await commentTool.click();
  await superdoc.waitForStable();
  await superdoc.screenshot('edit-comment-dialog-open');

  // Type comment text
  await superdoc.page.keyboard.type('original comment');
  await superdoc.waitForStable();

  // Submit the comment
  const commentButton = superdoc.page.locator('.sd-button.primary').filter({ hasText: 'Comment' });
  await commentButton.click();
  await superdoc.waitForStable();
  await superdoc.screenshot('edit-comment-submitted');

  // Open overflow menu and click Edit
  const overflowIcon = superdoc.page.locator('.floating-comment .overflow-icon').last();
  await overflowIcon.click();
  await superdoc.waitForStable();

  const editOption = superdoc.page.locator('.n-dropdown-option-body__label').filter({ hasText: 'Edit' });
  await editOption.click();
  await superdoc.waitForStable();
  await superdoc.screenshot('edit-comment-edit-mode');

  // Select "original" and replace with "changed"
  await superdoc.shortcut('ArrowLeft');
  await superdoc.pressTimes('Shift+ArrowRight', 8);
  await superdoc.page.keyboard.type('changed');
  await superdoc.waitForStable();

  // Update
  const updateButton = superdoc.page
    .locator('.comment-editing .sd-button.primary')
    .filter({ hasText: 'Update' })
    .last();
  await updateButton.click();
  await superdoc.waitForStable();
  await superdoc.screenshot('edit-comment-updated');
});
