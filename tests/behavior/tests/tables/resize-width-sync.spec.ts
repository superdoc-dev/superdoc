import { test, expect } from '../../fixtures/superdoc.js';
import type { Page, Locator } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * SD-2502: when a column is resized via drag (or the document API distributes
 * columns), `TableResizeOverlay` mirrors the new span width into
 * `tableCellProperties.cellWidth` for the affected cells, and
 * `buildWidthAuthoringTableAttrs` flips the table to fixed-layout. These tests
 * lock the new sync flow that the autofit measuring solver depends on.
 */

async function hoverColumnBoundary(page: Page, target: number | 'right-edge') {
  const pos = await page.evaluate((t) => {
    const frag = document.querySelector('.superdoc-table-fragment[data-table-boundaries]');
    if (!frag) throw new Error('No table fragment with boundaries found');
    const { columns } = JSON.parse(frag.getAttribute('data-table-boundaries')!);
    const col = t === 'right-edge' ? columns[columns.length - 1] : columns[t];
    if (!col) throw new Error(`Column ${t} not found`);
    const rect = frag.getBoundingClientRect();
    const offset = t === 'right-edge' ? -2 : 0;
    return { x: rect.left + col.x + col.w + offset, y: rect.top + rect.height / 2 };
  }, target);
  await page.mouse.move(pos.x, pos.y);
}

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

async function getTableState(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).editor.state.doc;
    let table: any = null;
    doc.descendants((node: any) => {
      if (table === null && node.type.name === 'table') {
        table = node;
        return false;
      }
    });
    if (!table) return null;
    const rows: Array<Array<{ colspan: number; colwidth: number[] | null; cellWidth: any }>> = [];
    table.descendants((node: any) => {
      if (node.type.name === 'tableRow') {
        const cells: Array<{ colspan: number; colwidth: number[] | null; cellWidth: any }> = [];
        node.descendants((cellNode: any) => {
          if (cellNode.type.name === 'tableCell' || cellNode.type.name === 'tableHeader') {
            const cellProps = cellNode.attrs.tableCellProperties as Record<string, unknown> | undefined;
            cells.push({
              colspan: cellNode.attrs.colspan ?? 1,
              colwidth: Array.isArray(cellNode.attrs.colwidth) ? cellNode.attrs.colwidth : null,
              cellWidth: (cellProps?.cellWidth as Record<string, unknown> | undefined) ?? null,
            });
            return false;
          }
        });
        rows.push(cells);
      }
    });
    return {
      grid: table.attrs.grid,
      tableLayout: table.attrs.tableLayout,
      tableProperties: table.attrs.tableProperties as Record<string, unknown>,
      rows,
    };
  });
}

test('column drag mirrors span width into tableCellProperties.cellWidth (SD-2502)', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
  await superdoc.waitForStable();
  await superdoc.type('Hello');
  await superdoc.press('Tab');
  await superdoc.type('World');
  await superdoc.press('Tab');
  await superdoc.type('Test');
  await superdoc.waitForStable();

  await hoverColumnBoundary(superdoc.page, 0);
  await superdoc.waitForStable();
  const handle = superdoc.page.locator('.resize-handle[data-boundary-type="inner"]').first();
  await expect(handle).toBeAttached({ timeout: 5000 });

  await dragHandle(superdoc.page, handle, 80);
  await superdoc.waitForStable();

  const state = await getTableState(superdoc.page);
  expect(state).not.toBeNull();
  expect(state!.grid).toHaveLength(3);
  // Width edits flip the table to fixed-layout so the AutoFit solver respects the authored widths
  expect(state!.tableLayout).toBe('fixed');
  expect(state!.tableProperties.tableLayout as string).toBe('fixed');

  // cellWidth must be present on every affected cell across every row in the touched columns
  const firstCell = state!.rows[0][0];
  expect(firstCell.cellWidth).not.toBeNull();
  expect(firstCell.cellWidth.type).toBe('dxa');
  expect(typeof firstCell.cellWidth.value).toBe('number');
  expect(firstCell.cellWidth.value).toBeGreaterThan(0);

  // The mirrored value must equal the colwidth-derived span width in twips
  // (px * 15 = twips at 96 DPI)
  const expectedTwips = (firstCell.colwidth ?? []).reduce((sum, w) => sum + Math.round(w * 15), 0);
  expect(firstCell.cellWidth.value).toBe(expectedTwips);

  // Subsequent rows should also carry the mirror so the fixed-pass first-row tcW
  // is not the only source of truth on round-trip.
  const secondRowFirstCell = state!.rows[1]?.[0];
  expect(secondRowFirstCell?.cellWidth).not.toBeNull();
});
