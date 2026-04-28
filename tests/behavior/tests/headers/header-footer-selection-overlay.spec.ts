import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/superdoc.js';
import { LONGER_HEADER_SIGN_AREA_DOC_PATH as DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  getFooterEditorLocator,
  getFooterSurfaceLocator,
  getHeaderEditorLocator,
  getHeaderSurfaceLocator,
} from '../../helpers/story-surfaces.js';

const MOD_KEY = process.platform === 'darwin' ? 'Meta' : 'Control';

test.use({ config: { showSelection: true } });

async function enterHeaderFooterEditMode(surface: Locator, editor: Locator): Promise<Locator> {
  await surface.scrollIntoViewIfNeeded();
  await surface.waitFor({ state: 'visible', timeout: 15_000 });

  const box = await surface.boundingBox();
  expect(box).toBeTruthy();
  await surface.page().mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await editor.waitFor({ state: 'visible', timeout: 10_000 });
  return editor;
}

async function assertSelectionOverlayRenders(
  page: Page,
  _editor: Locator,
  expectedSelectionText: string,
): Promise<void> {
  await page.keyboard.press(`${MOD_KEY}+A`);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const activeEditor =
          (window as any).editor?.presentationEditor?.getActiveEditor?.() ?? (window as any).editor ?? null;
        const selection = activeEditor?.state?.selection;
        const doc = activeEditor?.state?.doc;
        if (!selection || !doc) {
          return '';
        }
        return doc.textBetween(selection.from, selection.to, '\n', '\n').trim();
      }),
    )
    .toBe(expectedSelectionText);

  await expect.poll(async () => page.locator('.presentation-editor__selection-rect').count()).toBeGreaterThan(0);

  const selectionRect = page.locator('.presentation-editor__selection-rect');
  await expect(selectionRect.first()).toBeVisible();
}

async function getRenderedWordRect(surface: Locator, word: string) {
  const rect = await surface.evaluate((element, targetWord) => {
    const doc = element.ownerDocument;
    if (!doc) {
      return null;
    }

    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const text = node.textContent ?? '';
      const matchIndex = text.indexOf(targetWord);
      if (matchIndex >= 0) {
        const range = doc.createRange();
        range.setStart(node, matchIndex);
        range.setEnd(node, matchIndex + targetWord.length);
        const bounds = range.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        };
      }
      node = walker.nextNode() as Text | null;
    }

    return null;
  }, word);

  expect(rect).toBeTruthy();
  return rect!;
}

async function assertWordSelectionOverlayAlignment(page: Page, surface: Locator, word: string): Promise<void> {
  const wordRect = await getRenderedWordRect(surface, word);
  expect(wordRect).toBeTruthy();

  await page.mouse.dblclick(wordRect.left + wordRect.width / 2, wordRect.top + wordRect.height / 2);
  await page.waitForTimeout(100);

  const selectionRect = page.locator('.presentation-editor__selection-rect').first();
  await expect(selectionRect).toBeVisible();

  const overlayRect = await selectionRect.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  });

  expect(Math.abs(overlayRect.left - wordRect.left)).toBeLessThan(2);
  expect(Math.abs(overlayRect.top - wordRect.top)).toBeLessThan(2);
  expect(Math.abs(overlayRect.width - wordRect.width)).toBeLessThan(2);
  expect(Math.abs(overlayRect.height - wordRect.height)).toBeLessThan(2);
}

test('layout engine renders selection rectangles while editing a header', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const editor = await enterHeaderFooterEditMode(
    getHeaderSurfaceLocator(superdoc.page),
    getHeaderEditorLocator(superdoc.page),
  );

  await assertSelectionOverlayRenders(superdoc.page, editor, 'Generic content header');
});

test('layout engine renders selection rectangles while editing a footer', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const editor = await enterHeaderFooterEditMode(
    getFooterSurfaceLocator(superdoc.page),
    getFooterEditorLocator(superdoc.page),
  );

  await assertSelectionOverlayRenders(superdoc.page, editor, 'Footer');
});

test('header word selection overlay aligns with the rendered word bounds', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const surface = getHeaderSurfaceLocator(superdoc.page);
  await enterHeaderFooterEditMode(surface, getHeaderEditorLocator(superdoc.page));
  await assertWordSelectionOverlayAlignment(superdoc.page, surface, 'Generic');
});

test('footer word selection overlay aligns with the rendered word bounds', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  const surface = getFooterSurfaceLocator(superdoc.page);
  await enterHeaderFooterEditMode(surface, getFooterEditorLocator(superdoc.page));
  await assertWordSelectionOverlayAlignment(superdoc.page, surface, 'Footer');
});
