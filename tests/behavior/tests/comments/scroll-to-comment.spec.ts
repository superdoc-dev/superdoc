import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentByText, assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('scrollToComment scrolls to the comment and activates it', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Create enough content so the comment is off-screen
  for (let i = 0; i < 30; i++) {
    await superdoc.type(`Line ${i}`);
    await superdoc.newLine();
  }
  await superdoc.type('target text');
  await superdoc.waitForStable();

  const commentId = await addCommentByText(superdoc.page, {
    pattern: 'target text',
    text: 'scroll test comment',
  });
  await superdoc.waitForStable();
  await superdoc.assertCommentHighlightExists({ text: 'target text', timeoutMs: 20_000 });

  // Scroll to the top so the comment is out of view
  await superdoc.page.evaluate(() => {
    document.querySelector('.superdoc')?.scrollTo({ top: 0 });
  });
  await superdoc.waitForStable();

  // Call scrollToComment via the public API.
  // WebKit can lag on DOM attribute propagation, so poll until it succeeds.
  await expect
    .poll(async () => superdoc.page.evaluate((id) => (window as any).superdoc.scrollToComment(id), commentId), {
      timeout: 10_000,
    })
    .toBe(true);

  // Verify the comment highlight is now visible in the viewport
  const highlight = superdoc.page.locator('.superdoc-comment-highlight').filter({ hasText: 'target text' });
  await expect(highlight.first()).toBeVisible({ timeout: 5_000 });
});

test('scrollToComment returns false for a nonexistent comment', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  const result = await superdoc.page.evaluate(() => {
    return (window as any).superdoc.scrollToComment('nonexistent-id');
  });

  expect(result).toBe(false);
});
