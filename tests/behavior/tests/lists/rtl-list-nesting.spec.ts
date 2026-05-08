import { test, expect } from '../../fixtures/superdoc.js';
import { listItems } from '../../helpers/document-api.js';
import { getAllListLevels } from '../../helpers/lists.js';

const MARKER_SELECTOR = '.superdoc-paragraph-marker';

async function setAllListItemsDirectionRtl(superdoc: {
  page: import('@playwright/test').Page;
  waitForStable: () => Promise<void>;
}) {
  const snapshot = await listItems(superdoc.page);

  for (const item of snapshot.items) {
    await superdoc.page.evaluate((target) => {
      const paragraphApi = (window as any).editor?.doc?.format?.paragraph;
      if (!paragraphApi?.setDirection) {
        throw new Error('Document API is unavailable: expected editor.doc.format.paragraph.setDirection().');
      }

      paragraphApi.setDirection({
        target,
        direction: 'rtl',
      });
    }, item.address);
  }

  await superdoc.waitForStable();
}

async function getLinePmRange(
  superdoc: { page: import('@playwright/test').Page },
  lineIndex: number,
): Promise<{ start: number; end: number }> {
  return superdoc.page.evaluate((idx) => {
    const line = document.querySelectorAll<HTMLElement>('.superdoc-line')[idx];
    if (!line) throw new Error(`Line ${idx} not found.`);
    const start = Number(line.getAttribute('data-pm-start'));
    const end = Number(line.getAttribute('data-pm-end'));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`Line ${idx} has invalid PM range.`);
    }
    return { start, end };
  }, lineIndex);
}

test.describe('rtl lists', () => {
  test('keeps nested levels and renders markers on the rtl side', async ({ superdoc }) => {
    await superdoc.type('1. level 0');
    await superdoc.newLine();
    await superdoc.press('Tab');
    await superdoc.type('level 1');
    await superdoc.newLine();
    await superdoc.press('Tab');
    await superdoc.type('level 2');
    await superdoc.waitForStable();

    await setAllListItemsDirectionRtl(superdoc);

    const levels = await getAllListLevels(superdoc);
    expect(levels).toEqual([0, 1, 2]);

    const markerCount = await superdoc.page.locator(MARKER_SELECTOR).count();
    expect(markerCount).toBe(3);

    const lineDirs = await superdoc.page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.superdoc-line'))
        .slice(0, 3)
        .map((el) => el.getAttribute('dir')),
    );
    expect(lineDirs).toEqual(['rtl', 'rtl', 'rtl']);

    const markerOnRightForEachLine = await superdoc.page.evaluate(() => {
      const markers = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-paragraph-marker')).slice(0, 3);
      return markers.map((marker) => {
        const line = marker.closest('.superdoc-line') as HTMLElement | null;
        if (!line) return false;
        const markerRect = marker.getBoundingClientRect();
        const lineRect = line.getBoundingClientRect();
        return markerRect.left > lineRect.left + lineRect.width * 0.5;
      });
    });
    expect(markerOnRightForEachLine).toEqual([true, true, true]);
  });

  test('applies Tab and Shift+Tab level changes in rtl lists', async ({ superdoc }) => {
    await superdoc.type('1. one');
    await superdoc.newLine();
    await superdoc.type('two');
    await superdoc.newLine();
    await superdoc.type('three');
    await superdoc.waitForStable();

    await setAllListItemsDirectionRtl(superdoc);

    const initialLevels = await getAllListLevels(superdoc);
    expect(initialLevels).toEqual([0, 0, 0]);

    await superdoc.page.keyboard.press('ArrowUp');
    await superdoc.waitForStable();
    await superdoc.press('Tab');
    await superdoc.waitForStable();

    const afterTabLevels = await getAllListLevels(superdoc);
    expect(afterTabLevels).toEqual([0, 1, 0]);

    await superdoc.press('Shift+Tab');
    await superdoc.waitForStable();

    const afterShiftTabLevels = await getAllListLevels(superdoc);
    expect(afterShiftTabLevels).toEqual([0, 0, 0]);
  });

  test('ArrowLeft and ArrowRight move caret visually in rtl list line', async ({ superdoc }) => {
    await superdoc.type('1. one');
    await superdoc.newLine();
    await superdoc.type('two two two');
    await superdoc.waitForStable();

    await setAllListItemsDirectionRtl(superdoc);

    const range = await getLinePmRange(superdoc, 1);
    const interiorPos = range.start + Math.max(1, Math.floor((range.end - range.start) / 2));
    await superdoc.setTextSelection(interiorPos, interiorPos);
    await superdoc.waitForStable();

    const beforeLeft = await superdoc.getSelection();

    await superdoc.press('ArrowLeft');
    await superdoc.waitForStable();

    const afterLeft = await superdoc.getSelection();
    expect(afterLeft.from).not.toBe(beforeLeft.from);

    await superdoc.press('ArrowRight');
    await superdoc.waitForStable();

    const afterRight = await superdoc.getSelection();
    expect(afterRight.from).not.toBe(afterLeft.from);
    expect(afterRight.from).toBe(beforeLeft.from);
  });

  test('Shift+ArrowLeft and Shift+ArrowRight expand selection in rtl list line', async ({ superdoc }) => {
    await superdoc.type('1. one');
    await superdoc.newLine();
    await superdoc.type('two two two');
    await superdoc.waitForStable();

    await setAllListItemsDirectionRtl(superdoc);

    const range = await getLinePmRange(superdoc, 1);
    const interiorPos = range.start + Math.max(1, Math.floor((range.end - range.start) / 2));
    await superdoc.setTextSelection(interiorPos, interiorPos);
    await superdoc.waitForStable();

    await superdoc.press('Shift+ArrowLeft');
    await superdoc.waitForStable();

    const selectionAfterShiftLeft = await superdoc.getSelection();
    expect(Math.abs(selectionAfterShiftLeft.to - selectionAfterShiftLeft.from)).toBeGreaterThan(0);

    await superdoc.press('ArrowRight');
    await superdoc.waitForStable();

    await superdoc.press('Shift+ArrowRight');
    await superdoc.waitForStable();

    const selectionAfterShiftRight = await superdoc.getSelection();
    expect(Math.abs(selectionAfterShiftRight.to - selectionAfterShiftRight.from)).toBeGreaterThan(0);
  });
});
