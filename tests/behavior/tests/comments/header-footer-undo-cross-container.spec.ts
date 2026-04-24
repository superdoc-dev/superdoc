import type { Page } from '@playwright/test';
import { expect, test, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { LONGER_HEADER_SIGN_AREA_DOC_PATH as HEADER_FOOTER_DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  activateFooter,
  activateHeader,
  getFooterSurfaceLocator,
  getHeaderSurfaceLocator,
  moveActiveStoryCursorToEnd,
  waitForActiveStory,
} from '../../helpers/story-surfaces.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    documentMode: 'suggesting',
    showCaret: true,
    showSelection: true,
  },
});

type SurfaceKind = 'header' | 'footer';

async function getHeaderFooterTrackedChangeCount(page: Page, text: string) {
  return page.evaluate((insertedText) => {
    const comments = (window as any).behaviorHarness?.getCommentsSnapshot?.() ?? [];
    return comments.filter(
      (comment: any) =>
        comment?.trackedChange === true &&
        comment?.trackedChangeText === insertedText &&
        comment?.trackedChangeStory?.storyType === 'headerFooterPart',
    ).length;
  }, text);
}

async function getHeaderFooterSidebarCount(page: Page, text: string) {
  return page.evaluate((insertedText) => {
    const items = Array.from(document.querySelectorAll('#comments-panel .tracked-change-text'));
    return items.filter((item) => (item.textContent ?? '').includes(insertedText)).length;
  }, text);
}

async function activateSurface(superdoc: SuperDocFixture, surface: SurfaceKind) {
  if (surface === 'header') {
    return activateHeader(superdoc);
  }
  return activateFooter(superdoc);
}

function getSurfaceLocator(page: Page, surface: SurfaceKind) {
  return surface === 'header' ? getHeaderSurfaceLocator(page) : getFooterSurfaceLocator(page);
}

async function clickBodySurface(page: Page) {
  const bodyLine = page.locator('.superdoc-line').first();
  await bodyLine.scrollIntoViewIfNeeded();
  await bodyLine.click();
}

async function activateBlankDocumentHeader(superdoc: SuperDocFixture) {
  const pageSurface = superdoc.page.locator('.superdoc-page').first();
  await pageSurface.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await pageSurface.boundingBox();
  expect(box).toBeTruthy();

  await superdoc.page.mouse.dblclick(box!.x + 120, box!.y + 60);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, { storyType: 'headerFooterPart' });

  return getHeaderSurfaceLocator(superdoc.page);
}

async function clickBlankDocumentBody(page: Page) {
  const pageSurface = page.locator('.superdoc-page').first();
  const box = await pageSurface.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + 140, box!.y + 180);
}

for (const surface of ['header', 'footer'] as const) {
  test(`undo/redo from the body restores tracked ${surface} edits after leaving the active story`, async ({
    superdoc,
  }) => {
    const insertedText = surface === 'header' ? 'HDRUNDO' : 'FTRUNDO';

    await assertDocumentApiReady(superdoc.page);
    await superdoc.loadDocument(HEADER_FOOTER_DOC_PATH);
    await superdoc.waitForStable();

    const surfaceLocator = getSurfaceLocator(superdoc.page, surface);
    await activateSurface(superdoc, surface);
    await moveActiveStoryCursorToEnd(superdoc.page);
    await superdoc.page.keyboard.insertText(insertedText);
    await superdoc.waitForStable();

    await expect(surfaceLocator).toContainText(insertedText);
    await expect.poll(() => getHeaderFooterTrackedChangeCount(superdoc.page, insertedText)).toBe(1);
    await expect.poll(() => getHeaderFooterSidebarCount(superdoc.page, insertedText)).toBe(1);

    await clickBodySurface(superdoc.page);
    await superdoc.waitForStable();
    await waitForActiveStory(superdoc.page, null);

    await superdoc.undo();
    await superdoc.waitForStable();

    await expect(surfaceLocator).not.toContainText(insertedText);
    await expect.poll(() => getHeaderFooterTrackedChangeCount(superdoc.page, insertedText)).toBe(0);
    await expect.poll(() => getHeaderFooterSidebarCount(superdoc.page, insertedText)).toBe(0);

    await superdoc.redo();
    await superdoc.waitForStable();

    await expect(surfaceLocator).toContainText(insertedText);
    await expect.poll(() => getHeaderFooterTrackedChangeCount(superdoc.page, insertedText)).toBe(1);
    await expect.poll(() => getHeaderFooterSidebarCount(superdoc.page, insertedText)).toBe(1);
  });
}

test('undo from the body removes blank-document tracked header edits after leaving the active story', async ({
  superdoc,
}) => {
  const insertedText = 'BLANKHDRUNDO';

  await assertDocumentApiReady(superdoc.page);
  await superdoc.waitForStable();

  const headerSurface = await activateBlankDocumentHeader(superdoc);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(insertedText);
  await superdoc.waitForStable();

  await expect(headerSurface).toContainText(insertedText);
  await expect.poll(() => getHeaderFooterTrackedChangeCount(superdoc.page, insertedText)).toBe(1);
  await expect.poll(() => getHeaderFooterSidebarCount(superdoc.page, insertedText)).toBe(1);

  await clickBlankDocumentBody(superdoc.page);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, null);

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect(headerSurface).not.toContainText(insertedText);
  await expect.poll(() => getHeaderFooterTrackedChangeCount(superdoc.page, insertedText)).toBe(0);
  await expect.poll(() => getHeaderFooterSidebarCount(superdoc.page, insertedText)).toBe(0);
});
