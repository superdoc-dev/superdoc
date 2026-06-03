import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import { BASIC_FOOTNOTES_DOC_PATH as FOOTNOTE_DOC_PATH } from '../../helpers/story-fixtures.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'on',
    trackChanges: true,
    documentMode: 'suggesting',
    showCaret: true,
    showSelection: true,
  },
});

function getInsertedTrackChangeLocator(container: Locator, insertedText: string): Locator {
  return container
    .locator('[data-track-change-id], .track-insert[data-id], .track-delete[data-id], .track-format[data-id]')
    .filter({ hasText: insertedText })
    .first();
}

async function getTextClickPoint(locator: Locator, searchText: string) {
  const point = await locator.evaluate((element, targetText: string) => {
    const fullText = element.textContent ?? '';
    const matchStart = fullText.indexOf(targetText);
    if (matchStart < 0) {
      return null;
    }

    const doc = element.ownerDocument;
    if (!doc) {
      return null;
    }

    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let remaining = matchStart;
    let currentNode = walker.nextNode() as Text | null;

    while (currentNode) {
      const textLength = currentNode.textContent?.length ?? 0;
      if (remaining < textLength) {
        const range = doc.createRange();
        const startOffset = Math.max(0, remaining);
        const endOffset = Math.min(textLength, remaining + targetText.length);
        range.setStart(currentNode, startOffset);
        range.setEnd(currentNode, endOffset);

        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          return null;
        }

        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }

      remaining -= textLength;
      currentNode = walker.nextNode() as Text | null;
    }

    return null;
  }, searchText);

  expect(point).toBeTruthy();
  return point!;
}

async function getTrackChangeThreadIdAtPoint(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(
    ({ x: clientX, y: clientY }) => {
      const target = document.elementFromPoint(clientX, clientY);
      const trackedChangeElement = target?.closest?.(
        '[data-track-change-id], .track-insert[data-id], .track-delete[data-id], .track-format[data-id]',
      );

      return (
        trackedChangeElement?.getAttribute('data-track-change-id')?.trim() ??
        trackedChangeElement?.getAttribute('data-id')?.trim() ??
        null
      );
    },
    { x, y },
  );
}

async function clearActiveComment(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as any).superdoc?.commentsStore;
    store?.$patch?.({ activeComment: null });
  });
}

async function getActiveCommentId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const activeComment = (window as any).superdoc?.commentsStore?.activeComment;
    return activeComment == null ? null : String(activeComment);
  });
}

async function activateFootnote(
  superdoc: { page: Page; waitForStable: (ms?: number) => Promise<void> },
  noteId: string,
) {
  const footnote = superdoc.page.locator(`[data-block-id^="footnote-${noteId}-"]`).first();
  await footnote.scrollIntoViewIfNeeded();
  await footnote.waitFor({ state: 'visible', timeout: 15_000 });

  const box = await footnote.boundingBox();
  expect(box).toBeTruthy();

  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();

  await expect
    .poll(() =>
      superdoc.page.evaluate(() => {
        const session = (window as any).editor?.presentationEditor?.getStorySessionManager?.()?.getActiveSession?.();
        return session?.locator?.storyType ?? null;
      }),
    )
    .toBe('footnote');

  return footnote;
}

test('clicking tracked-change text inside an active footnote activates its floating bubble', async ({
  superdoc,
  browserName,
}) => {
  test.skip(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  await superdoc.loadDocument(FOOTNOTE_DOC_PATH);
  await superdoc.waitForStable();

  const insertedText = 'NOTEFIX';
  const footnote = await activateFootnote(superdoc, '1');

  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(insertedText);
  await superdoc.waitForStable();

  const insertedChange = getInsertedTrackChangeLocator(footnote, insertedText);
  await expect(insertedChange).toBeVisible();

  const clickPoint = await getTextClickPoint(footnote, insertedText);
  const threadId = await getTrackChangeThreadIdAtPoint(superdoc.page, clickPoint.x, clickPoint.y);
  expect(threadId).toBeTruthy();
  await clearActiveComment(superdoc.page);
  await expect.poll(() => getActiveCommentId(superdoc.page)).toBeNull();

  await superdoc.page.mouse.click(clickPoint.x, clickPoint.y);
  await superdoc.waitForStable();

  await expect.poll(() => getActiveCommentId(superdoc.page)).toBe(threadId);
});
