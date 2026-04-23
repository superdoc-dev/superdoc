import { test, expect, type Locator, type Page, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { LONGER_HEADER_SIGN_AREA_DOC_PATH as DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  activateFooter,
  activateHeader,
  getRenderedTextPoint,
  clickTextBoundary,
  expectActiveStoryTextToContain,
  getActiveStorySession,
  waitForActiveStory,
} from '../../helpers/story-surfaces.js';

test.use({ config: { showCaret: true, showSelection: true } });

async function measureRenderedWordRect(locator: Locator, searchText: string) {
  const rect = await locator.evaluate((element, expectedText) => {
    const doc = element.ownerDocument;
    if (!doc) {
      return null;
    }

    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const text = node.textContent ?? '';
      const matchIndex = text.indexOf(expectedText);
      if (matchIndex >= 0) {
        const range = doc.createRange();
        range.setStart(node, matchIndex);
        range.setEnd(node, matchIndex + expectedText.length);
        const bounds = range.getBoundingClientRect();
        const containerBounds = element.getBoundingClientRect();
        return {
          left: bounds.left - containerBounds.left,
          top: bounds.top - containerBounds.top,
          width: bounds.width,
          height: bounds.height,
        };
      }
      node = walker.nextNode() as Text | null;
    }

    return null;
  }, searchText);

  expect(rect).toBeTruthy();
  return rect!;
}

async function expectRenderedSurfaceStable(
  page: Page,
  surface: Locator,
  word: string,
  activate: () => Promise<void>,
): Promise<void> {
  const before = await measureRenderedWordRect(surface, word);
  await activate();

  await expect(page.locator('.superdoc-header-editor-host, .superdoc-footer-editor-host')).toHaveCount(0);

  const after = await measureRenderedWordRect(surface, word);
  expect(Math.abs(after.left - before.left)).toBeLessThan(1);
  expect(Math.abs(after.top - before.top)).toBeLessThan(1);
  expect(Math.abs(after.width - before.width)).toBeLessThan(1);
  expect(Math.abs(after.height - before.height)).toBeLessThan(1);
}

async function expectVisibleCaretNearClickedBoundary(
  page: Page,
  surface: Locator,
  word: string,
  offsetWithinWord = 0,
): Promise<void> {
  const point = await clickTextBoundary(page, surface, word, offsetWithinWord);
  await page.waitForTimeout(100);

  const caret = page.locator('.presentation-editor__selection-caret').first();
  await expect(caret).toBeVisible();
  await page.waitForTimeout(950);
  const opacity = await caret.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity || '0'));
  expect(opacity).toBeGreaterThan(0.2);

  const caretMetrics = await caret.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });

  expect(Math.abs(caretMetrics.left - point.x)).toBeLessThanOrEqual(8);
  expect(Math.abs(caretMetrics.top + caretMetrics.height / 2 - point.y)).toBeLessThanOrEqual(3);
  expect(caretMetrics.height).toBeGreaterThan(8);
}

async function expectVisibleCaretAfterActivationDoubleClick(page: Page, surface: Locator, word: string): Promise<void> {
  const point = await getRenderedTextPoint(surface, word);
  await page.mouse.dblclick(point.x, point.y);
  await waitForActiveStory(page, { storyType: 'headerFooterPart' });
  await page.waitForTimeout(150);

  const caret = page.locator('.presentation-editor__selection-caret').first();
  await expect(caret).toBeVisible();

  const caretMetrics = await caret.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });

  expect(Math.abs(caretMetrics.left - point.x)).toBeLessThanOrEqual(8);
  expect(Math.abs(caretMetrics.top + caretMetrics.height / 2 - point.y)).toBeLessThanOrEqual(3);
  expect(caretMetrics.height).toBeGreaterThan(8);
}

async function expectBlankDocumentHeaderCaretAfterActivation(superdoc: SuperDocFixture): Promise<void> {
  const pageSurface = superdoc.page.locator('.superdoc-page').first();
  await pageSurface.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await pageSurface.boundingBox();
  expect(box).toBeTruthy();

  const activationPoint = {
    x: box!.x + 120,
    y: box!.y + 60,
  };

  await superdoc.page.mouse.dblclick(activationPoint.x, activationPoint.y);
  await waitForActiveStory(superdoc.page, { storyType: 'headerFooterPart' });
  await superdoc.waitForStable();

  const caret = superdoc.page.locator('.presentation-editor__selection-caret').first();
  await expect(caret).toBeVisible();

  const caretMetrics = await caret.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      height: rect.height,
    };
  });

  expect(Math.abs(caretMetrics.left - activationPoint.x)).toBeLessThanOrEqual(80);
  expect(Math.abs(caretMetrics.top + caretMetrics.height / 2 - activationPoint.y)).toBeLessThanOrEqual(40);
  expect(caretMetrics.height).toBeGreaterThan(8);
}

async function exitToBody(superdoc: SuperDocFixture) {
  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();

  if (await getActiveStorySession(superdoc.page)) {
    const bodyLine = superdoc.page.locator('.superdoc-line').first();
    await bodyLine.waitFor({ state: 'visible', timeout: 15_000 });
    await bodyLine.click();
    await superdoc.waitForStable();
  }

  await waitForActiveStory(superdoc.page, null);
}

test('double-click header to enter edit mode, type, and exit', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  await activateHeader(superdoc);

  const storyHost = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"]')
    .first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  // Editing runs through the hidden-host PM while the visible header remains painted.
  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' - Edited');
  await superdoc.waitForStable();
  await expectActiveStoryTextToContain(superdoc.page, 'Edited');

  await exitToBody(superdoc);

  await activateHeader(superdoc);
  await expectActiveStoryTextToContain(superdoc.page, 'Edited');

  await superdoc.snapshot('header-edited');
});

test('activating a header keeps the painted header stable and does not show a visible editor host', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const headerSurface = superdoc.page.locator('.superdoc-page-header').first();
  await expectRenderedSurfaceStable(superdoc.page, headerSurface, 'Generic', async () => {
    await activateHeader(superdoc);
  });
});

test('header editing shows a visible caret at the clicked boundary', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const headerSurface = await activateHeader(superdoc);
  await expectVisibleCaretNearClickedBoundary(superdoc.page, headerSurface, 'Generic', 3);
});

test('double-clicking into an inactive header places the initial caret at the clicked word', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const headerSurface = superdoc.page.locator('.superdoc-page-header').first();
  await expectVisibleCaretAfterActivationDoubleClick(superdoc.page, headerSurface, 'Generic');
  await waitForActiveStory(superdoc.page, { storyType: 'headerFooterPart' });
});

test('double-click footer to enter edit mode, type, and exit', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  await activateFooter(superdoc);

  const storyHost = superdoc.page
    .locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"]')
    .first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.insertText(' - Edited');
  await superdoc.waitForStable();
  await expectActiveStoryTextToContain(superdoc.page, 'Edited');

  await exitToBody(superdoc);

  await activateFooter(superdoc);
  await expectActiveStoryTextToContain(superdoc.page, 'Edited');

  await superdoc.snapshot('footer-edited');
});

test('activating a footer keeps the painted footer stable and does not show a visible editor host', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const footerSurface = superdoc.page.locator('.superdoc-page-footer').first();
  await expectRenderedSurfaceStable(superdoc.page, footerSurface, 'Footer', async () => {
    await activateFooter(superdoc);
  });
});

test('footer editing shows a visible caret at the clicked boundary', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const footerSurface = await activateFooter(superdoc);
  await expectVisibleCaretNearClickedBoundary(superdoc.page, footerSurface, 'Footer', 2);
});

test('double-clicking into an inactive footer places the initial caret at the clicked word', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const footerSurface = superdoc.page.locator('.superdoc-page-footer').first();
  await footerSurface.scrollIntoViewIfNeeded();
  await expectVisibleCaretAfterActivationDoubleClick(superdoc.page, footerSurface, 'Footer');
  await waitForActiveStory(superdoc.page, { storyType: 'headerFooterPart' });
});

test('blank document header activation shows a visible caret', async ({ superdoc }) => {
  await superdoc.waitForStable();
  await expectBlankDocumentHeaderCaretAfterActivation(superdoc);
});
