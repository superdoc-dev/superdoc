import { test, expect } from '../../fixtures/superdoc.js';
import type { Page, Locator } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * Hover near a row boundary's bottom edge to trigger the resize overlay.
 * Reads the `rows` array from `data-table-boundaries` and positions the
 * mouse at the bottom edge (y + h) of the specified row index.
 */
async function hoverRowBoundary(page: Page, rowIndex: number) {
  const pos = await page.evaluate((ri) => {
    const frag = document.querySelector('.superdoc-table-fragment[data-table-boundaries]');
    if (!frag) throw new Error('No table fragment with boundaries found');
    const meta = JSON.parse(frag.getAttribute('data-table-boundaries')!);
    if (!meta.rows) throw new Error('No row boundaries in metadata');
    const row = meta.rows.find((r: any) => r.i === ri);
    if (!row) throw new Error(`Row boundary ${ri} not found`);
    const rect = frag.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2, // center horizontally
      y: rect.top + row.y + row.h, // bottom edge of the row
    };
  }, rowIndex);

  await page.mouse.move(pos.x, pos.y);
}

/**
 * Drag a resize handle vertically by deltaY pixels.
 * Uses incremental moves with 20ms gaps so the overlay's throttled handler (16ms) fires.
 */
async function dragRowHandle(page: Page, handle: Locator, deltaY: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('Row resize handle not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x, y + (deltaY * i) / 10);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

/**
 * Read the attrs of the Nth tableRow node in the first table.
 */
async function getRowAttrs(page: Page, rowIndex: number) {
  return page.evaluate((ri) => {
    const doc = (window as any).editor.state.doc;
    let idx = 0;
    let result: any = null;
    doc.descendants((node: any) => {
      if (result) return false;
      if (node.type.name === 'tableRow') {
        if (idx === ri) {
          result = node.attrs;
          return false;
        }
        idx++;
      }
    });
    return result;
  }, rowIndex);
}

test('resize a row by dragging its bottom boundary', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
  await superdoc.waitForStable();

  await superdoc.type('Row 0');
  await superdoc.press('Tab');
  await superdoc.type('Cell');
  await superdoc.press('Tab');
  await superdoc.type('Cell');
  await superdoc.waitForStable();
  await superdoc.snapshot('table before row resize');

  // No explicit rowHeight before resize
  const attrsBefore = await getRowAttrs(superdoc.page, 0);
  expect(attrsBefore?.rowHeight).toBeFalsy();

  // Hover the first row boundary to show the resize overlay
  await hoverRowBoundary(superdoc.page, 0);
  await superdoc.waitForStable();

  const handle = superdoc.page.locator('.resize-handle--row').first();
  await expect(handle).toBeAttached({ timeout: 5000 });
  await superdoc.snapshot('row resize handle visible');

  // Drag the row boundary down by 40px
  await dragRowHandle(superdoc.page, handle, 40);
  await superdoc.waitForStable();
  await superdoc.snapshot('after row resize');

  // After resize, rowHeight should be set on the tableRow node
  const attrsAfter = await getRowAttrs(superdoc.page, 0);
  expect(attrsAfter?.rowHeight).toBeGreaterThan(0);

  // tableRowProperties.rowHeight should have twips value with 'atLeast' rule
  const rowHeightProp = attrsAfter?.tableRowProperties?.rowHeight;
  expect(rowHeightProp).toBeDefined();
  expect(rowHeightProp.value).toBeGreaterThan(0);
  expect(rowHeightProp.rule).toBe('atLeast');
});

test('row boundary is not resizable at rowspan-merged rows', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 3, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  // Fill cells with labels: A1, B1, A2, B2, A3, B3
  const labels = ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'];
  for (let i = 0; i < labels.length; i++) {
    await superdoc.type(labels[i]);
    if (i < labels.length - 1) await superdoc.press('Tab');
  }
  await superdoc.waitForStable();

  // Select A1 and A2, then merge to create a rowspan=2 cell
  const fromLine = superdoc.page.locator('.superdoc-line').filter({ hasText: 'A1' }).first();
  const toLine = superdoc.page.locator('.superdoc-line').filter({ hasText: 'A2' }).first();
  const fromBox = await fromLine.boundingBox();
  const toBox = await toLine.boundingBox();
  if (!fromBox || !toBox) throw new Error('Could not resolve cell bounds');

  await superdoc.page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await superdoc.page.mouse.down();
  await superdoc.page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2);
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();

  await superdoc.executeCommand('mergeCells');
  await superdoc.waitForStable();
  await superdoc.snapshot('table with rowspan merge');

  // The boundary between row 0 and row 1 should be marked non-resizable (r: 0)
  // because the merged cell spans across it.
  const boundaryInfo = await superdoc.page.evaluate(() => {
    const frag = document.querySelector('.superdoc-table-fragment[data-table-boundaries]');
    if (!frag) return null;
    const meta = JSON.parse(frag.getAttribute('data-table-boundaries')!);
    if (!meta.rows) return null;
    return meta.rows.map((r: any) => ({ index: r.i, resizable: r.r }));
  });

  expect(boundaryInfo).toBeDefined();

  // Row 0 boundary should be blocked by the rowspan (r: 0)
  const row0 = boundaryInfo!.find((r: any) => r.index === 0);
  expect(row0).toBeDefined();
  expect(row0!.resizable).toBe(0);

  // Row 1 (last row, below the merged cell) should be resizable (r: 1)
  const row1 = boundaryInfo!.find((r: any) => r.index === 1);
  expect(row1).toBeDefined();
  expect(row1!.resizable).toBe(1);
});
