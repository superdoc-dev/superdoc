import { expect, test, type Page } from '../../fixtures/superdoc.js';
import {
  H_F_NORMAL_ODD_EVEN_FIRSTPG_DOC_PATH as FIRST_PAGE_HEADER_DOC_PATH,
  LONGER_HEADER_SIGN_AREA_DOC_PATH as HEADER_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import {
  activateFooter,
  activateHeader,
  getFooterSurfaceLocator,
  getHeaderSurfaceLocator,
  waitForActiveStory,
} from '../../helpers/story-surfaces.js';

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    documentMode: 'suggesting',
    useHiddenHostForStoryParts: true,
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

async function exitToBody(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).editor?.presentationEditor?.getStorySessionManager?.()?.exit?.();
  });
  await waitForActiveStory(page, null);
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

  await exitToBody(superdoc.page);
  await superdoc.waitForStable();

  await expect(
    getHeaderSurfaceLocator(superdoc.page).locator('[data-track-change-id]', { hasText: insertedText }).first(),
  ).toBeVisible();
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

  await exitToBody(superdoc.page);
  await superdoc.waitForStable();

  await expect(
    getFooterSurfaceLocator(superdoc.page).locator('[data-track-change-id]', { hasText: insertedText }).first(),
  ).toBeVisible();
});

test('first-page headers keep the concrete section ref before and after tracked-change editing', async ({
  superdoc,
}) => {
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

  await exitToBody(superdoc.page);
  await superdoc.waitForStable();

  const finalIdentity = await readFirstPageHeaderIdentity(superdoc.page);
  expect(finalIdentity.renderedRefId).toBe(initialIdentity.expectedRefId);

  await expect(
    getHeaderSurfaceLocator(superdoc.page)
      .locator(`[data-story-key="hf:part:${initialIdentity.expectedRefId}"][data-track-change-id]`, {
        hasText: insertedText,
      })
      .first(),
  ).toBeVisible();
});
