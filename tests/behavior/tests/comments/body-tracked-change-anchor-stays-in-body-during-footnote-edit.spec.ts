import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import { BASIC_FOOTNOTES_DOC_PATH as DOC_PATH } from '../../helpers/story-fixtures.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'panel',
    trackChanges: true,
    documentMode: 'suggesting',
    showCaret: true,
    showSelection: true,
  },
});

type TrackedChangePosition = {
  key: string;
  top: number;
  left: number;
  pageIndex: number | null;
};

function getFootnoteLocator(page: Page, noteId: string): Locator {
  return page.locator(`[data-block-id^="footnote-${noteId}-"]`).first();
}

async function getBodyTrackedChangePosition(page: Page): Promise<TrackedChangePosition | null> {
  return page.evaluate(() => {
    const positions = (window as any).superdoc?.commentsStore?.editorCommentPositions ?? {};
    for (const [key, entry] of Object.entries(positions)) {
      if (!key.startsWith('tc::body::')) {
        continue;
      }

      const bounds = (entry as { bounds?: { top?: unknown; left?: unknown } }).bounds;
      if (!bounds || !Number.isFinite(bounds.top) || !Number.isFinite(bounds.left)) {
        continue;
      }

      const pageIndex = (entry as { pageIndex?: unknown }).pageIndex;
      return {
        key,
        top: Number(bounds.top),
        left: Number(bounds.left),
        pageIndex: Number.isFinite(pageIndex) ? Number(pageIndex) : null,
      };
    }

    return null;
  });
}

async function getTrackedChangePositionByKey(page: Page, key: string): Promise<TrackedChangePosition | null> {
  return page.evaluate((targetKey: string) => {
    const entry = (window as any).superdoc?.commentsStore?.editorCommentPositions?.[targetKey];
    const bounds = entry?.bounds;
    if (!bounds || !Number.isFinite(bounds.top) || !Number.isFinite(bounds.left)) {
      return null;
    }

    const pageIndex = entry?.pageIndex;
    return {
      key: targetKey,
      top: Number(bounds.top),
      left: Number(bounds.left),
      pageIndex: Number.isFinite(pageIndex) ? Number(pageIndex) : null,
    };
  }, key);
}

async function activateFootnote(
  superdoc: { page: Page; waitForStable: (ms?: number) => Promise<void> },
  noteId: string,
) {
  const footnote = getFootnoteLocator(superdoc.page, noteId);
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

test('body tracked-change anchors stay in body space while editing a footnote in suggesting mode', async ({
  superdoc,
  browserName,
}) => {
  test.skip(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const bodyLine = superdoc.page.locator('.superdoc-line', { hasText: 'Simple text1 with footnotes' }).first();
  await bodyLine.waitFor({ state: 'visible', timeout: 15_000 });

  const lineBox = await bodyLine.boundingBox();
  expect(lineBox).toBeTruthy();

  await superdoc.page.mouse.click(lineBox!.x + 12, lineBox!.y + lineBox!.height / 2);
  await superdoc.page.keyboard.insertText('BODYFIX ');
  await superdoc.waitForStable();

  await expect.poll(() => getBodyTrackedChangePosition(superdoc.page)).not.toBeNull();
  const before = await getBodyTrackedChangePosition(superdoc.page);
  expect(before).toBeTruthy();

  const footnote = await activateFootnote(superdoc, '1');
  await expect(footnote).toContainText('This is a simple footnote');

  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText('NOTEFIX');
  await superdoc.waitForStable();

  await expect.poll(() => getTrackedChangePositionByKey(superdoc.page, before!.key)).not.toBeNull();
  const after = await getTrackedChangePositionByKey(superdoc.page, before!.key);
  expect(after).toBeTruthy();

  expect(after!.pageIndex).toBe(before!.pageIndex);
  expect(Math.abs(after!.top - before!.top)).toBeLessThanOrEqual(40);
  expect(Math.abs(after!.left - before!.left)).toBeLessThanOrEqual(40);
});
