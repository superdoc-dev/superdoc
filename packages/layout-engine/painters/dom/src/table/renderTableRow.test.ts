import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTableRow } from './renderTableRow.js';

const renderTableCellMock = vi.fn(() => ({ cellElement: document.createElement('div') }));

vi.mock('./renderTableCell.js', () => ({
  renderTableCell: (args: unknown) => renderTableCellMock(args),
}));

describe('renderTableRow', () => {
  let doc: Document;
  let container: HTMLElement;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('table-row');
    container = doc.createElement('div');
    renderTableCellMock.mockClear();
  });

  const createDeps = (overrides: Record<string, unknown> = {}) => ({
    doc,
    container,
    rowIndex: 3,
    y: 0,
    rowMeasure: {
      height: 20,
      cells: [{ width: 100, height: 20, gridColumnStart: 0, colSpan: 1, rowSpan: 1 }],
    },
    row: {
      id: 'row-1',
      cells: [{ id: 'cell-1', blocks: [{ kind: 'paragraph', id: 'p1', runs: [] }] }],
    },
    totalRows: 10,
    tableBorders: {
      top: { style: 'single', width: 1, color: '#000000' },
      bottom: { style: 'single', width: 1, color: '#000000' },
      left: { style: 'single', width: 1, color: '#000000' },
      right: { style: 'single', width: 1, color: '#000000' },
      insideH: { style: 'single', width: 1, color: '#111111' },
      insideV: { style: 'single', width: 1, color: '#222222' },
    },
    columnWidths: [100],
    allRowHeights: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
    tableIndent: 0,
    context: { sectionIndex: 0, pageIndex: 0, columnIndex: 0 },
    renderLine: () => doc.createElement('div'),
    applySdtDataset: () => {},
    cellSpacingPx: 6,
    ...overrides,
  });

  const getRenderedCellCall = (): { borders?: { top?: unknown; right?: unknown; bottom?: unknown; left?: unknown } } =>
    renderTableCellMock.mock.calls[0][0] as {
      borders?: { top?: unknown; right?: unknown; bottom?: unknown; left?: unknown };
    };

  it('does not draw insideH on top edge for continuation fragments with cell spacing', () => {
    renderTableRow(createDeps({ continuesFromPrev: true }) as never);

    expect(renderTableCellMock).toHaveBeenCalledTimes(1);
    const call = getRenderedCellCall();
    expect(call.borders?.top).toBeUndefined();
    expect(call.borders?.bottom).toBeDefined();
  });

  it('does not draw insideH on bottom edge before continuation with cell spacing', () => {
    renderTableRow(createDeps({ continuesOnNext: true }) as never);

    expect(renderTableCellMock).toHaveBeenCalledTimes(1);
    const call = getRenderedCellCall();
    expect(call.borders?.top).toBeDefined();
    expect(call.borders?.bottom).toBeUndefined();
  });

  it('applies the table right border to a merged cell that spans the final column in collapsed mode', () => {
    renderTableRow(
      createDeps({
        rowIndex: 0,
        totalRows: 5,
        cellSpacingPx: 0,
        columnWidths: [100, 100],
        rowMeasure: {
          height: 20,
          cells: [{ width: 200, height: 20, gridColumnStart: 0, colSpan: 2, rowSpan: 1 }],
        },
      }) as never,
    );

    expect(renderTableCellMock).toHaveBeenCalledTimes(1);
    const call = getRenderedCellCall();
    expect(call.borders?.right).toBeDefined();
    expect(call.borders?.left).toBeDefined();
  });

  it('falls back to the table right border when an explicit-border cell spans the final column', () => {
    renderTableRow(
      createDeps({
        rowIndex: 0,
        totalRows: 5,
        cellSpacingPx: 0,
        columnWidths: [100, 100],
        rowMeasure: {
          height: 20,
          cells: [{ width: 200, height: 20, gridColumnStart: 0, colSpan: 2, rowSpan: 1 }],
        },
        row: {
          id: 'row-1',
          cells: [
            {
              id: 'cell-1',
              attrs: {
                borders: {
                  top: { style: 'single', width: 2, color: '#123456' },
                },
              },
              blocks: [{ kind: 'paragraph', id: 'p1', runs: [] }],
            },
          ],
        },
      }) as never,
    );

    expect(renderTableCellMock).toHaveBeenCalledTimes(1);
    const call = getRenderedCellCall();
    expect(call.borders?.top).toBeDefined();
    expect(call.borders?.right).toBeDefined();
  });

  it('applies the table bottom border to a rowspan cell that reaches the final row', () => {
    renderTableRow(
      createDeps({
        rowIndex: 3,
        totalRows: 5,
        cellSpacingPx: 0,
        columnWidths: [100, 100],
        rowMeasure: {
          height: 20,
          cells: [{ width: 100, height: 20, gridColumnStart: 1, colSpan: 1, rowSpan: 2 }],
        },
      }) as never,
    );

    expect(renderTableCellMock).toHaveBeenCalledTimes(1);
    const call = getRenderedCellCall();
    expect(call.borders?.bottom).toBeDefined();
  });

  describe('RTL table (isRtl)', () => {
    it('mirrors cell x positions so first logical column is on the right', () => {
      renderTableRow(
        createDeps({
          isRtl: true,
          rowIndex: 0,
          totalRows: 1,
          cellSpacingPx: 0,
          columnWidths: [100, 150, 200],
          rowMeasure: {
            height: 20,
            cells: [
              { width: 100, height: 20, gridColumnStart: 0, colSpan: 1, rowSpan: 1 },
              { width: 150, height: 20, gridColumnStart: 1, colSpan: 1, rowSpan: 1 },
              { width: 200, height: 20, gridColumnStart: 2, colSpan: 1, rowSpan: 1 },
            ],
          },
          row: {
            id: 'row-1',
            cells: [
              { id: 'c1', blocks: [] },
              { id: 'c2', blocks: [] },
              { id: 'c3', blocks: [] },
            ],
          },
        }) as never,
      );

      expect(renderTableCellMock).toHaveBeenCalledTimes(3);
      const calls = renderTableCellMock.mock.calls.map((c: unknown[]) => c[0] as { x: number; cellWidth: number });
      // Total = 100+150+200 = 450. Col 0 (w=100): x = 450-0-100 = 350
      expect(calls[0].x).toBe(350);
      // Col 1 (w=150): x = 450-100-150 = 200
      expect(calls[1].x).toBe(200);
      // Col 2 (w=200): x = 450-250-200 = 0
      expect(calls[2].x).toBe(0);
    });

    it('passes isRtl to renderTableCell', () => {
      renderTableRow(
        createDeps({
          isRtl: true,
          cellSpacingPx: 0,
          columnWidths: [100],
          rowMeasure: {
            height: 20,
            cells: [{ width: 100, height: 20, gridColumnStart: 0, colSpan: 1, rowSpan: 1 }],
          },
        }) as never,
      );

      const call = renderTableCellMock.mock.calls[0][0] as { isRtl: boolean };
      expect(call.isRtl).toBe(true);
    });

    it('swaps resolved border left↔right for RTL cells', () => {
      renderTableRow(
        createDeps({
          isRtl: true,
          rowIndex: 0,
          totalRows: 1,
          cellSpacingPx: 0,
          columnWidths: [100],
          tableBorders: {
            top: { style: 'single', width: 1, color: '#000000' },
            bottom: { style: 'single', width: 1, color: '#000000' },
            left: { style: 'single', width: 3, color: '#0000FF' },
            right: { style: 'single', width: 0.5, color: '#FF0000' },
          },
          rowMeasure: {
            height: 20,
            cells: [{ width: 100, height: 20, gridColumnStart: 0, colSpan: 1, rowSpan: 1 }],
          },
        }) as never,
      );

      const call = getRenderedCellCall();
      // Single cell touches both edges. Resolver: left=table.left(blue), right=table.right(red).
      // After RTL swap: CSS left=red, CSS right=blue
      expect(call.borders?.right).toEqual({ style: 'single', width: 3, color: '#0000FF' });
      expect(call.borders?.left).toEqual({ style: 'single', width: 0.5, color: '#FF0000' });
    });

    it('mirrors correctly with non-zero cellSpacing and colspan', () => {
      renderTableRow(
        createDeps({
          isRtl: true,
          rowIndex: 0,
          totalRows: 1,
          cellSpacingPx: 4,
          columnWidths: [100, 100, 100],
          rowMeasure: {
            height: 20,
            cells: [
              { width: 200, height: 20, gridColumnStart: 0, colSpan: 2, rowSpan: 1 },
              { width: 100, height: 20, gridColumnStart: 2, colSpan: 1, rowSpan: 1 },
            ],
          },
          row: {
            id: 'row-1',
            cells: [
              { id: 'c1', blocks: [] },
              { id: 'c2', blocks: [] },
            ],
          },
        }) as never,
      );

      expect(renderTableCellMock).toHaveBeenCalledTimes(2);
      const calls = renderTableCellMock.mock.calls.map((c: unknown[]) => c[0] as { x: number; cellWidth: number });
      // totalWidth = 4 + 100 + 4 + 100 + 4 + 100 + 4 = 316
      // Col 0 (colspan=2, w=200): ltrX = 4, rtlX = 316 - 4 - 200 = 112
      expect(calls[0].x).toBe(112);
      // Col 2 (w=100): ltrX = 4+100+4+100+4 = 212, rtlX = 316 - 212 - 100 = 4
      expect(calls[1].x).toBe(4);
    });
  });
});
