import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TableMap, type CellSelection } from 'prosemirror-tables';
import type { FlowBlock, Layout, Measure, TableBlock, TableFragment, TableMeasure } from '@superdoc/contracts';

import { renderCellSelectionOverlay, type RenderCellSelectionOverlayDeps } from '../CellSelectionOverlay.js';

/**
 * Creates a mock CellSelection object for testing.
 * CellSelection is a ProseMirror-tables class representing multiple selected cells.
 */
function createMockCellSelection(
  anchorCellPos: number,
  headCellPos: number,
  tableDepth: number,
  tableNodeType: string = 'table',
): CellSelection {
  const cellNodes: Array<{ node: unknown; pos: number }> = [];

  const mockSelection = {
    $anchorCell: {
      pos: anchorCellPos,
      depth: tableDepth + 1, // Cell is one level deeper than table
      node: (depth: number) => {
        if (depth === tableDepth) {
          return {
            type: { name: tableNodeType },
            content: { size: 100 },
          };
        }
        return {
          type: { name: 'cell' },
          attrs: { colspan: 1, rowspan: 1 },
        };
      },
      start: (depth: number) => {
        if (depth === tableDepth) return 1; // Table starts at pos 1
        return anchorCellPos;
      },
    },
    $headCell: {
      pos: headCellPos,
    },
    forEachCell: (callback: (node: unknown, pos: number) => void) => {
      cellNodes.forEach(({ node, pos }) => callback(node, pos));
    },
    _setCellNodes: (nodes: Array<{ node: unknown; pos: number }>) => {
      cellNodes.length = 0;
      cellNodes.push(...nodes);
    },
  } as unknown as CellSelection;

  return mockSelection;
}

/**
 * Creates a mock TableBlock for layout state.
 */
function createMockTableBlock(id: string): TableBlock {
  return {
    kind: 'table',
    id,
    width: 600,
  } as TableBlock;
}

/**
 * Creates a mock TableFragment representing a table on a page.
 */
function createMockTableFragment(
  blockId: string,
  pageIndex: number,
  fromRow: number,
  toRow: number,
  columnBoundaries: Array<{ index: number; x: number; width: number }>,
): TableFragment {
  return {
    kind: 'table',
    blockId,
    x: 50,
    y: 100,
    width: 600,
    height: 200,
    fromRow,
    toRow,
    metadata: {
      columnBoundaries,
    },
  } as TableFragment;
}

/**
 * Creates a mock TableMeasure with row heights.
 */
function createMockTableMeasure(rowHeights: number[]): TableMeasure {
  return {
    kind: 'table',
    rows: rowHeights.map((height) => ({ height })),
  } as TableMeasure;
}

/**
 * Creates a mock Layout with pages and fragments.
 */
function createMockLayout(pages: Array<{ fragments: unknown[] }>): Layout {
  return {
    pages,
    pageSize: { w: 800, h: 1200 },
    pageGap: 20,
  } as Layout;
}

describe('renderCellSelectionOverlay', () => {
  let localSelectionLayer: HTMLElement;
  let convertPageLocalToOverlayCoords: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localSelectionLayer = document.createElement('div');
    convertPageLocalToOverlayCoords = vi.fn((pageIndex: number, x: number, y: number) => ({
      x: x + pageIndex * 10,
      y: y + pageIndex * 10,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders basic cell selection with single cell', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 2,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [
      { index: 0, x: 0, width: 200 },
      { index: 1, x: 200, width: 200 },
    ]);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60]);

    // Mock TableMap.get to return a valid table map
    const mockTableMap = {
      width: 2,
      height: 3,
      map: [0, 1], // Cell offsets
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBeGreaterThan(0);
  });

  it('handles merged cells with colspan > 1', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 2, rowspan: 1 } },
        pos: 1,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    const columnBoundaries = [
      { index: 0, x: 0, width: 200 },
      { index: 1, x: 200, width: 200 },
      { index: 2, x: 400, width: 200 },
    ];
    const fragment = createMockTableFragment('0-table', 0, 0, 2, columnBoundaries);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60]);

    const mockTableMap = {
      width: 3,
      height: 2,
      map: [0, 0, 1], // First cell spans 2 columns
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBeGreaterThan(0);

    // Verify merged cell width (should be 2 columns: 200 + 200 = 400)
    const firstHighlight = highlights[0] as HTMLElement;
    expect(parseInt(firstHighlight.style.width)).toBeGreaterThan(200);
  });

  it('handles merged cells with rowspan > 1', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 2 } },
        pos: 1,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [{ index: 0, x: 0, width: 200 }]);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60]);

    const mockTableMap = {
      width: 1,
      height: 3,
      map: [0, 0, 1], // First cell spans 2 rows
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBeGreaterThan(0);

    // Verify merged cell height (should be 2 rows: 60 + 60 = 120)
    const firstHighlight = highlights[0] as HTMLElement;
    expect(parseInt(firstHighlight.style.height)).toBeGreaterThan(60);
  });

  it('handles multi-page table selections', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 2,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    const columnBoundaries = [{ index: 0, x: 0, width: 200 }];

    // Table spans two pages: rows 0-2 on page 0, rows 3-5 on page 1
    const fragment1 = createMockTableFragment('0-table', 0, 0, 3, columnBoundaries);
    const fragment2 = createMockTableFragment('0-table', 1, 3, 6, columnBoundaries);

    const layout = createMockLayout([{ fragments: [fragment1] }, { fragments: [fragment2] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60, 60, 60, 60]);

    const mockTableMap = {
      width: 1,
      height: 6,
      map: [0, 1, 2, 3, 4, 5],
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    // Should call coordinate conversion for both pages
    expect(convertPageLocalToOverlayCoords).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
  });

  it('skips cells outside fragment row range', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 1, // Row 0
      },
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 6, // Row 5 (outside fragment range)
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    // Fragment only shows rows 0-2
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [{ index: 0, x: 0, width: 200 }]);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60, 60, 60, 60]);

    const mockTableMap = {
      width: 1,
      height: 6,
      map: [0, 1, 2, 3, 4, 5],
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    // Should only render cells within the fragment range
    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBe(1);
  });

  it('handles empty selection gracefully', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    // No cells selected
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([]);

    const tableBlock = createMockTableBlock('0-table');
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [{ index: 0, x: 0, width: 200 }]);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60]);

    const mockTableMap = {
      width: 1,
      height: 3,
      map: [0, 1, 2],
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBe(0);
  });

  it('handles invalid table fragment (missing column boundaries)', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 2,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    const fragment = {
      kind: 'table',
      blockId: '0-table',
      x: 50,
      y: 100,
      width: 600,
      height: 200,
      fromRow: 0,
      toRow: 3,
      metadata: {}, // No columnBoundaries
    } as TableFragment;

    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60]);

    const mockTableMap = {
      width: 1,
      height: 3,
      map: [0, 1, 2],
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    // Should gracefully handle missing metadata
    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBe(0);
  });

  it('handles coordinate conversion returning null (virtualized page)', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 2,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [{ index: 0, x: 0, width: 200 }]);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60]);

    const mockTableMap = {
      width: 1,
      height: 3,
      map: [0, 1, 2],
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    // Coordinate conversion returns null (page not mounted)
    const coordsReturningNull = vi.fn(() => null);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords: coordsReturningNull,
    };

    renderCellSelectionOverlay(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBe(0);
  });

  it('applies proper styling to cell selection rectangles', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 2,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [{ index: 0, x: 0, width: 200 }]);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60]);

    const mockTableMap = {
      width: 1,
      height: 3,
      map: [0, 1, 2],
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBeGreaterThan(0);

    const firstHighlight = highlights[0] as HTMLElement;
    expect(firstHighlight.style.position).toBe('absolute');
    expect(firstHighlight.style.backgroundColor).toBe('rgba(51, 132, 255, 0.35)');
    expect(firstHighlight.style.pointerEvents).toBe('none');
    expect(parseInt(firstHighlight.style.width)).toBeGreaterThanOrEqual(1);
    expect(parseInt(firstHighlight.style.height)).toBeGreaterThanOrEqual(1);
  });

  it('handles invalid input parameters gracefully', () => {
    const deps: RenderCellSelectionOverlayDeps = {
      selection: null as unknown as CellSelection,
      layout: null as unknown as Layout,
      localSelectionLayer,
      blocks: [],
      measures: [],
      cellAnchorTableBlockId: null,
      convertPageLocalToOverlayCoords,
    };

    // Should not throw
    expect(() => renderCellSelectionOverlay(deps)).not.toThrow();

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBe(0);
  });

  it('handles TableMap.get throwing an error', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 2,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [{ index: 0, x: 0, width: 200 }]);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    const tableMeasure = createMockTableMeasure([60, 60, 60]);

    // Mock TableMap.get to throw an error
    vi.spyOn(TableMap, 'get').mockImplementation(() => {
      throw new Error('Invalid table structure');
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    // Should log error and gracefully degrade
    expect(consoleErrorSpy).toHaveBeenCalled();
    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBe(0);

    consoleErrorSpy.mockRestore();
  });

  it('handles missing anchor cell in selection', () => {
    const selection = {
      $anchorCell: null,
    } as unknown as CellSelection;

    const tableBlock = createMockTableBlock('0-table');
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [{ index: 0, x: 0, width: 200 }]);
    const layout = createMockLayout([{ fragments: [fragment] }]);

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    expect(consoleWarnSpy).toHaveBeenCalledWith('[renderCellSelectionOverlay] No anchor cell in selection');

    consoleWarnSpy.mockRestore();
  });

  it('clamps minimum width and height to 1px', () => {
    const selection = createMockCellSelection(2, 2, 0, 'table');
    (selection as unknown as { _setCellNodes: (nodes: unknown[]) => void })._setCellNodes([
      {
        node: { attrs: { colspan: 1, rowspan: 1 } },
        pos: 2,
      },
    ]);

    const tableBlock = createMockTableBlock('0-table');
    // Very narrow column
    const fragment = createMockTableFragment('0-table', 0, 0, 3, [{ index: 0, x: 0, width: 0.5 }]);
    const layout = createMockLayout([{ fragments: [fragment] }]);
    // Very short row
    const tableMeasure = createMockTableMeasure([0.3, 0.3, 0.3]);

    const mockTableMap = {
      width: 1,
      height: 3,
      map: [0, 1, 2],
    };
    vi.spyOn(TableMap, 'get').mockReturnValue(mockTableMap as unknown as TableMap);

    const deps: RenderCellSelectionOverlayDeps = {
      selection,
      layout,
      localSelectionLayer,
      blocks: [tableBlock as FlowBlock],
      measures: [tableMeasure as Measure],
      cellAnchorTableBlockId: '0-table',
      convertPageLocalToOverlayCoords,
    };

    renderCellSelectionOverlay(deps);

    const highlights = localSelectionLayer.querySelectorAll('.presentation-editor__cell-selection-rect');
    expect(highlights.length).toBeGreaterThan(0);

    const firstHighlight = highlights[0] as HTMLElement;
    expect(parseInt(firstHighlight.style.width)).toBeGreaterThanOrEqual(1);
    expect(parseInt(firstHighlight.style.height)).toBeGreaterThanOrEqual(1);
  });
});
