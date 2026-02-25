import { test, expect } from '../../fixtures/superdoc.js';
import type { Page, Locator } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * Hover near a column boundary on the table fragment to trigger the resize overlay.
 * Pass the column index for inner boundaries, or 'right-edge' for the table's right edge.
 */
async function hoverColumnBoundary(page: Page, target: number | 'right-edge') {
  const pos = await page.evaluate((t) => {
    const frag = document.querySelector('.superdoc-table-fragment[data-table-boundaries]');
    if (!frag) throw new Error('No table fragment with boundaries found');
    const { columns } = JSON.parse(frag.getAttribute('data-table-boundaries')!);
    const col = t === 'right-edge' ? columns[columns.length - 1] : columns[t];
    if (!col) throw new Error(`Column ${t} not found`);
    const rect = frag.getBoundingClientRect();
    // Hover 2px inside the right edge so the cursor stays within the table element
    const offset = t === 'right-edge' ? -2 : 0;
    return { x: rect.left + col.x + col.w + offset, y: rect.top + rect.height / 2 };
  }, target);

  await page.mouse.move(pos.x, pos.y);
}

/**
 * Drag a resize handle horizontally by deltaX pixels.
 * Uses incremental moves with 20ms gaps so the overlay's throttled handler (16ms) fires.
 */
async function dragHandle(page: Page, handle: Locator, deltaX: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('Resize handle not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x + (deltaX * i) / 10, y);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

async function getTableGrid(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    let grid: any = null;
    doc.descendants((node: any) => {
      if (grid === null && node.type.name === 'table') {
        grid = node.attrs.grid;
        return false;
      }
    });
    return grid;
  });
}

test('resize a column by dragging its boundary', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
  await superdoc.waitForStable();

  await superdoc.type('Hello');
  await superdoc.press('Tab');
  await superdoc.type('World');
  await superdoc.press('Tab');
  await superdoc.type('Test');
  await superdoc.waitForStable();
  await superdoc.snapshot('table with content');

  // grid is null on a freshly inserted table
  expect(await getTableGrid(superdoc.page)).toBeNull();

  // Hover the first column boundary to make the resize overlay appear
  await hoverColumnBoundary(superdoc.page, 0);
  await superdoc.waitForStable();

  const handle = superdoc.page.locator('.resize-handle[data-boundary-type="inner"]').first();
  await expect(handle).toBeAttached({ timeout: 5000 });
  await superdoc.snapshot('resize handle visible');

  await dragHandle(superdoc.page, handle, 80);
  await superdoc.waitForStable();
  await superdoc.snapshot('after column resize');

  // After resize, grid becomes an array of {col: twips} — one entry per column
  const grid = await getTableGrid(superdoc.page);
  expect(grid).toHaveLength(3);
});

test('resize the table by dragging the right edge', async ({ superdoc }) => {
  // Use narrow explicit widths so the table has room to expand rightward
  await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, columnWidths: [100, 100, 100] });
  await superdoc.waitForStable();

  await superdoc.type('Content');
  await superdoc.waitForStable();
  await superdoc.snapshot('table before edge resize');

  expect(await getTableGrid(superdoc.page)).toBeNull();

  // Hover the right edge of the table to make the resize overlay appear
  await hoverColumnBoundary(superdoc.page, 'right-edge');
  await superdoc.waitForStable();

  const handle = superdoc.page.locator('.resize-handle[data-boundary-type="right-edge"]').first();
  await expect(handle).toBeAttached({ timeout: 5000 });
  await superdoc.snapshot('right edge handle visible');

  await dragHandle(superdoc.page, handle, 100);
  await superdoc.waitForStable();
  await superdoc.snapshot('after table edge resize');

  const grid = await getTableGrid(superdoc.page);
  expect(grid).toHaveLength(3);
});
