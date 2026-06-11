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
  // Leave the active header/footer story with a real body click. We deliberately
  // avoid targeting an individual `.superdoc-line`: those elements virtualize and
  // repaint, so holding a locator across scrollIntoView + click races with the
  // repaint on slower runners (webkit/CI) and throws "element is not attached /
  // not stable". The first line is also unsafe — in large-header docs it abuts the
  // header geometry region, so the click resolves into the still-active header
  // surface and the session is never exited (see EditorInputManager's
  // #handleClickInHeaderFooterMode: only a click on body content OR outside any
  // H/F region exits the session).
  //
  // Instead click the middle of the page's on-screen region via the stable
  // `.superdoc-page` container. Mid-page is always body content (header sits in the
  // top margin, footer in the bottom margin), so the exit branch always fires.
  const pageSurface = page.locator('.superdoc-page').first();
  await pageSurface.scrollIntoViewIfNeeded();
  const box = await pageSurface.boundingBox();
  expect(box).toBeTruthy();

  const viewport = page.viewportSize();
  const clickX = box!.x + box!.width / 2;
  const clickY = viewport
    ? (Math.max(box!.y, 0) + Math.min(box!.y + box!.height, viewport.height)) / 2
    : box!.y + box!.height / 2;
  await page.mouse.click(clickX, clickY);
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

async function historyUndoViaDocumentApi(page: Page) {
  return page.evaluate(() => (window as any).editor.doc.history.undo());
}

async function historyRedoViaDocumentApi(page: Page) {
  return page.evaluate(() => (window as any).editor.doc.history.redo());
}

async function getDocumentText(page: Page) {
  return page.evaluate(() => (window as any).editor.doc.getText({}));
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

test('undo from the body targets the most recent header edit before an earlier body edit', async ({ superdoc }) => {
  const bodyText = 'BODYFIRSTUNDO';
  const headerText = 'HEADERSECONDUNDO';

  await assertDocumentApiReady(superdoc.page);
  await superdoc.waitForStable();

  await clickBlankDocumentBody(superdoc.page);
  await superdoc.page.keyboard.insertText(bodyText);
  await superdoc.waitForStable();

  const bodyLocator = superdoc.page.locator('.superdoc-line').first();
  await expect(bodyLocator).toContainText(bodyText);

  const headerSurface = await activateBlankDocumentHeader(superdoc);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(headerText);
  await superdoc.waitForStable();

  await expect(headerSurface).toContainText(headerText);

  await clickBlankDocumentBody(superdoc.page);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, null);

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect(headerSurface).not.toContainText(headerText);
  await expect(bodyLocator).toContainText(bodyText);

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect(bodyLocator).not.toContainText(bodyText);
});

test('undo walks back footer edits before earlier header edits after leaving both story surfaces', async ({
  superdoc,
}) => {
  const headerText = 'HEADERCHAINUNDO';
  const footerText = 'FOOTERCHAINUNDO';

  await assertDocumentApiReady(superdoc.page);
  await superdoc.loadDocument(HEADER_FOOTER_DOC_PATH);
  await superdoc.waitForStable();

  const headerSurface = await activateHeader(superdoc);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(headerText);
  await superdoc.waitForStable();
  await expect(headerSurface).toContainText(headerText);

  const footerSurface = await activateFooter(superdoc);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(footerText);
  await superdoc.waitForStable();
  await expect(footerSurface).toContainText(footerText);
  await expect(headerSurface).toContainText(headerText);

  await clickBodySurface(superdoc.page);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, null);

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect(footerSurface).not.toContainText(footerText);
  await expect(headerSurface).toContainText(headerText);

  await superdoc.undo();
  await superdoc.waitForStable();

  await expect(headerSurface).not.toContainText(headerText);

  await superdoc.redo();
  await superdoc.waitForStable();
  await expect(headerSurface).toContainText(headerText);
  await expect(footerSurface).not.toContainText(footerText);

  await superdoc.redo();
  await superdoc.waitForStable();
  await expect(footerSurface).toContainText(footerText);
});

test('document history api follows unified order after leaving the header surface', async ({ superdoc }) => {
  const bodyText = 'BODYAPIGLOBAL';
  const headerText = 'HEADERAPIGLOBAL';

  await assertDocumentApiReady(superdoc.page);
  await superdoc.waitForStable();

  await clickBlankDocumentBody(superdoc.page);
  await superdoc.page.keyboard.insertText(bodyText);
  await superdoc.waitForStable();

  const bodyLocator = superdoc.page.locator('.superdoc-line').first();
  await expect(bodyLocator).toContainText(bodyText);

  const headerSurface = await activateBlankDocumentHeader(superdoc);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(headerText);
  await superdoc.waitForStable();
  await expect(headerSurface).toContainText(headerText);

  await clickBlankDocumentBody(superdoc.page);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, null);

  const undoResult = await historyUndoViaDocumentApi(superdoc.page);
  await superdoc.waitForStable();

  expect(undoResult.noop).toBe(false);
  await expect(headerSurface).not.toContainText(headerText);
  await expect(bodyLocator).toContainText(bodyText);

  const redoResult = await historyRedoViaDocumentApi(superdoc.page);
  await superdoc.waitForStable();

  expect(redoResult.noop).toBe(false);
  await expect(headerSurface).toContainText(headerText);
  await expect(bodyLocator).toContainText(bodyText);
});

test('a new body edit clears redo for a previously undone header edit', async ({ superdoc }) => {
  const originalBodyText = 'BODYBASELINE';
  const headerText = 'HEADERREDOCLEAR';
  const newBodyText = 'BODYAFTERUNDO';

  await assertDocumentApiReady(superdoc.page);
  await superdoc.waitForStable();

  await clickBlankDocumentBody(superdoc.page);
  await superdoc.page.keyboard.insertText(originalBodyText);
  await superdoc.waitForStable();

  const bodyLocator = superdoc.page.locator('.superdoc-line').first();
  await expect(bodyLocator).toContainText(originalBodyText);

  const headerSurface = await activateBlankDocumentHeader(superdoc);
  await moveActiveStoryCursorToEnd(superdoc.page);
  await superdoc.page.keyboard.insertText(headerText);
  await superdoc.waitForStable();
  await expect(headerSurface).toContainText(headerText);

  await clickBlankDocumentBody(superdoc.page);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, null);

  await superdoc.undo();
  await superdoc.waitForStable();
  await expect(headerSurface).not.toContainText(headerText);
  await expect(bodyLocator).toContainText(originalBodyText);

  await clickBlankDocumentBody(superdoc.page);
  await superdoc.page.keyboard.insertText(newBodyText);
  await superdoc.waitForStable();
  const documentTextBeforeRedo = await getDocumentText(superdoc.page);
  expect(documentTextBeforeRedo).toContain(newBodyText);

  const redoResult = await historyRedoViaDocumentApi(superdoc.page);
  await superdoc.waitForStable();

  expect(redoResult.noop).toBe(true);
  await expect(headerSurface).not.toContainText(headerText);
  await expect.poll(() => getDocumentText(superdoc.page)).toBe(documentTextBeforeRedo);
});
