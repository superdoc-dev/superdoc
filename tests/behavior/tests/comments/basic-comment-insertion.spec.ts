import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentByText, assertDocumentApiReady, listComments } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('add a comment programmatically via document-api', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('hello');
  await superdoc.newLine();
  await superdoc.newLine();
  await superdoc.type('world');
  await superdoc.waitForStable();

  await superdoc.assertTextContains('hello');
  await superdoc.assertTextContains('world');

  const initialComments = await listComments(superdoc.page, { includeResolved: true });
  const initialCount = initialComments.total;

  await addCommentByText(superdoc.page, {
    pattern: 'world',
    text: 'This is a programmatic comment',
  });
  await superdoc.waitForStable();

  await superdoc.assertCommentHighlightExists({ text: 'world' });
  await expect
    .poll(async () => {
      const listed = await listComments(superdoc.page, { includeResolved: true });
      return listed.matches.some((entry) => entry.text === 'This is a programmatic comment');
    })
    .toBe(true);
  await expect
    .poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total)
    .toBeGreaterThan(initialCount);

  await superdoc.snapshot('comment added programmatically');
});

test('add a comment via the UI bubble', async ({ superdoc }) => {
  await superdoc.type('Some text to comment on');
  await superdoc.waitForStable();
  const initialCount = (await listComments(superdoc.page, { includeResolved: true })).total;

  // Select "comment" via PM positions
  const commentPos = await superdoc.findTextPos('comment');
  await superdoc.setTextSelection(commentPos, commentPos + 'comment'.length);
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

  await expect
    .poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total)
    .toBeGreaterThan(initialCount);
  // CommentInfo.text is optional in the contract — some adapters don't populate it.
  // Verify via the API when available; the DOM assertion below covers all adapters.
  const listedAfterSubmit = await listComments(superdoc.page, { includeResolved: true });
  const commentTexts = listedAfterSubmit.matches.map((e) => e.text).filter(Boolean);
  if (commentTexts.length > 0) {
    expect(commentTexts).toContain('UI comment on selected text');
  }

  // Verify the comment text appears in the floating dialog
  const commentDialog = superdoc.page.locator('.floating-comment > .comments-dialog').last();
  const commentText = commentDialog.locator('.comment-body .comment');
  await expect(commentText.first()).toBeAttached({ timeout: 5_000 });
  await expect(commentText.first()).toContainText('UI comment on selected text');

  await superdoc.snapshot('comment added via UI');
});
