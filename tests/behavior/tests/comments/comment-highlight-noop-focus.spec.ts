import type { Page } from '@playwright/test';
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

async function dispatchRetargetedRepeatClickOnCommentHighlight(page: Page, highlightedText: string) {
  await page.waitForFunction(
    (textMatch) => {
      const highlights = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-comment-highlight'));
      const highlight = highlights.find((candidate) => {
        if (!(candidate.textContent ?? '').includes(textMatch)) {
          return false;
        }

        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (!highlight) {
        return null;
      }

      const rect = highlight.getBoundingClientRect();
      const viewport = document.querySelector<HTMLElement>('.presentation-editor__viewport');

      if (!viewport) {
        return null;
      }

      const eventCoordinates = {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        screenX: rect.left + rect.width / 2,
        screenY: rect.top + rect.height / 2,
      };
      const pointerBase = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      };

      highlight.dispatchEvent(
        new PointerEvent('pointerdown', {
          ...pointerBase,
          ...eventCoordinates,
          button: 0,
          buttons: 1,
        }),
      );

      viewport.dispatchEvent(
        new PointerEvent('pointerup', {
          ...pointerBase,
          ...eventCoordinates,
          button: 0,
          buttons: 0,
        }),
      );

      viewport.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
          ...eventCoordinates,
          button: 0,
          buttons: 0,
        }),
      );

      return true;
    },
    highlightedText,
    { timeout: 10_000 },
  );
}

test('clicking the active editor comment again keeps the same thread active', async ({ superdoc, browserName }) => {
  test.skip(browserName !== 'chromium', 'This regression asserts Chromium editor-click behavior.');

  const getActiveCommentState = () =>
    superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      const store = (window as any).superdoc?.commentsStore;
      const activeDialogIds = Array.from(document.querySelectorAll('.comments-dialog.is-active')).map((dialog) =>
        dialog.closest('.comment-placeholder')?.getAttribute('data-comment-id'),
      );

      return {
        activeComment: store?.activeComment ?? null,
        selection: editor
          ? {
              from: editor.state.selection.from,
              to: editor.state.selection.to,
              empty: editor.state.selection.empty,
            }
          : null,
        activeDialogIds,
      };
    });

  await assertDocumentApiReady(superdoc.page);

  await typeParagraphs(superdoc, [
    'Top line with AlphaTarget.',
    'Filler line 1.',
    'Filler line 2.',
    'Filler line 3.',
    'Filler line 4.',
    'Bottom line with BetaTarget.',
  ]);

  await addCommentByText(superdoc.page, {
    pattern: 'AlphaTarget',
    text: 'Alpha comment body',
  });
  await addCommentByText(superdoc.page, {
    pattern: 'BetaTarget',
    text: 'Beta comment body',
  });
  await superdoc.waitForStable();

  const alphaThreadId = await superdoc.page
    .locator('.comment-placeholder', { hasText: 'Alpha comment body' })
    .first()
    .getAttribute('data-comment-id');
  if (!alphaThreadId) {
    throw new Error('Expected the alpha comment placeholder to expose a thread id');
  }

  await superdoc.page.evaluate((activeCommentId) => {
    const superdocInstance = (window as any).superdoc;
    const editor = (window as any).editor;

    superdocInstance?.commentsStore?.setActiveComment?.(superdocInstance, activeCommentId);
    editor?.commands?.setCursorById?.(activeCommentId, { preferredActiveThreadId: activeCommentId });
  }, alphaThreadId);
  await superdoc.waitForStable();

  await expect
    .poll(() => getActiveCommentState(superdoc.page))
    .toMatchObject({
      activeComment: alphaThreadId,
      selection: { empty: true },
      activeDialogIds: [alphaThreadId],
    });

  await superdoc.page.waitForTimeout(600);
  await dispatchRetargetedRepeatClickOnCommentHighlight(superdoc.page, 'AlphaTarget');
  await superdoc.waitForStable();

  await expect
    .poll(() => getActiveCommentState(superdoc.page))
    .toMatchObject({
      activeComment: alphaThreadId,
      selection: { empty: true },
      activeDialogIds: [alphaThreadId],
    });
});
