/**
 * Shared helpers for comment-related interaction stories.
 */

import type { Page } from '@playwright/test';

/** Shape of the superdoc object exposed on window in the test harness. */
interface TestSuperdocWindow {
  superdoc?: {
    getActiveComment?: () => string | null;
  };
}

/** Candidate highlight element with its index and bounding box area. */
interface HighlightCandidate {
  index: number;
  area: number;
}

/**
 * Check if text matches the given pattern.
 * Handles RegExp safely by avoiding stateful .test() with global/sticky flags.
 * @param text - The text to check
 * @param pattern - String to search for, or RegExp to match against
 * @returns True if the text matches the pattern
 */
function textMatches(text: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return text.includes(pattern);
  }
  // Use .match() instead of .test() to avoid stateful behavior with global regexes
  return text.match(pattern) !== null;
}

/**
 * Click on a comment highlight element that contains the specified text.
 * When multiple highlights match (nested/overlapping comments), clicks the one
 * with the smallest bounding box area to select the innermost comment.
 * @param page - Playwright page instance
 * @param textMatch - Text string or RegExp to match against highlight content
 * @returns Resolves when the highlight has been clicked
 * @throws Error if no matching comment highlight is found
 */
export async function clickOnCommentedText(page: Page, textMatch: string | RegExp): Promise<void> {
  const highlights = page.locator('.superdoc-comment-highlight');
  const count = await highlights.count();

  const candidates: HighlightCandidate[] = [];

  // Find all matching highlights and their bounding box areas
  for (let i = 0; i < count; i++) {
    const highlight = highlights.nth(i);
    const text = await highlight.textContent();

    if (text === null) continue;

    if (textMatches(text, textMatch)) {
      const box = await highlight.boundingBox();
      if (box) {
        candidates.push({
          index: i,
          area: box.width * box.height,
        });
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No comment highlight found containing text: ${textMatch}`);
  }

  // Sort by area ascending and click the smallest (innermost) highlight
  candidates.sort((a, b) => a.area - b.area);
  const smallest = candidates[0];

  await highlights.nth(smallest.index).click();
}

/**
 * Click on a comment bubble in the sidebar panel by its comment/conversation ID.
 * @param page - Playwright page instance
 * @param commentId - The comment or conversation ID to click
 * @returns Resolves when the bubble has been clicked
 */
export async function clickOnCommentBubble(page: Page, commentId: string): Promise<void> {
  const bubble = page.locator(`.sd-comment-box[data-id="${commentId}"]`);
  await bubble.waitFor({ state: 'visible', timeout: 5000 });
  await bubble.click();
}

/**
 * Get the currently active comment ID from the comments store.
 * Falls back to checking the DOM if the store API is unavailable.
 * @param page - Playwright page instance
 * @returns The active comment ID, or null if no comment is active
 */
export async function getActiveCommentId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const superdoc = (window as TestSuperdocWindow).superdoc;
    if (superdoc?.getActiveComment) {
      return superdoc.getActiveComment();
    }

    // Fallback: check for active comment in the DOM
    const activeBox = document.querySelector('.sd-comment-box.active, .sd-comment-box[data-active="true"]');
    return activeBox?.getAttribute('data-id') ?? null;
  });
}

/**
 * Get all comment IDs associated with the highlight element at a given point.
 * @param page - Playwright page instance
 * @param x - X coordinate in viewport pixels
 * @param y - Y coordinate in viewport pixels
 * @returns Array of comment IDs at the given point, or empty array if none
 */
export async function getCommentIdsAtPoint(page: Page, x: number, y: number): Promise<string[]> {
  return page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      if (!element) return [];

      const highlight = element.closest('.superdoc-comment-highlight');
      if (!highlight) return [];

      const ids = highlight.getAttribute('data-comment-ids');
      return ids ? ids.split(',') : [];
    },
    { x, y },
  );
}

/**
 * Wait for the comment panel to stabilize after a selection change.
 * @param page - Playwright page instance
 * @param ms - Milliseconds to wait (default: 300)
 * @returns Resolves after the wait period
 */
export async function waitForCommentPanelStable(page: Page, ms = 300): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Click on text within the document (not necessarily a comment highlight).
 * Useful for clicking outside comment ranges to deselect.
 * @param page - Playwright page instance
 * @param textMatch - Text string to find and click
 * @returns Resolves when the text element has been clicked
 */
export async function clickOnText(page: Page, textMatch: string): Promise<void> {
  // Find text in the layout engine rendered content
  const textElement = page.locator('.superdoc-page').getByText(textMatch, { exact: false }).first();
  await textElement.click();
}

/**
 * Click at a position relative to a specific line in the document.
 * Useful for precise clicking when text matching is ambiguous.
 * @param page - Playwright page instance
 * @param lineIndex - Zero-based index of the line to click
 * @param xOffset - Horizontal offset from the left edge of the line (default: 10)
 * @returns Resolves when the click has been performed
 * @throws Error if the line is not found or not visible
 */
export async function clickOnLine(page: Page, lineIndex: number, xOffset = 10): Promise<void> {
  const lines = page.locator('.superdoc-line');
  const line = lines.nth(lineIndex);
  const box = await line.boundingBox();

  if (!box) {
    throw new Error(`Line ${lineIndex} not found or not visible`);
  }

  await page.mouse.click(box.x + xOffset, box.y + box.height / 2);
}
