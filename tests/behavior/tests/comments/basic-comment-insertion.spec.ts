import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

interface ListedComment {
  text?: string;
}

async function listDocApiComments(superdoc: { page: import('@playwright/test').Page }): Promise<ListedComment[]> {
  return superdoc.page.evaluate(() => {
    const commentsApi = (window as any).editor?.doc?.comments;
    if (!commentsApi?.list) {
      throw new Error('Document API is unavailable: expected editor.doc.comments.list().');
    }
    const result = commentsApi.list({ includeResolved: true });
    const matches = Array.isArray(result?.matches) ? result.matches : [];
    return matches.map((entry: any) => ({
      text: typeof entry?.text === 'string' ? entry.text : undefined,
    }));
  });
}

async function assertCommentWasAdded(
  superdoc: { page: import('@playwright/test').Page },
  beforeComments: ListedComment[],
  expectedText: string,
  options?: { allowUnchangedCountWhenNoText?: boolean },
): Promise<void> {
  const afterComments = await listDocApiComments(superdoc);

  // Some adapter paths omit `text` in list results.
  // If text is available, assert the expected body appears more times than before.
  const beforeTexts = beforeComments
    .map((entry) => entry.text)
    .filter((text): text is string => typeof text === 'string');
  const afterTexts = afterComments
    .map((entry) => entry.text)
    .filter((text): text is string => typeof text === 'string');

  if (afterTexts.length > 0) {
    const beforeTextMatches = beforeTexts.filter((text) => text === expectedText).length;
    const afterTextMatches = afterTexts.filter((text) => text === expectedText).length;
    expect(afterTextMatches).toBeGreaterThan(beforeTextMatches);
    return;
  }

  // Fallback for list results without text fields.
  if (options?.allowUnchangedCountWhenNoText) {
    expect(afterComments.length).toBeGreaterThanOrEqual(beforeComments.length);
    return;
  }
  expect(afterComments.length).toBeGreaterThan(beforeComments.length);
}

test('add a comment programmatically via addComment command', async ({ superdoc }) => {
  await superdoc.type('hello');
  await superdoc.newLine();
  await superdoc.newLine();
  await superdoc.type('world');
  await superdoc.waitForStable();

  await superdoc.assertTextContains('hello');
  await superdoc.assertTextContains('world');

  // Select "world" using PM positions
  const worldPos = await superdoc.findTextPos('world');
  await superdoc.setTextSelection(worldPos, worldPos + 'world'.length);
  await superdoc.waitForStable();

  const initialComments = await listDocApiComments(superdoc);

  // Add a comment on the selected text
  await superdoc.executeCommand('addComment', { text: 'This is a programmatic comment' });
  await superdoc.waitForStable();

  // Comment highlight should exist on the word "world"
  await superdoc.assertCommentHighlightExists({ text: 'world' });

  await assertCommentWasAdded(superdoc, initialComments, 'This is a programmatic comment');

  await superdoc.snapshot('comment added programmatically');
});

test('add a comment via the UI bubble', async ({ superdoc }) => {
  await superdoc.type('Some text to comment on');
  await superdoc.waitForStable();

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

  const initialComments = await listDocApiComments(superdoc);

  // Submit by clicking the "Comment" button
  await dialog.locator('.sd-button.primary', { hasText: 'Comment' }).first().click();
  await superdoc.waitForStable();

  // Comment highlight should exist on the word "comment"
  await superdoc.assertCommentHighlightExists({ text: 'comment' });

  await assertCommentWasAdded(superdoc, initialComments, 'UI comment on selected text', {
    // UI draft entries can appear in list() before submit; fallback to non-decreasing count
    // when list responses do not include text fields.
    allowUnchangedCountWhenNoText: true,
  });

  // Verify the comment text appears in the floating dialog
  const commentDialog = superdoc.page.locator('.floating-comment > .comments-dialog').last();
  const commentText = commentDialog.locator('.comment-body .comment');
  await expect(commentText.first()).toBeAttached({ timeout: 5_000 });
  await expect(commentText.first()).toContainText('UI comment on selected text');

  await superdoc.snapshot('comment added via UI');
});
