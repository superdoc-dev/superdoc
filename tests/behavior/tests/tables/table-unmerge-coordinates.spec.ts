import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

/**
 * Helper: insert a 3×3 table, merge (0,0)–(0,1), then return the table's nodeId.
 */
async function setupMergedTable(page: import('@playwright/test').Page): Promise<string> {
  // Insert a 3×3 table.
  await page.evaluate(() => {
    (window as any).editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false });
  });

  // Find the table and merge cells (0,0)–(0,1).
  const tableNodeId = await page.evaluate(() => {
    const doc = (window as any).editor.doc;
    const tables = doc.find({ select: { type: 'node', nodeType: 'table' }, limit: 1 });
    const items = tables?.items ?? [];
    const tableAddress = items[0]?.address;
    if (!tableAddress) throw new Error('No table found after insert');

    const mergeResult = doc.tables.mergeCells({
      target: tableAddress,
      start: { rowIndex: 0, columnIndex: 0 },
      end: { rowIndex: 0, columnIndex: 1 },
    });
    if (!mergeResult?.success) {
      throw new Error(`mergeCells failed: ${mergeResult?.failure?.code}`);
    }

    return tableAddress.nodeId as string;
  });

  return tableNodeId;
}

/**
 * Helper: get cell info for a table.
 */
async function getCellInfo(
  page: import('@playwright/test').Page,
  tableNodeId: string,
): Promise<Array<{ nodeId: string; rowIndex: number; columnIndex: number; colspan: number; rowspan: number }>> {
  return page.evaluate((tid) => {
    const doc = (window as any).editor.doc;
    const result = doc.tables.getCells({ nodeId: tid });
    return (result?.cells ?? []).map((c: any) => ({
      nodeId: c.nodeId,
      rowIndex: c.rowIndex,
      columnIndex: c.columnIndex,
      colspan: c.colspan,
      rowspan: c.rowspan,
    }));
  }, tableNodeId);
}

test('unmergeCells with table-scoped anchor coordinates', async ({ superdoc }) => {
  await superdoc.waitForStable();

  const tableNodeId = await setupMergedTable(superdoc.page);
  await superdoc.waitForStable();

  // Verify merge: cell at (0,0) should have colspan=2.
  const cellsBefore = await getCellInfo(superdoc.page, tableNodeId);
  const mergedCell = cellsBefore.find((c) => c.rowIndex === 0 && c.columnIndex === 0);
  expect(mergedCell?.colspan).toBe(2);

  // Unmerge via table-scoped coordinates — targeting the anchor (0,0).
  const result = await superdoc.page.evaluate((tid) => {
    return (window as any).editor.doc.tables.unmergeCells({
      nodeId: tid,
      rowIndex: 0,
      columnIndex: 0,
    });
  }, tableNodeId);
  expect(result?.success).toBe(true);
  await superdoc.waitForStable();

  // Verify unmerge: cell at (0,0) should now have colspan=1.
  const cellsAfter = await getCellInfo(superdoc.page, tableNodeId);
  const unmergedCell = cellsAfter.find((c) => c.rowIndex === 0 && c.columnIndex === 0);
  expect(unmergedCell?.colspan).toBe(1);
});

test('unmergeCells with non-anchor coordinate inside a merged span', async ({ superdoc }) => {
  await superdoc.waitForStable();

  const tableNodeId = await setupMergedTable(superdoc.page);
  await superdoc.waitForStable();

  // Unmerge via table-scoped coordinates — targeting (0,1), a covered
  // non-anchor coordinate inside the merged span anchored at (0,0).
  // The resolver must canonicalize to the anchor cell.
  const result = await superdoc.page.evaluate((tid) => {
    return (window as any).editor.doc.tables.unmergeCells({
      nodeId: tid,
      rowIndex: 0,
      columnIndex: 1,
    });
  }, tableNodeId);
  expect(result?.success).toBe(true);
  await superdoc.waitForStable();

  // Verify unmerge: cell at (0,0) should now have colspan=1.
  const cellsAfter = await getCellInfo(superdoc.page, tableNodeId);
  const unmergedCell = cellsAfter.find((c) => c.rowIndex === 0 && c.columnIndex === 0);
  expect(unmergedCell?.colspan).toBe(1);
});

test('unmergeCells with direct cell nodeId still works', async ({ superdoc }) => {
  await superdoc.waitForStable();

  const tableNodeId = await setupMergedTable(superdoc.page);
  await superdoc.waitForStable();

  // Get the merged cell's nodeId.
  const cellNodeId = await superdoc.page.evaluate((tid) => {
    const doc = (window as any).editor.doc;
    const result = doc.tables.getCells({ nodeId: tid, rowIndex: 0, columnIndex: 0 });
    return result?.cells?.[0]?.nodeId as string;
  }, tableNodeId);

  // Unmerge via direct cell nodeId (the original form).
  const result = await superdoc.page.evaluate((cid) => {
    return (window as any).editor.doc.tables.unmergeCells({ nodeId: cid });
  }, cellNodeId);
  expect(result?.success).toBe(true);
  await superdoc.waitForStable();

  // Verify unmerge.
  const cellsAfter = await getCellInfo(superdoc.page, tableNodeId);
  const unmergedCell = cellsAfter.find((c) => c.rowIndex === 0 && c.columnIndex === 0);
  expect(unmergedCell?.colspan).toBe(1);
});

test('unmergeCells accepts TableCellInfo handoff from getCells()', async ({ superdoc }) => {
  await superdoc.waitForStable();

  const tableNodeId = await setupMergedTable(superdoc.page);
  await superdoc.waitForStable();

  const cellInfo = await superdoc.page.evaluate((tid) => {
    const doc = (window as any).editor.doc;
    return doc.tables.getCells({ nodeId: tid, rowIndex: 0, columnIndex: 0 })?.cells?.[0] ?? null;
  }, tableNodeId);

  expect(cellInfo).toMatchObject({
    nodeId: expect.any(String),
    rowIndex: 0,
    columnIndex: 0,
    colspan: 2,
    rowspan: 1,
  });

  const result = await superdoc.page.evaluate((payload) => {
    return (window as any).editor.doc.tables.unmergeCells(payload);
  }, cellInfo);
  expect(result?.success).toBe(true);
  await superdoc.waitForStable();

  const cellsAfter = await getCellInfo(superdoc.page, tableNodeId);
  const unmergedCell = cellsAfter.find((c) => c.rowIndex === 0 && c.columnIndex === 0);
  expect(unmergedCell?.colspan).toBe(1);
});

test('unmergeCells with out-of-bounds coordinates fails gracefully', async ({ superdoc }) => {
  await superdoc.waitForStable();

  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false });
  });
  await superdoc.waitForStable();

  const tableNodeId = await superdoc.page.evaluate(() => {
    const doc = (window as any).editor.doc;
    const tables = doc.find({ select: { type: 'node', nodeType: 'table' }, limit: 1 });
    return tables?.items?.[0]?.address?.nodeId as string;
  });

  // Out-of-bounds coordinates should throw or return a failure.
  const threw = await superdoc.page.evaluate(async (tid) => {
    try {
      const result = (window as any).editor.doc.tables.unmergeCells({
        nodeId: tid,
        rowIndex: 99,
        columnIndex: 99,
      });
      return result?.success === false ? 'failure' : 'unexpected-success';
    } catch {
      return 'threw';
    }
  }, tableNodeId);

  expect(['threw', 'failure']).toContain(threw);
});
