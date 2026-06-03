import type { Page } from '@playwright/test';

async function getDocPosCoords(
  page: Page,
  pos: number,
): Promise<{ left: number; right: number; top: number; bottom: number }> {
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

  return coords;
}

export async function clickAtDocPos(page: Page, pos: number): Promise<void> {
  const coords = await getDocPosCoords(page, pos);
  await page.mouse.click(coords.left + 1, (coords.top + coords.bottom) / 2);
}

export async function rightClickAtDocPos(page: Page, pos: number): Promise<void> {
  const coords = await getDocPosCoords(page, pos);
  await page.mouse.click(coords.left + 1, (coords.top + coords.bottom) / 2, { button: 'right' });
}
