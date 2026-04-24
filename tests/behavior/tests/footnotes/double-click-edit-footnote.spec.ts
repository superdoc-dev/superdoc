import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import {
  BASIC_FOOTNOTES_DOC_PATH as DOC_PATH,
  COMPLEX_IMPORTED_FOOTNOTES_DOC_PATH,
} from '../../helpers/story-fixtures.js';

test.use({ config: { showCaret: true, showSelection: true } });

type FootnoteBehaviorHarness = {
  page: Page;
  loadDocument: (docPath: string) => Promise<void>;
  waitForStable: (ms?: number) => Promise<void>;
};

function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

async function getTextClickPoint(locator: Locator, searchText: string, offsetWithinMatch = 0) {
  return locator.evaluate(
    (element, params: { searchText: string; offsetWithinMatch: number }) => {
      const fullText = element.textContent ?? '';
      const matchStart = fullText.indexOf(params.searchText);
      if (matchStart < 0) {
        return null;
      }

      const targetOffset = Math.max(0, Math.min(fullText.length, matchStart + params.offsetWithinMatch));
      const doc = element.ownerDocument;
      if (!doc) {
        return null;
      }

      const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let remaining = targetOffset;
      let currentNode: Text | null = walker.nextNode() as Text | null;
      while (currentNode) {
        const textLength = currentNode.textContent?.length ?? 0;
        if (remaining <= textLength) {
          const range = doc.createRange();
          const clampedOffset = Math.max(0, Math.min(textLength, remaining));
          range.setStart(currentNode, clampedOffset);
          range.setEnd(currentNode, clampedOffset);
          const rect = range.getBoundingClientRect();
          if (!rect || (rect.width === 0 && rect.height === 0)) {
            const fallbackRect = currentNode.parentElement?.getBoundingClientRect();
            if (!fallbackRect) {
              return null;
            }
            return {
              x: fallbackRect.left + 2,
              y: fallbackRect.top + fallbackRect.height / 2,
            };
          }

          return {
            x: rect.left + 1,
            y: rect.top + rect.height / 2,
          };
        }

        remaining -= textLength;
        currentNode = walker.nextNode() as Text | null;
      }

      return null;
    },
    { searchText, offsetWithinMatch },
  );
}

async function getBoundaryClickPoint(locator: Locator, searchText: string, offsetWithinMatch = 0) {
  return locator.evaluate(
    (element, params: { searchText: string; offsetWithinMatch: number }) => {
      const fullText = element.textContent ?? '';
      const matchStart = fullText.indexOf(params.searchText);
      if (matchStart < 0) {
        return null;
      }

      const targetOffset = Math.max(0, Math.min(fullText.length, matchStart + params.offsetWithinMatch));
      const doc = element.ownerDocument;
      if (!doc) {
        return null;
      }

      const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let remaining = targetOffset;
      let currentNode: Text | null = walker.nextNode() as Text | null;
      while (currentNode) {
        const textLength = currentNode.textContent?.length ?? 0;
        if (remaining <= textLength) {
          const range = doc.createRange();
          const clampedOffset = Math.max(0, Math.min(textLength, remaining));
          range.setStart(currentNode, clampedOffset);
          range.setEnd(currentNode, clampedOffset);
          const rect = range.getBoundingClientRect();
          if (!rect) {
            return null;
          }

          return {
            x: rect.left + 0.5,
            y: rect.top + rect.height / 2,
          };
        }

        remaining -= textLength;
        currentNode = walker.nextNode() as Text | null;
      }

      return null;
    },
    { searchText, offsetWithinMatch },
  );
}

async function getWordRect(locator: Locator, searchText: string) {
  return locator.evaluate((element, targetText: string) => {
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
    let currentNode: Text | null = walker.nextNode() as Text | null;
    while (currentNode) {
      const textLength = currentNode.textContent?.length ?? 0;
      if (remaining < textLength) {
        const range = doc.createRange();
        const endOffset = Math.min(textLength, remaining + targetText.length);
        range.setStart(currentNode, remaining);
        range.setEnd(currentNode, endOffset);
        const rect = range.getBoundingClientRect();
        if (!rect) {
          return null;
        }

        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      }

      remaining -= textLength;
      currentNode = walker.nextNode() as Text | null;
    }

    return null;
  }, searchText);
}

async function getSelectionOverlayRect(page: Page) {
  const selectionRect = page.locator('.presentation-editor__selection-rect').first();
  await expect(selectionRect).toBeVisible();
  const box = await selectionRect.boundingBox();
  expect(box).toBeTruthy();
  return box!;
}

async function expectVisibleCaret(page: Page) {
  const caret = page.locator('.presentation-editor__selection-caret').first();
  await expect(caret).toBeVisible();
  const box = await caret.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  return box!;
}

async function expectCaretAlignedToVisibleBoundary(
  page: Page,
  footnote: Locator,
  searchText: string,
  offsetWithinMatch: number,
  tolerancePx = 3,
) {
  const boundaryPoint = await getBoundaryClickPoint(footnote, searchText, offsetWithinMatch);
  expect(boundaryPoint).toBeTruthy();

  const caretBox = await expectVisibleCaret(page);
  expect(Math.abs(caretBox.x - boundaryPoint!.x)).toBeLessThanOrEqual(tolerancePx);
}

async function getActiveSelectionPosition(page: Page) {
  return page.evaluate(() => {
    const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
    return activeEditor?.state?.selection?.from ?? null;
  });
}

async function getHitTestPosition(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x: clientX, y: clientY }) => {
      const hit = (window as any).editor?.presentationEditor?.hitTest?.(clientX, clientY);
      return hit?.pos ?? null;
    },
    { x, y },
  );
}

async function getActiveStorySession(page: Page) {
  return page.evaluate(() => {
    const session = (window as any).editor?.presentationEditor?.getStorySessionManager?.()?.getActiveSession?.();
    return session?.locator ?? null;
  });
}

async function expectInsertedMarkerBeforeEdited(footnote: Locator) {
  const text = await footnote.textContent();
  expect(text).toBeTruthy();

  const insertedIndex = text!.indexOf('X');
  const editedIndex = text!.indexOf('edited');

  expect(insertedIndex).toBeGreaterThanOrEqual(0);
  expect(editedIndex).toBeGreaterThan(insertedIndex);
}

async function getActiveStoryText(page: Page) {
  return page.evaluate(() => {
    const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
    return activeEditor?.state?.doc?.textBetween?.(0, activeEditor.state.doc.content.size, '\n', '\n') ?? null;
  });
}

async function getBodyStoryText(page: Page) {
  return page.evaluate(() => {
    const bodyEditor = (window as any).editor;
    return bodyEditor?.state?.doc?.textBetween?.(0, bodyEditor.state.doc.content.size, '\n', '\n') ?? null;
  });
}

function getFootnoteLocator(page: Page, noteId: string): Locator {
  return page.locator(`[data-block-id^="footnote-${noteId}-"]`).first();
}

function getBodyFragmentLocator(page: Page, text: string): Locator {
  return page
    .locator('[data-block-id]:not([data-block-id^="footnote-"]):not([data-block-id^="__sd_semantic_footnote-"])')
    .filter({ hasText: text })
    .first();
}

async function insertTextIntoBodyAtVisibleBoundary(
  page: Page,
  bodySurface: Locator,
  searchText: string,
  offsetWithinMatch: number,
  insertedText: string,
): Promise<number> {
  const boundaryPoint = await getBoundaryClickPoint(bodySurface, searchText, offsetWithinMatch);
  expect(boundaryPoint).toBeTruthy();

  const hitPosition = await getHitTestPosition(page, boundaryPoint!.x, boundaryPoint!.y);
  expect(hitPosition).not.toBeNull();

  await page.evaluate(
    ({ position, text }) => {
      const editor = (window as any).editor;
      if (!editor?.view) {
        throw new Error('Body editor view is unavailable.');
      }

      editor.view.dispatch(editor.state.tr.insertText(text, position, position));
    },
    { position: hitPosition, text: insertedText },
  );

  return hitPosition!;
}

async function loadAndActivateFootnote(
  superdoc: FootnoteBehaviorHarness,
  noteId: string,
  expectedText: string,
  docPath = DOC_PATH,
): Promise<Locator> {
  await superdoc.loadDocument(docPath);
  await superdoc.waitForStable();

  const footnote = getFootnoteLocator(superdoc.page, noteId);
  await footnote.scrollIntoViewIfNeeded();
  await footnote.waitFor({ state: 'visible', timeout: 15_000 });
  await expect(footnote).toContainText(expectedText);

  const box = await footnote.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();
  await expectVisibleCaret(superdoc.page);
  await expect
    .poll(() => getActiveStorySession(superdoc.page))
    .toEqual({
      kind: 'story',
      storyType: 'footnote',
      noteId,
    });

  return footnote;
}

async function clickFootnoteBoundary(
  page: Page,
  footnote: Locator,
  searchText: string,
  offsetWithinMatch: number,
): Promise<{ x: number; y: number }> {
  const boundaryPoint = await getBoundaryClickPoint(footnote, searchText, offsetWithinMatch);
  expect(boundaryPoint).toBeTruthy();

  await page.mouse.click(boundaryPoint!.x, boundaryPoint!.y);
  return boundaryPoint!;
}

async function expectCaretAtClickBoundary(
  page: Page,
  footnote: Locator,
  searchText: string,
  offsetWithinMatch: number,
): Promise<number> {
  const boundaryPoint = await clickFootnoteBoundary(page, footnote, searchText, offsetWithinMatch);
  await expect(page.locator('.presentation-editor__selection-caret').first()).toBeVisible();
  await expect.poll(() => getActiveSelectionPosition(page)).not.toBeNull();

  const selectionAfterClick = await getActiveSelectionPosition(page);
  const hitAfterClick = await getHitTestPosition(page, boundaryPoint.x, boundaryPoint.y);
  const domSelectionAfterClick = await getActiveDomSelection(page);

  expect(selectionAfterClick).not.toBeNull();
  expect(selectionAfterClick).toBe(hitAfterClick);
  expect(domSelectionAfterClick?.anchorPos).toBe(selectionAfterClick);

  return selectionAfterClick!;
}

async function expectStoryText(page: Page, expectedText: string) {
  await expect.poll(async () => normalizeText(await getActiveStoryText(page))).toBe(normalizeText(expectedText));
}

async function expectStoryTextToContain(page: Page, expectedText: string) {
  await expect.poll(async () => normalizeText(await getActiveStoryText(page))).toContain(normalizeText(expectedText));
}

async function getActiveDomSelection(page: Page) {
  return page.evaluate(() => {
    const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
    const view = activeEditor?.view;
    const selection = view?.dom?.ownerDocument?.getSelection?.();
    if (!view || !selection || !selection.anchorNode) {
      return null;
    }

    const anchorInside = view.dom.contains(selection.anchorNode);
    const focusInside = selection.focusNode ? view.dom.contains(selection.focusNode) : false;

    let anchorPos = null;
    let focusPos = null;
    try {
      if (anchorInside) {
        anchorPos = view.posAtDOM(selection.anchorNode, selection.anchorOffset, -1);
      }
      if (focusInside && selection.focusNode) {
        focusPos = view.posAtDOM(selection.focusNode, selection.focusOffset, -1);
      }
    } catch {}

    return {
      anchorInside,
      focusInside,
      anchorOffset: selection.anchorOffset,
      focusOffset: selection.focusOffset,
      anchorPos,
      focusPos,
      text: selection.toString(),
    };
  });
}

test('double-click rendered footnote to edit it through the presentation surface', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  const footnote = await loadAndActivateFootnote(superdoc, '1', 'This is a simple footnote');
  const storyHost = superdoc.page.locator('.presentation-editor__story-hidden-host[data-story-kind="note"]').first();
  await expect(storyHost).toHaveAttribute('data-story-key', /.+/);

  if (browserName === 'firefox') {
    await superdoc.page.evaluate(() => {
      const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
      activeEditor?.commands?.insertContent?.(' edited');
    });
  } else {
    await superdoc.page.keyboard.press('End');
    await superdoc.page.keyboard.insertText(' edited');
  }
  await superdoc.waitForStable();
  if (browserName !== 'firefox') {
    await expect(footnote).toContainText('This is a simple footnote edited', { timeout: 10_000 });
    const selectionAtEnd = await getActiveSelectionPosition(superdoc.page);
    expect(selectionAtEnd).not.toBeNull();

    const startPoint = await getTextClickPoint(footnote, 'This', 0);
    expect(startPoint).toBeTruthy();
    await superdoc.page.mouse.click(startPoint!.x, startPoint!.y);
    await superdoc.waitForStable();
    await expectVisibleCaret(superdoc.page);
    const selectionAfterClick = await getActiveSelectionPosition(superdoc.page);
    expect(selectionAfterClick).not.toBeNull();
    expect(selectionAfterClick!).toBeLessThan(selectionAtEnd!);

    await superdoc.page.keyboard.insertText('X');
    await superdoc.waitForStable();
    await expectInsertedMarkerBeforeEdited(footnote);
  }

  await superdoc.page.keyboard.press('Escape');
  await superdoc.waitForStable();
  await expectInsertedMarkerBeforeEdited(footnote);
});

test('clicking inside footnote text inserts at the exact requested character boundary', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  const footnote = await loadAndActivateFootnote(superdoc, '1', 'This is a simple footnote');
  await expectCaretAtClickBoundary(superdoc.page, footnote, 'footnote', 4);

  await superdoc.page.keyboard.insertText('a');
  await superdoc.waitForStable();

  await expectStoryTextToContain(superdoc.page, 'footanote');
  await expect(footnote).toContainText('footanote');
});

test('footnote caret placement supports inserts at the note start, inside a word, and at the note end', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  const footnote = await loadAndActivateFootnote(superdoc, '1', 'This is a simple footnote');

  await expectCaretAtClickBoundary(superdoc.page, footnote, 'This', 0);
  await superdoc.page.keyboard.insertText('X');
  await superdoc.waitForStable();
  await expectStoryText(superdoc.page, 'XThis is a simple footnote');
  await expect(footnote).toContainText('XThis is a simple footnote');

  await expectCaretAtClickBoundary(superdoc.page, footnote, 'footnote', 4);
  await superdoc.page.keyboard.insertText('a');
  await superdoc.waitForStable();
  await expectStoryText(superdoc.page, 'XThis is a simple footanote');
  await expect(footnote).toContainText('XThis is a simple footanote');

  await expectCaretAtClickBoundary(superdoc.page, footnote, 'footanote', 'footanote'.length);
  await superdoc.page.keyboard.insertText('!');
  await superdoc.waitForStable();
  await expectStoryText(superdoc.page, 'XThis is a simple footanote!');
  await expect(footnote).toContainText('XThis is a simple footanote!');
});

test('footnote caret placement stays correct on later note lines above table content', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  const footnote = await loadAndActivateFootnote(superdoc, '2', 'A longer one with a table');

  await expectCaretAtClickBoundary(superdoc.page, footnote, 'with', 1);
  await superdoc.page.keyboard.insertText('a');
  await superdoc.waitForStable();

  await expectStoryTextToContain(superdoc.page, 'A longer one waith a table');
  await expectStoryTextToContain(superdoc.page, 'And multi-paragraph content');
  await expect(footnote).toContainText('A longer one waith a table');
});

test('footnote backspace deletes the character immediately before the visible caret', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  const footnote = await loadAndActivateFootnote(superdoc, '1', 'This is a simple footnote');

  await expectCaretAtClickBoundary(superdoc.page, footnote, 'simple', 3);
  await superdoc.page.keyboard.press('Backspace');
  await superdoc.waitForStable();

  await expectStoryText(superdoc.page, 'This is a siple footnote');
  await expect(footnote).toContainText('This is a siple footnote');
});

test('double-click word selection stays horizontally aligned with rendered footnote text', async ({
  superdoc,
  browserName,
}) => {
  test.fixme(
    browserName === 'firefox',
    'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
  );

  const footnote = await loadAndActivateFootnote(superdoc, '1', 'This is a simple footnote');

  const simplePoint = await getTextClickPoint(footnote, 'simple', 2);
  const simpleRect = await getWordRect(footnote, 'simple');
  expect(simplePoint).toBeTruthy();
  expect(simpleRect).toBeTruthy();

  await superdoc.page.mouse.dblclick(simplePoint!.x, simplePoint!.y);
  await superdoc.waitForStable();

  const domSelectionAfterClick = await getActiveDomSelection(superdoc.page);
  expect(domSelectionAfterClick?.text).toBe('simple');

  const overlayRect = await getSelectionOverlayRect(superdoc.page);
  expect(Math.abs(overlayRect.x - simpleRect!.left)).toBeLessThanOrEqual(2.5);
  expect(Math.abs(overlayRect.width - simpleRect!.width)).toBeLessThanOrEqual(3);
});

test.describe('suggesting mode routing', () => {
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

  test('typing stays in the active footnote even if body focus is restored underneath the session', async ({
    superdoc,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
    );

    const footnote = await loadAndActivateFootnote(superdoc, '1', 'This is a simple footnote');

    await expectCaretAtClickBoundary(superdoc.page, footnote, 'simple', 3);

    const originalBodyText = await getBodyStoryText(superdoc.page);
    expect(originalBodyText).toContain('Simple text');

    await superdoc.page.evaluate(() => {
      (window as any).editor?.view?.focus?.();
    });

    await expect
      .poll(() =>
        superdoc.page.evaluate(() => {
          const bodyEditor = (window as any).editor;
          const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
          const session = (window as any).editor?.presentationEditor?.getStorySessionManager?.()?.getActiveSession?.();

          return {
            bodyHasFocus: bodyEditor?.view?.hasFocus?.() ?? false,
            activeIsBody: activeEditor === bodyEditor,
            sessionLocator: session?.locator ?? null,
          };
        }),
      )
      .toEqual({
        bodyHasFocus: true,
        activeIsBody: false,
        sessionLocator: {
          kind: 'story',
          storyType: 'footnote',
          noteId: '1',
        },
      });

    await superdoc.page.keyboard.type('Z');
    await superdoc.waitForStable();

    await expectStoryText(superdoc.page, 'This is a simZple footnote');
    await expect(footnote).toContainText('This is a simZple footnote');
    await expect(getBodyStoryText(superdoc.page)).resolves.toBe(originalBodyText);
  });

  test('tracked inserts keep the active footnote caret aligned with the rendered insertion point', async ({
    superdoc,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
    );

    const footnote = await loadAndActivateFootnote(
      superdoc,
      '1',
      'If only one closing is contemplated',
      COMPLEX_IMPORTED_FOOTNOTES_DOC_PATH,
    );

    await expectCaretAtClickBoundary(superdoc.page, footnote, 'references', 3);

    let insertedText = '';
    for (const nextChar of ['X', 'Y', 'Z']) {
      insertedText += nextChar;
      await superdoc.page.keyboard.insertText(nextChar);
      await superdoc.waitForStable(300);

      await expectStoryTextToContain(superdoc.page, `ref${insertedText}erences`);
      await expect(footnote).toContainText(`ref${insertedText}erences`);
      await expectCaretAlignedToVisibleBoundary(
        superdoc.page,
        footnote,
        `ref${insertedText}erences`,
        3 + insertedText.length,
      );
    }
  });

  test('word selection overlay stays aligned after a tracked insert splits the note text', async ({
    superdoc,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
    );

    const footnote = await loadAndActivateFootnote(
      superdoc,
      '1',
      'If only one closing is contemplated',
      COMPLEX_IMPORTED_FOOTNOTES_DOC_PATH,
    );

    await expectCaretAtClickBoundary(superdoc.page, footnote, 'references', 3);
    await superdoc.page.keyboard.insertText('XYZ');
    await superdoc.waitForStable(300);
    await expect(footnote).toContainText('refXYZerences');

    const selectedWord = 'Closing';
    const selectedWordPoint = await getTextClickPoint(footnote, selectedWord, 2);
    const selectedWordRect = await getWordRect(footnote, selectedWord);
    expect(selectedWordPoint).toBeTruthy();
    expect(selectedWordRect).toBeTruthy();

    await superdoc.page.mouse.dblclick(selectedWordPoint!.x, selectedWordPoint!.y);
    await superdoc.waitForStable();

    const domSelectionAfterClick = await getActiveDomSelection(superdoc.page);
    expect(domSelectionAfterClick?.text).toBe(selectedWord);

    const overlayRect = await getSelectionOverlayRect(superdoc.page);
    expect(Math.abs(overlayRect.x - selectedWordRect!.left)).toBeLessThanOrEqual(2.5);
    expect(Math.abs(overlayRect.width - selectedWordRect!.width)).toBeLessThanOrEqual(3);
  });

  test('footnote clicks stay accurately mapped after returning to the body in suggesting mode', async ({
    superdoc,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
    );

    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable(1000);

    const footnote = getFootnoteLocator(superdoc.page, '1');
    await footnote.scrollIntoViewIfNeeded();
    await footnote.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(footnote).toContainText('This is a simple footnote');

    const noteBox = await footnote.boundingBox();
    expect(noteBox).toBeTruthy();
    await superdoc.page.mouse.dblclick(noteBox!.x + noteBox!.width / 2, noteBox!.y + noteBox!.height / 2);
    await superdoc.waitForStable(300);

    const initialBoundary = await getBoundaryClickPoint(footnote, 'simple', 3);
    expect(initialBoundary).toBeTruthy();
    await superdoc.page.mouse.click(initialBoundary!.x, initialBoundary!.y);
    await superdoc.waitForStable(200);
    await superdoc.page.keyboard.type('Z');
    await superdoc.waitForStable(300);

    await expectStoryText(superdoc.page, 'This is a simZple footnote');
    await expect(footnote).toContainText('This is a simZple footnote');

    const bodySurface = getBodyFragmentLocator(superdoc.page, 'Simple text');
    const bodyBox = await bodySurface.boundingBox();
    expect(bodyBox).toBeTruthy();
    await superdoc.page.mouse.click(bodyBox!.x + bodyBox!.width / 2, bodyBox!.y + bodyBox!.height / 2);
    await superdoc.waitForStable(300);

    const bodyTextAfterReturn = await getBodyStoryText(superdoc.page);
    expect(bodyTextAfterReturn).toContain('Simple text');

    // First click re-enters the note.
    const reentryActivationBoundary = await getBoundaryClickPoint(footnote, 'footnote', 2);
    expect(reentryActivationBoundary).toBeTruthy();
    await superdoc.page.mouse.click(reentryActivationBoundary!.x, reentryActivationBoundary!.y);
    await superdoc.waitForStable(300);

    // Second click inside the now-active note must still map to the exact
    // requested boundary after the tracked insert.
    const reentryBoundary = await getBoundaryClickPoint(footnote, 'simZple', 4);
    expect(reentryBoundary).toBeTruthy();
    await superdoc.page.mouse.click(reentryBoundary!.x, reentryBoundary!.y);
    await superdoc.waitForStable(300);

    const reentryState = await superdoc.page.evaluate(({ x, y }) => {
      const editor = (window as any).editor;
      const presentation = editor?.presentationEditor;
      const activeEditor = presentation?.getActiveEditor?.();
      const session = presentation?.getStorySessionManager?.()?.getActiveSession?.();
      const view = activeEditor?.view;
      const selection = activeEditor?.state?.selection?.from ?? null;
      const hit = presentation?.hitTest?.(x, y)?.pos ?? null;
      const domSelection = view?.dom?.ownerDocument?.getSelection?.();

      let anchorPos = null;
      try {
        if (view && domSelection?.anchorNode && view.dom.contains(domSelection.anchorNode)) {
          anchorPos = view.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset, -1);
        }
      } catch {}

      return {
        session: session?.locator ?? null,
        selection,
        hit,
        anchorPos,
      };
    }, reentryBoundary!);

    expect(reentryState.session).toEqual({
      kind: 'story',
      storyType: 'footnote',
      noteId: '1',
    });
    expect(reentryState.selection).toBe(reentryState.hit);
    expect(reentryState.anchorPos).toBe(reentryState.selection);
    await expect(getBodyStoryText(superdoc.page)).resolves.toBe(bodyTextAfterReturn);
  });

  test('body edits do not corrupt footnote click mapping after a footnote edit', async ({ superdoc, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
    );

    const footnote = await loadAndActivateFootnote(superdoc, '1', 'This is a simple footnote');

    await expectCaretAtClickBoundary(superdoc.page, footnote, 'footnote', 1);
    await superdoc.page.keyboard.insertText('X0');
    await superdoc.waitForStable(300);
    await expect(footnote).toContainText('fX0ootnote');

    await superdoc.page.evaluate(() => {
      (window as any).editor?.presentationEditor?.getStorySessionManager?.()?.exit?.();
    });
    await superdoc.waitForStable(300);
    await expect.poll(() => getActiveStorySession(superdoc.page)).toBeNull();

    const bodySurface = getBodyFragmentLocator(superdoc.page, 'Simple text');
    await insertTextIntoBodyAtVisibleBoundary(superdoc.page, bodySurface, 'footnotes', 1, 'X0');
    await superdoc.waitForStable(300);

    const bodyTextAfterBodyEdit = await getBodyStoryText(superdoc.page);
    expect(bodyTextAfterBodyEdit).toContain('fX0ootnotes');
    await expect(footnote).toContainText('fX0ootnote');

    await clickFootnoteBoundary(superdoc.page, footnote, 'fX0ootnote', 4);
    await superdoc.waitForStable(300);
    await expect
      .poll(() => getActiveStorySession(superdoc.page))
      .toEqual({
        kind: 'story',
        storyType: 'footnote',
        noteId: '1',
      });

    await expectCaretAtClickBoundary(superdoc.page, footnote, 'fX0ootnote', 6);

    await superdoc.page.keyboard.insertText('Z');
    await superdoc.waitForStable(300);

    await expect(footnote).toContainText('fX0ootZnote');
    await expect(getBodyStoryText(superdoc.page)).resolves.toBe(bodyTextAfterBodyEdit);
  });

  test('complex imported footnotes stay aligned when the note starts with hidden separator content', async ({
    superdoc,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
    );

    let footnote = await loadAndActivateFootnote(
      superdoc,
      '1',
      'If only one closing is contemplated',
      COMPLEX_IMPORTED_FOOTNOTES_DOC_PATH,
    );

    await expectCaretAtClickBoundary(superdoc.page, footnote, 'contemplated', 1);
    await superdoc.page.keyboard.insertText('x');
    await superdoc.waitForStable(300);
    await expectStoryTextToContain(superdoc.page, 'cxontemplated');
    await expect(footnote).toContainText('cxontemplated');
  });

  test('complex imported footnotes stay aligned when the note contains hidden field-code passthrough nodes', async ({
    superdoc,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Headless Firefox does not yet persist hidden-host footnote edits through the behavior harness.',
    );

    let footnote = await loadAndActivateFootnote(
      superdoc,
      '2',
      'The Company may have tax reporting',
      COMPLEX_IMPORTED_FOOTNOTES_DOC_PATH,
    );

    await expectCaretAtClickBoundary(superdoc.page, footnote, 'reporting', 1);
    await superdoc.page.keyboard.insertText('x');
    await superdoc.waitForStable(300);
    await expectStoryTextToContain(superdoc.page, 'rxeporting');
    await expect(footnote).toContainText('rxeporting');
  });
});
