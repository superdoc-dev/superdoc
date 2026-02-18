import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('add a comment programmatically via addComment command', async ({ superdoc }) => {
  await superdoc.type('hello');
  await superdoc.newLine();
  await superdoc.newLine();
  await superdoc.type('world');
  await superdoc.waitForStable();

  await superdoc.assertTextContains('hello');
  await superdoc.assertTextContains('world');

  // Select "world" using PM positions
  const pos = await superdoc.findTextPos('world');
  await superdoc.setTextSelection(pos, pos + 'world'.length);
  await superdoc.waitForStable();

  // Add a comment on the selected text
  await superdoc.executeCommand('addComment', { text: 'This is a programmatic comment' });
  await superdoc.waitForStable();

  // Comment highlight should exist on the word "world"
  await superdoc.assertCommentHighlightExists({ text: 'world' });

  // Verify the commentMark is on the "world" text node in PM state
  const marks = await superdoc.getMarksAtPos(pos);
  expect(marks).toContain('commentMark');

  await superdoc.snapshot('comment added programmatically');
});

test('add a comment via the UI bubble', async ({ superdoc }) => {
  await superdoc.type('Some text to comment on');
  await superdoc.waitForStable();

  // Select "comment" via PM positions
  const pos = await superdoc.findTextPos('comment');
  await superdoc.setTextSelection(pos, pos + 'comment'.length);
  await superdoc.waitForStable();

  // The floating comment bubble should appear
  const bubble = superdoc.page.locator('.superdoc__tools');
  await expect(bubble).toBeVisible({ timeout: 5_000 });

  // Click the comment button
  await bubble.locator('[data-id="is-tool"]').click();
  await superdoc.waitForStable();

  // Comment dialog should open
  const dialog = superdoc.page.locator('.comments-dialog.is-active').last();
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // Type the comment text in the input
  const commentInput = dialog.locator('.comment-entry .editor-element');
  await commentInput.click();
  await superdoc.page.keyboard.type('UI comment on selected text');
  await superdoc.waitForStable();

  // Submit by clicking the "Comment" button
  await dialog.locator('.sd-button.primary', { hasText: 'Comment' }).first().click();
  await superdoc.waitForStable();

  // Comment highlight should exist on the word "comment"
  await superdoc.assertCommentHighlightExists({ text: 'comment' });

  // Verify the commentMark is present in PM state
  const marks = await superdoc.getMarksAtPos(pos);
  expect(marks).toContain('commentMark');

  // Verify the comment text appears in the floating dialog
  const commentDialog = superdoc.page.locator('.floating-comment > .comments-dialog').last();
  const commentText = commentDialog.locator('.comment-body .comment');
  await expect(commentText.first()).toBeAttached({ timeout: 5_000 });
  await expect(commentText.first()).toContainText('UI comment on selected text');

  await superdoc.snapshot('comment added via UI');
});
