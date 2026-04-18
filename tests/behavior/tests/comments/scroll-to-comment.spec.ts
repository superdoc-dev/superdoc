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

  // Poll scrollToComment until it succeeds. After scrolling to top the
  // DomPainter may re-render pages, temporarily removing comment highlight
  // elements from the DOM. Use behavior:'auto' (instant) to avoid
  // smooth-scroll timing issues on WebKit.
  await expect
    .poll(
      async () =>
        superdoc.page.evaluate((id) => (window as any).superdoc.scrollToComment(id, { behavior: 'auto' }), commentId),
      { timeout: 15_000 },
    )
    .toBe(true);

  // scrollToComment calls setActiveComment which triggers a full DomPainter
  // re-render (removes and recreates all page elements). Wait for it to settle.
  await superdoc.waitForStable();

  // Poll for the highlight since the re-render creates new DOM elements.
  await superdoc.assertCommentHighlightExists({ text: 'target text', timeoutMs: 10_000 });
});

test('scrollToComment returns false for a nonexistent comment', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  const result = await superdoc.page.evaluate(() => {
    return (window as any).superdoc.scrollToComment('nonexistent-id');
  });

  expect(result).toBe(false);
});
