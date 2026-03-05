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

  it('does not draw insideH on top edge for continuation fragments with cell spacing', () => {
    renderTableRow(createDeps({ continuesFromPrev: true }) as never);

    expect(renderTableCellMock).toHaveBeenCalledTimes(1);
    const call = renderTableCellMock.mock.calls[0][0] as { borders?: { top?: unknown; bottom?: unknown } };
    expect(call.borders?.top).toBeUndefined();
    expect(call.borders?.bottom).toBeDefined();
  });

  it('does not draw insideH on bottom edge before continuation with cell spacing', () => {
    renderTableRow(createDeps({ continuesOnNext: true }) as never);

    expect(renderTableCellMock).toHaveBeenCalledTimes(1);
    const call = renderTableCellMock.mock.calls[0][0] as { borders?: { top?: unknown; bottom?: unknown } };
    expect(call.borders?.top).toBeDefined();
    expect(call.borders?.bottom).toBeUndefined();
  });
});
