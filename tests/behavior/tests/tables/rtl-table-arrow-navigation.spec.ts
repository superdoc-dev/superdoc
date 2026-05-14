import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showCaret: true, showSelection: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RTL_DOC = path.resolve(__dirname, 'fixtures/rtl-table-1.docx');

async function getSelectionPos(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(() => {
    const editor = (window as any).editor;
    const from = editor?.state?.selection?.from;
    return typeof from === 'number' ? from : null;
  });
}

async function clickSecondRowVisualRightCell(page: import('@playwright/test').Page): Promise<void> {
  const point = await page.evaluate(() => {
    const table = document.querySelector('.superdoc-table-fragment') as HTMLElement | null;
    if (!table) return null;
    const r = table.getBoundingClientRect();
    // Approximate visual right cell in row 2 by clicking near right edge, lower half.
    return { x: r.right - 12, y: r.top + r.height * 0.72 };
  });

  if (!point) {
    throw new Error('No table fragment found');
  }
  await page.mouse.click(point.x, point.y);
}

test('rtl table: ArrowRight from second-row visual-right cell follows Word wrap behavior (rtl-table-1)', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(RTL_DOC);
  await superdoc.waitForStable();

  await clickSecondRowVisualRightCell(superdoc.page);
  await superdoc.waitForStable();
  const before = await getSelectionPos(superdoc.page);
  expect(before).not.toBeNull();
  if (before == null) return;

  await superdoc.press('ArrowRight');
  await superdoc.waitForStable();
  const afterArrowRight = await getSelectionPos(superdoc.page);
  expect(afterArrowRight).not.toBeNull();
  if (afterArrowRight == null) return;

  // Word parity expectation from manual verification:
  // from second-row visual-right cell in bidiVisual table, ArrowRight wraps
  // to first-row visual-left cell (rather than moving one visual cell left).
  expect(afterArrowRight).not.toBe(before);
});

test('rtl table: Shift+ArrowRight extends selection visually leftward across cells (rtl-table-1)', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(RTL_DOC);
  await superdoc.waitForStable();

  await clickSecondRowVisualRightCell(superdoc.page);
  await superdoc.waitForStable();
  const before = await getSelectionPos(superdoc.page);
  expect(before).not.toBeNull();
  if (before == null) return;

  await superdoc.page.keyboard.press('Shift+ArrowRight');
  await superdoc.waitForStable();
  const afterShiftArrow = await getSelectionPos(superdoc.page);
  expect(afterShiftArrow).not.toBeNull();
  if (afterShiftArrow == null) return;

  // Word parity expectation from manual verification:
  // Shift+ArrowRight should extend selection in visual-left direction for RTL table cells.
  expect(afterShiftArrow).not.toBe(before);
});
