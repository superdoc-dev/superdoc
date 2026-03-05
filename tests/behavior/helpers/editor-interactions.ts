import type { Page } from '@playwright/test';

/**
 * Right-clicks at the screen location corresponding to a document position in the SuperDoc editor.
 *
 * This helper queries the editor's coordinates for the given logical document position, calculates a suitable
 * (x, y) point within the bounding rectangle, and dispatches a mouse right-click at that spot.
 *
 * Throws if coordinates cannot be resolved for the given position.
 *
 * @param {Page} page - The Playwright test page instance.
 * @param {number} pos - The logical document position (character offset) at which to right-click.
 * @returns {Promise<void>} Resolves when the click has been dispatched.
 */
export async function rightClickAtDocPos(page: Page, pos: number): Promise<void> {
  const coords = await page.evaluate((targetPos) => {
    const editor = (window as any).editor;
    const rect = editor?.coordsAtPos?.(targetPos);
    if (!rect) return null;
    return {
      left: Number(rect.left),
      right: Number(rect.right),
      top: Number(rect.top),
      bottom: Number(rect.bottom),
    };
  }, pos);

  if (!coords) {
    throw new Error(`Could not resolve coordinates for document position ${pos}`);
  }

  const x = Math.min(Math.max(coords.left + 1, coords.left), Math.max(coords.right - 1, coords.left + 1));
  const y = (coords.top + coords.bottom) / 2;
  await page.mouse.click(x, y, { button: 'right' });
}
