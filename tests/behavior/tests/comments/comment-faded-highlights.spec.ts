import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentViaUI } from '../../helpers/comments.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

test('non-selected comments retain a faded highlight when another comment is active', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Type text with two distinct words on separate lines to avoid range overlap
  await superdoc.type('hello');
  await superdoc.newLine();
  await superdoc.type('goodbye');
  await superdoc.waitForStable();

  // Add comments on both words via the UI
  await addCommentViaUI(superdoc, { textToSelect: 'hello', commentText: 'comment on hello' });
  await superdoc.assertCommentHighlightExists({ text: 'hello', timeoutMs: 20_000 });

  await addCommentViaUI(superdoc, { textToSelect: 'goodbye', commentText: 'comment on goodbye' });
  await superdoc.assertCommentHighlightExists({ text: 'goodbye', timeoutMs: 20_000 });

  // Activate the "hello" comment by clicking its highlight
  await superdoc.clickOnCommentedText('hello');
  await superdoc.waitForStable();

  // The "goodbye" highlight should still exist in the DOM with a non-transparent background.
  // Use .superdoc-comment-highlight since that's the presentation layer class.
  const goodbyeHighlight = superdoc.page.locator('.superdoc-comment-highlight').filter({ hasText: 'goodbye' });
  await expect(goodbyeHighlight.first()).toBeAttached({ timeout: 5_000 });

  const bgColor = await goodbyeHighlight.first().evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor;
  });

  // The faded highlight uses a non-zero alpha, so it should not be fully transparent
  expect(bgColor).not.toBe('transparent');
  expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
});
