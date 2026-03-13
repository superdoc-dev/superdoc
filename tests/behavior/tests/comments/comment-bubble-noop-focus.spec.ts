import { expect, test } from '../../fixtures/superdoc.js';
import { addCommentByText, assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

async function typeParagraphs(
  superdoc: { type: (text: string) => Promise<void>; newLine: () => Promise<void>; waitForStable: () => Promise<void> },
  paragraphs: string[],
) {
  for (const [index, paragraph] of paragraphs.entries()) {
    await superdoc.type(paragraph);
    if (index < paragraphs.length - 1) {
      await superdoc.newLine();
    }
  }
  await superdoc.waitForStable();
}

test('clicking the active bubble again clears the instant alignment target', async ({ superdoc, browserName }) => {
  test.skip(browserName !== 'chromium', 'This regression asserts Chromium bubble-click behavior.');

  await assertDocumentApiReady(superdoc.page);

  const paragraphs = [
    'Top line with AlphaTarget.',
    'Filler line 1.',
    'Filler line 2.',
    'Filler line 3.',
    'Filler line 4.',
    'Filler line 5.',
    'Filler line 6.',
    'Filler line 7.',
    'Filler line 8.',
    'Filler line 9.',
    'Filler line 10.',
    'Filler line 11.',
    'Filler line 12.',
    'Filler line 13.',
    'Filler line 14.',
    'Filler line 15.',
    'Bottom line with BetaTarget.',
  ];

  await typeParagraphs(superdoc, paragraphs);

  const alphaCommentId = await addCommentByText(superdoc.page, {
    pattern: 'AlphaTarget',
    text: 'Alpha comment body',
  });
  await addCommentByText(superdoc.page, {
    pattern: 'BetaTarget',
    text: 'Beta comment body',
  });
  await superdoc.waitForStable();

  const alphaBubble = superdoc.page.locator(
    `.comment-placeholder[data-comment-id="${alphaCommentId}"] .comments-dialog`,
  );
  await expect(alphaBubble).toBeVisible({ timeout: 10_000 });
  await alphaBubble.click({ position: { x: 12, y: 12 } });
  await superdoc.waitForStable();
  await alphaBubble.click({ position: { x: 12, y: 12 } });
  await superdoc.waitForStable();

  await expect
    .poll(async () => {
      return superdoc.page.evaluate(() => {
        return (window as any).superdoc?.commentsStore?.peekInstantSidebarAlignment?.() ?? null;
      });
    })
    .toBeNull();
});
