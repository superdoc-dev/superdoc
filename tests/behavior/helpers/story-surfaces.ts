import { expect, type Locator, type Page } from '@playwright/test';
import type { StoryLocator } from '@superdoc/document-api';
import type { SuperDocFixture } from '../fixtures/superdoc.js';

type NoteStoryType = 'footnote' | 'endnote';

function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

async function getTextPointInternal(
  locator: Locator,
  {
    searchText,
    offsetWithinMatch = 0,
    align = 'center',
  }: {
    searchText: string;
    offsetWithinMatch?: number;
    align?: 'center' | 'boundary';
  },
) {
  const point = await locator.evaluate(
    (
      element,
      params: {
        searchText: string;
        offsetWithinMatch: number;
        align: 'center' | 'boundary';
      },
    ) => {
      const fullText = element.textContent ?? '';
      const matchStart = fullText.indexOf(params.searchText);
      if (matchStart < 0) return null;

      const targetOffset = Math.max(0, Math.min(fullText.length, matchStart + params.offsetWithinMatch));
      const doc = element.ownerDocument;
      if (!doc) return null;

      const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let remaining = targetOffset;
      let currentNode = walker.nextNode() as Text | null;
      while (currentNode) {
        const textLength = currentNode.textContent?.length ?? 0;
        if (remaining <= textLength) {
          const range = doc.createRange();
          const clampedOffset = Math.max(0, Math.min(textLength, remaining));
          range.setStart(currentNode, clampedOffset);
          range.setEnd(
            currentNode,
            params.align === 'center' ? Math.min(textLength, clampedOffset + params.searchText.length) : clampedOffset,
          );

          const rect = range.getBoundingClientRect();
          if (!rect || (rect.width === 0 && rect.height === 0)) {
            const fallbackRect = currentNode.parentElement?.getBoundingClientRect();
            if (!fallbackRect) return null;
            return {
              x:
                params.align === 'center'
                  ? fallbackRect.left + fallbackRect.width / 2
                  : fallbackRect.left + Math.min(2, fallbackRect.width / 2),
              y: fallbackRect.top + fallbackRect.height / 2,
            };
          }

          return {
            x: params.align === 'center' ? rect.left + rect.width / 2 : rect.left + 0.5,
            y: rect.top + rect.height / 2,
          };
        }

        remaining -= textLength;
        currentNode = walker.nextNode() as Text | null;
      }

      return null;
    },
    { searchText, offsetWithinMatch, align },
  );

  expect(point).toBeTruthy();
  return point!;
}

export async function getRenderedTextPoint(
  locator: Locator,
  searchText: string,
  offsetWithinMatch = 0,
): Promise<{ x: number; y: number }> {
  return getTextPointInternal(locator, { searchText, offsetWithinMatch, align: 'center' });
}

export async function getTextBoundaryPoint(
  locator: Locator,
  searchText: string,
  offsetWithinMatch = 0,
): Promise<{ x: number; y: number }> {
  return getTextPointInternal(locator, { searchText, offsetWithinMatch, align: 'boundary' });
}

export async function clickTextBoundary(
  page: Page,
  locator: Locator,
  searchText: string,
  offsetWithinMatch = 0,
): Promise<{ x: number; y: number }> {
  const point = await getTextBoundaryPoint(locator, searchText, offsetWithinMatch);
  await page.mouse.click(point.x, point.y);
  return point;
}

export async function doubleClickWord(page: Page, locator: Locator, word: string): Promise<void> {
  const point = await getRenderedTextPoint(locator, word);
  await page.mouse.dblclick(point.x, point.y);
}

export async function tripleClickWord(page: Page, locator: Locator, word: string): Promise<void> {
  const point = await getRenderedTextPoint(locator, word);
  await page.mouse.click(point.x, point.y, { clickCount: 3 });
}

export function getHeaderSurfaceLocator(page: Page, pageIndex = 0): Locator {
  return page.locator('.superdoc-page-header').nth(pageIndex);
}

export function getFooterSurfaceLocator(page: Page, pageIndex = 0): Locator {
  return page.locator('.superdoc-page-footer').nth(pageIndex);
}

export function getHeaderEditorLocator(page: Page): Locator {
  return page.locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"] .ProseMirror').first();
}

export function getFooterEditorLocator(page: Page): Locator {
  return page.locator('.presentation-editor__story-hidden-host[data-story-kind="headerFooter"] .ProseMirror').first();
}

export function getNoteSurfaceLocator(page: Page, input: { storyType: NoteStoryType; noteId: string }): Locator {
  const prefix = input.storyType === 'endnote' ? 'endnote' : 'footnote';
  return page
    .locator(
      `[data-block-id^="${prefix}-${input.noteId}-"], [data-block-id^="__sd_semantic_${prefix}-${input.noteId}-"]`,
    )
    .first();
}

export function getActiveNoteEditorLocator(page: Page): Locator {
  return page.locator('.presentation-editor__story-hidden-host[data-story-kind="note"] .ProseMirror').first();
}

export async function getActiveStorySession(page: Page): Promise<StoryLocator | null> {
  return page.evaluate(() => {
    const harness = (window as any).behaviorHarness;
    if (typeof harness?.getActiveStorySession === 'function') {
      return harness.getActiveStorySession();
    }

    const session = (window as any).editor?.presentationEditor?.getStorySessionManager?.()?.getActiveSession?.();
    return session?.locator ?? null;
  });
}

export async function waitForActiveStory(
  page: Page,
  expected:
    | null
    | Partial<StoryLocator>
    | {
        match: (story: StoryLocator | null) => boolean;
        description: string;
      },
): Promise<void> {
  if (expected === null) {
    await expect.poll(() => getActiveStorySession(page)).toBeNull();
    return;
  }

  if ('match' in expected) {
    await expect
      .poll(async () => expected.match(await getActiveStorySession(page)), { message: expected.description })
      .toBe(true);
    return;
  }

  await expect.poll(() => getActiveStorySession(page)).toEqual(expect.objectContaining(expected));
}

export async function exitActiveStory(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).editor?.presentationEditor?.getStorySessionManager?.()?.exit?.();
  });
  await waitForActiveStory(page, null);
}

export async function getActiveStoryText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const harness = (window as any).behaviorHarness;
    if (typeof harness?.getActiveStoryText === 'function') {
      return harness.getActiveStoryText();
    }

    const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
    if (!activeEditor) return null;
    return activeEditor.state?.doc?.textBetween?.(0, activeEditor.state.doc.content.size, '\n', '\n') ?? null;
  });
}

export async function getBodyStoryText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const harness = (window as any).behaviorHarness;
    if (typeof harness?.getBodyStoryText === 'function') {
      return harness.getBodyStoryText();
    }

    const bodyEditor = (window as any).editor;
    return bodyEditor?.state?.doc?.textBetween?.(0, bodyEditor.state.doc.content.size, '\n', '\n') ?? null;
  });
}

export async function activateHeader(superdoc: SuperDocFixture, pageIndex = 0): Promise<Locator> {
  const header = getHeaderSurfaceLocator(superdoc.page, pageIndex);
  await header.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await header.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, { storyType: 'headerFooterPart' });
  return header;
}

export async function activateFooter(superdoc: SuperDocFixture, pageIndex = 0): Promise<Locator> {
  const footer = getFooterSurfaceLocator(superdoc.page, pageIndex);
  await footer.scrollIntoViewIfNeeded();
  await footer.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await footer.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, { storyType: 'headerFooterPart' });
  return footer;
}

export async function activateNote(
  superdoc: SuperDocFixture,
  input: { storyType: NoteStoryType; noteId: string; expectedText?: string },
): Promise<Locator> {
  const note = getNoteSurfaceLocator(superdoc.page, input);
  await note.scrollIntoViewIfNeeded();
  await note.waitFor({ state: 'visible', timeout: 15_000 });
  if (input.expectedText) {
    await expect(note).toContainText(input.expectedText);
  }

  const box = await note.boundingBox();
  expect(box).toBeTruthy();
  await superdoc.page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await superdoc.waitForStable();
  await waitForActiveStory(superdoc.page, {
    kind: 'story',
    storyType: input.storyType,
    noteId: input.noteId,
  });
  return note;
}

export async function expectActiveStoryText(page: Page, expectedText: string): Promise<void> {
  await expect.poll(async () => normalizeText(await getActiveStoryText(page))).toBe(normalizeText(expectedText));
}

export async function expectActiveStoryTextToContain(page: Page, expectedText: string): Promise<void> {
  await expect.poll(async () => normalizeText(await getActiveStoryText(page))).toContain(normalizeText(expectedText));
}
