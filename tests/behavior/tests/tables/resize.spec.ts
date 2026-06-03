import { test, expect } from '../../fixtures/superdoc.js';
import type { Page, Locator } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.use({ config: { toolbar: 'full', showSelection: true } });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RTL_DOC = path.resolve(__dirname, 'fixtures/rtl-table-1.docx');
const LTR_DOC = path.resolve(__dirname, 'fixtures/ltr-table.docx');

/**
 * Hover near a column boundary on the table fragment to trigger the resize overlay.
 * Pass the column index for inner boundaries, or 'right-edge' for the table's right edge.
 */
async function hoverColumnBoundary(page: Page, target: number | 'right-edge') {
  const pos = await page.evaluate((t) => {
    const frag = document.querySelector('.superdoc-table-fragment[data-table-boundaries]');
    if (!frag) throw new Error('No table fragment with boundaries found');
    const meta = JSON.parse(frag.getAttribute('data-table-boundaries')!);
    const columns = meta.columns as Array<{ x: number; w: number }>;
    const isRtl = meta.rtl === true;
    const col = t === 'right-edge' ? columns[columns.length - 1] : columns[t];
    if (!col) throw new Error(`Column ${t} not found`);
    const tableContentWidth = columns[columns.length - 1].x + columns[columns.length - 1].w;
    const logicalBoundaryX = col.x + col.w;
    const visualBoundaryX = isRtl ? tableContentWidth - logicalBoundaryX : logicalBoundaryX;
    const rect = frag.getBoundingClientRect();
    // Hover 2px inside the right edge so the cursor stays within the table element
    const offset = t === 'right-edge' ? (isRtl ? 2 : -2) : 0;
    return { x: rect.left + visualBoundaryX + offset, y: rect.top + rect.height / 2 };
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

test('row handles are hidden during column resize drag (SD-2094)', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
  await superdoc.waitForStable();

  await superdoc.type('Hello');
  await superdoc.waitForStable();

  // Hover the first column boundary to make the resize overlay appear
  await hoverColumnBoundary(superdoc.page, 0);
  await superdoc.waitForStable();

  const handle = superdoc.page.locator('.resize-handle[data-boundary-type="inner"]').first();
  await expect(handle).toBeAttached({ timeout: 5000 });

  // Start dragging — hold mouse down and move incrementally
  const box = await handle.boundingBox();
  if (!box) throw new Error('Resize handle not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await superdoc.page.mouse.move(x, y);
  await superdoc.page.mouse.down();
  // Move a small amount to activate drag state
  await superdoc.page.mouse.move(x + 10, y);
  await superdoc.page.waitForTimeout(50);

  await superdoc.snapshot('during column drag — row handles should be hidden');

  // Verify drag is active by checking for the guideline
  const guideline = superdoc.page.locator('.resize-guideline');
  await expect(guideline).toBeAttached({ timeout: 5000 });

  // Row handles should be hidden (v-show) during column drag
  const rowHandles = superdoc.page.locator('.resize-handle--row');
  const rowCount = await rowHandles.count();
  expect(rowCount).toBeGreaterThan(0);
  for (let i = 0; i < rowCount; i++) {
    await expect(rowHandles.nth(i)).toBeHidden();
  }

  await superdoc.page.mouse.up();
  await superdoc.waitForStable();
});

// SD-2810 follow-up: in an RTL table the right-edge handle maps to logical
// column 0 (the visually-rightmost column). The resize transaction must only
// touch column 0 cells. Pre-fix, `affectedColumns = [columnIndex, columnIndex + 1]`
// also rewrote column 1's per-cell `cellWidth` (OOXML w:tcW) with the grid
// value, destroying any divergent authored tcW on merged or width-overridden
// cells in column 1. LTR is unaffected because `columnIndex + 1` is past the
// last column for an LTR right-edge drag.
test('rtl right-edge drag does not touch column 1 cell widths', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_DOC);
  await superdoc.waitForStable();

  // Capture the colwidth / cellWidth attrs of each column 1 cell BEFORE the drag.
  // We snapshot the raw attrs object so any mutation by the transaction is visible.
  const before = await superdoc.page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    const col1: any[] = [];
    doc.descendants((node: any) => {
      if (node.type.name !== 'table') return true;
      let row = 0;
      node.descendants((inner: any) => {
        if (inner.type.name === 'tableRow') {
          row++;
          let col = 0;
          inner.descendants((cell: any) => {
            if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
              if (col === 1) {
                col1.push({
                  row,
                  colwidth: cell.attrs.colwidth ? [...cell.attrs.colwidth] : null,
                  cellWidth: cell.attrs.tableCellProperties?.cellWidth ?? null,
                });
              }
              col += cell.attrs.colspan ?? 1;
            }
            return false;
          });
        }
        return true;
      });
      return false;
    });
    return col1;
  });

  expect(before.length).toBeGreaterThan(0);

  // Drag the visual right edge outward.
  await hoverColumnBoundary(superdoc.page, 'right-edge');
  await superdoc.waitForStable();
  const handle = superdoc.page.locator('.resize-handle[data-boundary-type="right-edge"]').first();
  await expect(handle).toBeAttached({ timeout: 5000 });
  await dragHandle(superdoc.page, handle, 40);
  await superdoc.waitForStable();

  // Re-read column 1 cells AFTER the drag.
  const after = await superdoc.page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    const col1: any[] = [];
    doc.descendants((node: any) => {
      if (node.type.name !== 'table') return true;
      let row = 0;
      node.descendants((inner: any) => {
        if (inner.type.name === 'tableRow') {
          row++;
          let col = 0;
          inner.descendants((cell: any) => {
            if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
              if (col === 1) {
                col1.push({
                  row,
                  colwidth: cell.attrs.colwidth ? [...cell.attrs.colwidth] : null,
                  cellWidth: cell.attrs.tableCellProperties?.cellWidth ?? null,
                });
              }
              col += cell.attrs.colspan ?? 1;
            }
            return false;
          });
        }
        return true;
      });
      return false;
    });
    return col1;
  });

  // Column 1 attrs must be byte-identical pre/post drag.
  expect(after).toEqual(before);
});

test('rtl table shows resize indicator again after drag on same boundary', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_DOC);
  await superdoc.waitForStable();

  await hoverColumnBoundary(superdoc.page, 0);
  await superdoc.waitForStable();
  const handle = superdoc.page.locator('.resize-handle[data-boundary-type="inner"]').first();
  await expect(handle).toBeAttached({ timeout: 5000 });

  await dragHandle(superdoc.page, handle, 40);
  await superdoc.waitForStable();

  await hoverColumnBoundary(superdoc.page, 0);
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('.resize-handle[data-boundary-type="inner"]').first()).toBeAttached({
    timeout: 5000,
  });
});

test('ltr table still shows resize indicator again after drag (guard)', async ({ superdoc }) => {
  await superdoc.loadDocument(LTR_DOC);
  await superdoc.waitForStable();

  await hoverColumnBoundary(superdoc.page, 0);
  await superdoc.waitForStable();
  const handle = superdoc.page.locator('.resize-handle[data-boundary-type="inner"]').first();
  await expect(handle).toBeAttached({ timeout: 5000 });

  await dragHandle(superdoc.page, handle, 40);
  await superdoc.waitForStable();

  await hoverColumnBoundary(superdoc.page, 0);
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('.resize-handle[data-boundary-type="inner"]').first()).toBeAttached({
    timeout: 5000,
  });
});
