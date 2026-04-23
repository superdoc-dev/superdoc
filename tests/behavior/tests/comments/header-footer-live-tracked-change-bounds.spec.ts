import { expect, test, type Page } from '../../fixtures/superdoc.js';
import {
  H_F_NORMAL_ODD_EVEN_FIRSTPG_DOC_PATH as FIRST_PAGE_HEADER_DOC_PATH,
  LONGER_HEADER_SIGN_AREA_DOC_PATH as HEADER_DOC_PATH,
  MULTI_PAGE_HEADER_FOOTER_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import {
  activateFooter,
  activateHeader,
  exitActiveStory,
  getFooterEditorLocator,
  getFooterSurfaceLocator,
  getHeaderEditorLocator,
  getHeaderSurfaceLocator,
  moveActiveStoryCursorToEnd,
} from '../../helpers/story-surfaces.js';

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    documentMode: 'suggesting',
    showCaret: true,
    showSelection: true,
  },
});

async function insertTrackedTextInActiveStory(page: Page, insertedText: string): Promise<void> {
  await page.keyboard.press('End');
  await page.keyboard.insertText(insertedText);
}

async function readTrackedChangeState(page: Page, insertedText: string) {
  return page.evaluate((text) => {
    const harness = (window as any).behaviorHarness;
    const comments = harness?.getCommentsSnapshot?.() ?? [];
    const positions = harness?.getEditorCommentPositions?.() ?? {};
    const floating = (window as any).superdoc?.commentsStore?.getFloatingComments ?? [];

    const match = comments.find(
      (comment: any) =>
        comment?.trackedChange === true &&
        comment?.trackedChangeText === text &&
        comment?.trackedChangeStory?.storyType === 'headerFooterPart',
    );

    const anchorKey = match?.trackedChangeAnchorKey ?? null;
    const position = anchorKey ? (positions[anchorKey] ?? null) : null;

    return {
      anchorKey,
      hasComment: Boolean(match),
      hasBounds: Boolean(position?.bounds),
      floatingMatchCount: floating.filter(
        (comment: any) =>
          comment?.trackedChange === true &&
          comment?.trackedChangeText === text &&
          comment?.trackedChangeStory?.storyType === 'headerFooterPart',
      ).length,
      storyRefId: match?.trackedChangeStory?.refId ?? null,
    };
  }, insertedText);
}

async function readTrackedChangeAnchorGeometry(page: Page, insertedText: string) {
  return page.evaluate((text) => {
    const harness = (window as any).behaviorHarness;
    const comments = harness?.getCommentsSnapshot?.() ?? [];
    const positions = harness?.getEditorCommentPositions?.() ?? {};

    const match = comments.find(
      (comment: any) =>
        comment?.trackedChange === true &&
        comment?.trackedChangeText === text &&
        comment?.trackedChangeStory?.storyType === 'headerFooterPart',
    );

    const anchorKey = match?.trackedChangeAnchorKey ?? null;
    const position = anchorKey ? (positions[anchorKey] ?? null) : null;
    const rects = Array.isArray(position?.rects) ? position.rects : [];

    return {
      pageIndex: position?.pageIndex ?? null,
      boundsHeight: position?.bounds?.height ?? null,
      rectPageIndexes: rects.map((rect: any) => rect?.pageIndex).filter((value: any) => Number.isFinite(value)),
    };
  }, insertedText);
}

async function readFloatingBubbleInstances(page: Page, insertedText: string) {
  return page.evaluate((text) => {
    const harness = (window as any).behaviorHarness;
    const comments = harness?.getCommentsSnapshot?.() ?? [];

    const match = comments.find(
      (comment: any) =>
        comment?.trackedChange === true &&
        comment?.trackedChangeText === text &&
        comment?.trackedChangeStory?.storyType === 'headerFooterPart',
    );

    const anchorKey = match?.trackedChangeAnchorKey != null ? String(match.trackedChangeAnchorKey) : null;
    const threadId = match?.commentId != null ? String(match.commentId) : null;
    if (!anchorKey || !threadId) {
      return {
        anchorKey: null,
        threadId: null,
        count: 0,
        pageIndexes: [],
        activePageIndexes: [],
      };
    }

    const renderedInstanceElements = [
      ...Array.from(
        document.querySelectorAll<HTMLElement>(`.comment-placeholder[data-comment-position-key="${anchorKey}"]`),
      ),
      ...Array.from(
        document.querySelectorAll<HTMLElement>(
          `#comments-panel .comments-dialog[data-comment-position-key="${anchorKey}"]`,
        ),
      ),
    ].filter((element) => element.dataset.commentThreadId === threadId);

    const parsePageIndex = (value: string | undefined) => {
      const pageIndex = Number(value ?? 'NaN');
      return Number.isFinite(pageIndex) ? pageIndex : null;
    };

    const instanceElementsById = new Map<string, HTMLElement>();
    renderedInstanceElements.forEach((element) => {
      const instanceId =
        element.dataset.commentInstanceId ??
        `${threadId}::page:${parsePageIndex(element.dataset.commentPageIndex) ?? 'unknown'}`;
      const existingElement = instanceElementsById.get(instanceId);
      const shouldPreferCurrentElement =
        existingElement == null ||
        (element.classList.contains('comments-dialog') && !existingElement.classList.contains('comments-dialog'));

      if (shouldPreferCurrentElement) {
        instanceElementsById.set(instanceId, element);
      }
    });

    const renderedInstances = [...instanceElementsById.values()];

    return {
      anchorKey,
      threadId,
      count: renderedInstances.length,
      pageIndexes: renderedInstances
        .map((element) => parsePageIndex(element.dataset.commentPageIndex))
        .filter((value): value is number => value != null)
        .sort((a, b) => a - b),
      activePageIndexes: renderedInstances
        .filter(
          (element) =>
            element.matches('.comments-dialog.is-active') ||
            Boolean(element.querySelector('.comments-dialog.is-active')),
        )
        .map((element) => parsePageIndex(element.dataset.commentPageIndex))
        .filter((value): value is number => value != null)
        .sort((a, b) => a - b),
    };
  }, insertedText);
}

async function clickFloatingBubbleInstance(page: Page, anchorKey: string, pageIndex: number): Promise<void> {
  const bubble = page.locator(
    [
      `.comment-placeholder[data-comment-position-key="${anchorKey}"][data-comment-page-index="${pageIndex}"] .comments-dialog`,
      `#comments-panel .comments-dialog[data-comment-position-key="${anchorKey}"][data-comment-page-index="${pageIndex}"]`,
    ].join(', '),
  );
  await expect(bubble).toBeVisible();
  await bubble.click();
}

async function readFirstPageHeaderIdentity(page: Page) {
  return page.evaluate(() => {
    const presentationEditor = (window as any).editor?.presentationEditor;
    const layoutSnapshot = presentationEditor?.getLayoutSnapshot?.();
    const page0 = layoutSnapshot?.layout?.pages?.[0] ?? null;
    const expectedRefId = page0?.sectionRefs?.headerRefs?.first ?? null;
    const fragment = document.querySelector<HTMLElement>('.superdoc-page-header [data-block-id]');
    const blockId = fragment?.getAttribute('data-block-id') ?? null;
    const renderedRefId = typeof blockId === 'string' ? (blockId.match(/^hf-header-([^:-]+)-/)?.[1] ?? null) : null;
    return { expectedRefId, renderedRefId };
  });
}

async function expectRenderedHeaderTrackChange(
  page: Page,
  insertedText: string,
  storyRefId?: string | null,
): Promise<void> {
  const selector = storyRefId
    ? `[data-story-key="hf:part:${storyRefId}"][data-track-change-id]`
    : '[data-track-change-id]';

  await expect(
    getHeaderSurfaceLocator(page)
      .locator(selector, {
        hasText: insertedText,
      })
      .first(),
  ).toBeVisible();
}

async function expectRenderedFooterTrackChange(page: Page, insertedText: string, pageIndex = 0): Promise<void> {
  await expect(
    getFooterSurfaceLocator(page, pageIndex)
      .locator('[data-track-change-id]', {
        hasText: insertedText,
      })
      .first(),
  ).toBeVisible();
}

test('header tracked changes get immediate bounds while editing and stay rendered after exit', async ({ superdoc }) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();

  const insertedText = 'HDRLIVE';
  await activateHeader(superdoc);
  await insertTrackedTextInActiveStory(superdoc.page, insertedText);
  await superdoc.waitForStable();

  await expect
    .poll(() => readTrackedChangeState(superdoc.page, insertedText), { timeout: 10_000 })
    .toEqual(
      expect.objectContaining({
        hasComment: true,
        hasBounds: true,
        floatingMatchCount: 1,
      }),
    );

  await expect(getHeaderEditorLocator(superdoc.page)).toContainText(insertedText);

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expectRenderedHeaderTrackChange(superdoc.page, insertedText);
});

test('footer tracked changes get immediate bounds while editing and stay rendered after exit', async ({ superdoc }) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();

  const insertedText = 'FTRLIVE';
  await activateFooter(superdoc);
  await insertTrackedTextInActiveStory(superdoc.page, insertedText);
  await superdoc.waitForStable();

  await expect
    .poll(() => readTrackedChangeState(superdoc.page, insertedText), { timeout: 10_000 })
    .toEqual(
      expect.objectContaining({
        hasComment: true,
        hasBounds: true,
        floatingMatchCount: 1,
      }),
    );

  await expect(getFooterEditorLocator(superdoc.page)).toContainText(insertedText);

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expectRenderedFooterTrackChange(superdoc.page, insertedText);
});

test('repeated footer tracked changes render on later pages without activating that footer', async ({ superdoc }) => {
  await superdoc.loadDocument(MULTI_PAGE_HEADER_FOOTER_DOC_PATH);
  await superdoc.waitForStable();
  await expect.poll(() => superdoc.page.locator('.superdoc-page-footer').count()).toBeGreaterThanOrEqual(2);

  const insertedText = 'FTRMULTIPAGE';
  await activateFooter(superdoc, 0);
  await insertTrackedTextInActiveStory(superdoc.page, insertedText);
  await superdoc.waitForStable();

  await expect
    .poll(() => readTrackedChangeState(superdoc.page, insertedText), { timeout: 10_000 })
    .toEqual(
      expect.objectContaining({
        hasComment: true,
        hasBounds: true,
        floatingMatchCount: 1,
        storyRefId: expect.any(String),
      }),
    );

  await expect(getFooterEditorLocator(superdoc.page)).toContainText(insertedText);

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expectRenderedFooterTrackChange(superdoc.page, insertedText, 0);

  const secondPageFooter = getFooterSurfaceLocator(superdoc.page, 1);
  await secondPageFooter.scrollIntoViewIfNeeded();
  await secondPageFooter.waitFor({ state: 'visible', timeout: 15_000 });
  await expectRenderedFooterTrackChange(superdoc.page, insertedText, 1);
});

test('repeated footer tracked-change anchors stay on the page that was edited', async ({ superdoc }) => {
  await superdoc.loadDocument(MULTI_PAGE_HEADER_FOOTER_DOC_PATH);
  await superdoc.waitForStable();
  await expect.poll(() => superdoc.page.locator('.superdoc-page-footer').count()).toBeGreaterThanOrEqual(3);

  const insertedText = 'FTRANCHORP3';
  await activateFooter(superdoc, 2);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await insertTrackedTextInActiveStory(superdoc.page, insertedText);
  await superdoc.waitForStable();

  await expect
    .poll(() => readTrackedChangeState(superdoc.page, insertedText), { timeout: 10_000 })
    .toEqual(
      expect.objectContaining({
        hasComment: true,
        hasBounds: true,
        floatingMatchCount: 1,
        storyRefId: expect.any(String),
      }),
    );

  await expect(getFooterEditorLocator(superdoc.page)).toContainText(insertedText);

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expect
    .poll(() => readTrackedChangeAnchorGeometry(superdoc.page, insertedText), { timeout: 10_000 })
    .toEqual({
      pageIndex: 2,
      boundsHeight: expect.any(Number),
      rectPageIndexes: [0, 1, 2],
    });

  const anchorGeometry = await readTrackedChangeAnchorGeometry(superdoc.page, insertedText);
  expect(anchorGeometry.boundsHeight).toBeLessThan(120);
});

test('repeated footer tracked changes render one floating bubble per page instance and activate the clicked page', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(MULTI_PAGE_HEADER_FOOTER_DOC_PATH);
  await superdoc.waitForStable();
  await expect.poll(() => superdoc.page.locator('.superdoc-page-footer').count()).toBeGreaterThanOrEqual(3);

  const insertedText = 'FTRBUBBLEP3';
  await activateFooter(superdoc, 2);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await insertTrackedTextInActiveStory(superdoc.page, insertedText);
  await superdoc.waitForStable();

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();

  await expect
    .poll(() => readFloatingBubbleInstances(superdoc.page, insertedText), { timeout: 10_000 })
    .toEqual({
      anchorKey: expect.any(String),
      threadId: expect.any(String),
      count: 3,
      pageIndexes: [0, 1, 2],
      activePageIndexes: [],
    });

  const floatingBubbleState = await readFloatingBubbleInstances(superdoc.page, insertedText);
  await clickFloatingBubbleInstance(superdoc.page, floatingBubbleState.anchorKey!, 2);
  await superdoc.waitForStable();

  await expect(getFooterEditorLocator(superdoc.page, 2)).toBeVisible();
  await expect(getFooterEditorLocator(superdoc.page, 2)).toContainText(insertedText);
  await expect
    .poll(() => readFloatingBubbleInstances(superdoc.page, insertedText), { timeout: 10_000 })
    .toEqual({
      anchorKey: floatingBubbleState.anchorKey,
      threadId: floatingBubbleState.threadId,
      count: 3,
      pageIndexes: [0, 1, 2],
      activePageIndexes: [2],
    });
});

test('first-page header tracked changes stay bound to the first-page story', async ({ superdoc }) => {
  await superdoc.loadDocument(FIRST_PAGE_HEADER_DOC_PATH);
  await superdoc.waitForStable();

  await expect
    .poll(() => readFirstPageHeaderIdentity(superdoc.page), { timeout: 10_000 })
    .toEqual({
      expectedRefId: expect.any(String),
      renderedRefId: expect.any(String),
    });

  const initialIdentity = await readFirstPageHeaderIdentity(superdoc.page);
  expect(initialIdentity.renderedRefId).toBe(initialIdentity.expectedRefId);

  const insertedText = 'FIRSTPGTC';
  await activateHeader(superdoc);
  await insertTrackedTextInActiveStory(superdoc.page, insertedText);
  await superdoc.waitForStable();

  await expect
    .poll(() => readTrackedChangeState(superdoc.page, insertedText), { timeout: 10_000 })
    .toEqual(
      expect.objectContaining({
        hasComment: true,
        hasBounds: true,
        floatingMatchCount: 1,
        storyRefId: initialIdentity.expectedRefId,
      }),
    );

  await exitActiveStory(superdoc.page);
  await superdoc.waitForStable();
  await superdoc.page.evaluate(() => window.scrollTo(0, 0));
  await expect(getHeaderSurfaceLocator(superdoc.page, 0)).toBeVisible();

  await expectRenderedHeaderTrackChange(superdoc.page, insertedText, initialIdentity.expectedRefId);
});
