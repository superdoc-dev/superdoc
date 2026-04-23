import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import {
  BASIC_ENDNOTES_DOC_PATH as ENDNOTE_DOC_PATH,
  BASIC_FOOTNOTES_DOC_PATH as FOOTNOTE_DOC_PATH,
  LONGER_HEADER_SIGN_AREA_DOC_PATH as HEADER_DOC_PATH,
} from '../../helpers/story-fixtures.js';

test.use({
  config: {
    showCaret: true,
    showSelection: true,
  },
});

const MULTI_CLICK_RESET_MS = 450;

function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

async function getWordClickPoint(locator: Locator, searchText: string) {
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
      const length = currentNode.textContent?.length ?? 0;
      if (remaining < length) {
        const range = doc.createRange();
        const startOffset = Math.max(0, remaining);
        const endOffset = Math.min(length, remaining + targetText.length);
        range.setStart(currentNode, startOffset);
        range.setEnd(currentNode, endOffset);

        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          const fallback = currentNode.parentElement?.getBoundingClientRect();
          if (!fallback) {
            return null;
          }
          return {
            x: fallback.left + Math.min(8, fallback.width / 2),
            y: fallback.top + fallback.height / 2,
          };
        }

        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }

      remaining -= length;
      currentNode = walker.nextNode() as Text | null;
    }

    return null;
  }, searchText);

  expect(point).toBeTruthy();
  return point!;
}

async function getFirstWord(locator: Locator) {
  const word = await locator.evaluate((element) => {
    const text = element.textContent ?? '';
    const match = text.match(/\p{L}[\p{L}\p{N}]*/u);
    return match?.[0] ?? null;
  });

  expect(word).toBeTruthy();
  return word!;
}

async function getSelectionOverlayRects(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.presentation-editor__selection-rect'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return null;
        }

        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(Boolean),
  );
}

async function getActiveSelection(page: Page) {
  return page.evaluate(() => {
    const activeEditor =
      (window as any).editor?.presentationEditor?.getActiveEditor?.() ?? (window as any).editor ?? null;
    const state = activeEditor?.state;
    const selection = state?.selection;
    if (!state?.doc || !selection) {
      return null;
    }

    return {
      from: selection.from,
      to: selection.to,
      empty: selection.empty,
      text: state.doc.textBetween(selection.from, selection.to, '\n', '\n'),
    };
  });
}

async function getActiveEditorText(page: Page) {
  const text = await page.evaluate(() => {
    const activeEditor =
      (window as any).editor?.presentationEditor?.getActiveEditor?.() ?? (window as any).editor ?? null;
    const state = activeEditor?.state;
    if (!state?.doc) {
      return null;
    }

    return state.doc.textBetween(0, state.doc.content.size, '\n', '\n');
  });

  return normalizeText(text);
}

async function expectWordSelection(page: Page, expectedWord: string) {
  const selection = await getActiveSelection(page);
  expect(selection).toBeTruthy();
  expect(normalizeText(selection?.text)).toBe(expectedWord);
}

async function expectParagraphSelection(page: Page, expectedText: string, minWordLength: number) {
  const selection = await getActiveSelection(page);
  expect(selection).toBeTruthy();
  expect(selection?.empty).toBe(false);
  expect(normalizeText(selection?.text)).toBe(expectedText);
  expect(normalizeText(selection?.text).length).toBeGreaterThanOrEqual(minWordLength);
}

test('body surface supports double-click word selection and triple-click paragraph selection', async ({ superdoc }) => {
  await superdoc.type('alpha beta gamma');
  await superdoc.waitForStable();

  const line = superdoc.page.locator('.superdoc-line').first();
  const point = await getWordClickPoint(line, 'beta');

  await superdoc.page.mouse.dblclick(point.x, point.y);
  await superdoc.waitForStable();
  await expectWordSelection(superdoc.page, 'beta');

  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.click(point.x, point.y, { clickCount: 3 });
  await superdoc.waitForStable();
  await expectParagraphSelection(superdoc.page, 'alpha beta gamma', 'beta'.length);
});

test('body surface selection does not leak into visible footnotes', async ({ superdoc }) => {
  await superdoc.loadDocument(FOOTNOTE_DOC_PATH);
  await superdoc.waitForStable();

  const bodyLine = superdoc.page.locator('.superdoc-line', { hasText: 'Simple text1 with footnotes' }).first();
  await bodyLine.waitFor({ state: 'visible', timeout: 15_000 });

  const point = await getWordClickPoint(bodyLine, 'Simple');
  await superdoc.page.mouse.dblclick(point.x, point.y);
  await superdoc.waitForStable();

  await expectWordSelection(superdoc.page, 'Simple');

  const selectionRects = await getSelectionOverlayRects(superdoc.page);
  expect(selectionRects).toHaveLength(1);
});

test('active header supports double-click word selection and triple-click paragraph selection', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();

  const header = superdoc.page.locator('.superdoc-page-header').first();
  await header.waitFor({ state: 'visible', timeout: 15_000 });

  const headerBox = await header.boundingBox();
  expect(headerBox).toBeTruthy();
  await superdoc.page.mouse.dblclick(headerBox!.x + headerBox!.width / 2, headerBox!.y + headerBox!.height / 2);
  await superdoc.waitForStable();

  const activeParagraphText = await getActiveEditorText(superdoc.page);
  expect(activeParagraphText.length).toBeGreaterThan(0);

  const word = await getFirstWord(header);
  const point = await getWordClickPoint(header, word);
  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.dblclick(point.x, point.y);
  await superdoc.waitForStable();
  await expectWordSelection(superdoc.page, word);

  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.click(point.x, point.y, { clickCount: 3 });
  await superdoc.waitForStable();
  await expectParagraphSelection(superdoc.page, activeParagraphText, word.length);
});

test('active footer supports double-click word selection and triple-click paragraph selection', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable();

  const footer = superdoc.page.locator('.superdoc-page-footer').first();
  await footer.scrollIntoViewIfNeeded();
  await footer.waitFor({ state: 'visible', timeout: 15_000 });

  const footerBox = await footer.boundingBox();
  expect(footerBox).toBeTruthy();
  await superdoc.page.mouse.dblclick(footerBox!.x + footerBox!.width / 2, footerBox!.y + footerBox!.height / 2);
  await superdoc.waitForStable();

  const activeParagraphText = await getActiveEditorText(superdoc.page);
  expect(activeParagraphText.length).toBeGreaterThan(0);

  const word = await getFirstWord(footer);
  const point = await getWordClickPoint(footer, word);
  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.dblclick(point.x, point.y);
  await superdoc.waitForStable();
  await expectWordSelection(superdoc.page, word);

  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.click(point.x, point.y, { clickCount: 3 });
  await superdoc.waitForStable();
  await expectParagraphSelection(superdoc.page, activeParagraphText, word.length);
});

test('active footnote supports double-click word selection and triple-click paragraph selection', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  await superdoc.loadDocument(FOOTNOTE_DOC_PATH);
  await superdoc.waitForStable();

  const footnote = superdoc.page.locator('[data-block-id^="footnote-1-"]').first();
  await footnote.scrollIntoViewIfNeeded();
  await footnote.waitFor({ state: 'visible', timeout: 15_000 });

  const footnoteBox = await footnote.boundingBox();
  expect(footnoteBox).toBeTruthy();
  await superdoc.page.mouse.dblclick(footnoteBox!.x + footnoteBox!.width / 2, footnoteBox!.y + footnoteBox!.height / 2);
  await superdoc.waitForStable();

  const activeParagraphText = await getActiveEditorText(superdoc.page);
  expect(activeParagraphText).toBe('This is a simple footnote');

  const point = await getWordClickPoint(footnote, 'footnote');
  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.dblclick(point.x, point.y);
  await superdoc.waitForStable();
  await expectWordSelection(superdoc.page, 'footnote');

  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.click(point.x, point.y, { clickCount: 3 });
  await superdoc.waitForStable();
  await expectParagraphSelection(superdoc.page, activeParagraphText, 'footnote'.length);
});

test('active endnote supports double-click word selection and triple-click paragraph selection', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host endnote edits through the behavior harness.',
  );

  await superdoc.loadDocument(ENDNOTE_DOC_PATH);
  await superdoc.waitForStable();

  const endnote = superdoc.page.locator('[data-block-id^="endnote-1-"]').first();
  await endnote.scrollIntoViewIfNeeded();
  await endnote.waitFor({ state: 'visible', timeout: 15_000 });

  const endnoteBox = await endnote.boundingBox();
  expect(endnoteBox).toBeTruthy();
  await superdoc.page.mouse.dblclick(endnoteBox!.x + endnoteBox!.width / 2, endnoteBox!.y + endnoteBox!.height / 2);
  await superdoc.waitForStable();

  const activeParagraphText = await getActiveEditorText(superdoc.page);
  expect(activeParagraphText).toBe('This is a simple endnote');

  const point = await getWordClickPoint(endnote, 'endnote');
  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.dblclick(point.x, point.y);
  await superdoc.waitForStable();
  await expectWordSelection(superdoc.page, 'endnote');

  await superdoc.page.waitForTimeout(MULTI_CLICK_RESET_MS);

  await superdoc.page.mouse.click(point.x, point.y, { clickCount: 3 });
  await superdoc.waitForStable();
  await expectParagraphSelection(superdoc.page, activeParagraphText, 'endnote'.length);
});
