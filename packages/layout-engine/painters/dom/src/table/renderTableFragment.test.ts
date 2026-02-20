/**
 * Tests for table fragment rendering and metadata embedding
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderTableFragment } from './renderTableFragment.js';
import type {
  TableBlock,
  TableFragment,
  TableMeasure,
  BlockId,
  TableColumnBoundary,
  ParagraphBlock,
} from '@superdoc/contracts';
import type { BlockLookup, FragmentRenderContext } from '../renderer.js';

/**
 * Create a minimal table block for testing
 */
function createTestTableBlock(): TableBlock {
  return {
    kind: 'table',
    id: 'test-table-1' as BlockId,
    rows: [
      {
        id: 'row-1' as BlockId,
        cells: [
          {
            id: 'cell-1-1' as BlockId,
            paragraph: {
              kind: 'paragraph',
              id: 'para-1-1' as BlockId,
              runs: [],
            },
          },
        ],
      },
    ],
  };
}

/**
 * Create a minimal table measure
 */
function createTestTableMeasure(): TableMeasure {
  return {
    kind: 'table',
    rows: [
      {
        cells: [
          {
            paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
            width: 100,
            height: 20,
          },
        ],
        height: 20,
      },
    ],
    columnWidths: [100],
    totalWidth: 100,
    totalHeight: 20,
  };
}

/**
 * Create a test table fragment with metadata
 */
function createTestTableFragment(columnBoundaries?: TableColumnBoundary[]): TableFragment {
  return {
    kind: 'table',
    blockId: 'test-table-1' as BlockId,
    fromRow: 0,
    toRow: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    metadata: columnBoundaries
      ? {
          columnBoundaries,
          coordinateSystem: 'fragment',
        }
      : undefined,
  };
}

describe('renderTableFragment', () => {
  let doc: Document;
  let blockLookup: BlockLookup;
  let context: FragmentRenderContext;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('test');
    blockLookup = new Map();
    context = {
      sectionIndex: 0,
      pageIndex: 0,
      columnIndex: 0,
    };
  });

  describe('metadata embedding', () => {
    it('should embed metadata in data-table-boundaries attribute', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [{ index: 0, x: 0, width: 100, minWidth: 25, resizable: true }];
      const fragment = createTestTableFragment(columnBoundaries);

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.columns).toBeDefined();
      expect(parsed.columns).toHaveLength(1);
      expect(parsed.columns[0]).toMatchObject({
        i: 0,
        x: 0,
        w: 100,
        min: 25,
        r: 1,
      });
    });

    it('should produce valid JSON serialization', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 150, minWidth: 30, resizable: true },
      ];
      const fragment = createTestTableFragment(columnBoundaries);

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      // Should not throw when parsing
      expect(() => JSON.parse(metadataAttr!)).not.toThrow();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.columns).toHaveLength(2);
    });

    it('should handle missing metadata gracefully', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment(); // No metadata

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      // Should not crash
      expect(element).toBeDefined();
      // Should not have data-table-boundaries attribute
      expect(element.getAttribute('data-table-boundaries')).toBeNull();
    });

    it('should handle empty columnBoundaries array', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment([]);

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.columns).toHaveLength(0);
    });

    it('should correctly map resizable flag to binary', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 150, minWidth: 30, resizable: false },
      ];
      const fragment = createTestTableFragment(columnBoundaries);

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      const parsed = JSON.parse(metadataAttr!);

      // First column: resizable: true -> r: 1
      expect(parsed.columns[0].r).toBe(1);
      // Second column: resizable: false -> r: 0
      expect(parsed.columns[1].r).toBe(0);
    });

    it('should embed block ID in data-sd-block-id attribute', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment();

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.getAttribute('data-sd-block-id')).toBe('test-table-1');
    });

    it('should add superdoc-table-fragment class', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment();

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.classList.contains('superdoc-table-fragment')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return placeholder when block not found', () => {
      const fragment = createTestTableFragment();
      // Don't add block to lookup

      // Spy on console.error to verify logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Intentionally empty - suppress console output during tests
      });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.classList.contains('superdoc-error-placeholder')).toBe(true);
      expect(element.textContent).toContain('Table rendering error');

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DomPainter: missing table block'),
        expect.objectContaining({
          blockId: 'test-table-1',
        }),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should return placeholder when block is wrong kind', () => {
      const fragment = createTestTableFragment();
      const wrongBlock: ParagraphBlock = {
        kind: 'paragraph',
        id: 'test-table-1' as BlockId,
        runs: [],
      };
      const wrongMeasure = {
        kind: 'paragraph' as const,
        lines: [],
        totalHeight: 0,
      };

      blockLookup.set(fragment.blockId, {
        block: wrongBlock as unknown as TableBlock,
        measure: wrongMeasure as unknown as TableMeasure,
      });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.classList.contains('superdoc-error-placeholder')).toBe(true);
    });

    it('should return placeholder when doc is not available', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const fragment = createTestTableFragment();

      blockLookup.set(fragment.blockId, { block, measure });

      // Spy on console.error to verify logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Intentionally empty - suppress console output during tests
      });

      const element = renderTableFragment({
        doc: null as unknown as Document, // Simulate missing doc
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.classList.contains('superdoc-error-placeholder')).toBe(true);
      expect(element.textContent).toContain('Document not available');

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith('DomPainter: document is not available');

      consoleErrorSpy.mockRestore();
    });

    it('should return placeholder element when measure is wrong kind', () => {
      const fragment = createTestTableFragment();
      const block = createTestTableBlock();
      const wrongMeasure = {
        kind: 'paragraph' as const,
        lines: [],
        totalHeight: 0,
      };

      blockLookup.set(fragment.blockId, {
        block,
        measure: wrongMeasure as unknown as TableMeasure,
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Intentionally empty - suppress console output during tests
      });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      expect(element.classList.contains('superdoc-error-placeholder')).toBe(true);
      expect(element.textContent).toContain('Table rendering error');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('metadata format', () => {
    it('should use compact property names (i, x, w, min, r)', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [{ index: 0, x: 50, width: 100, minWidth: 25, resizable: true }];
      const fragment = createTestTableFragment(columnBoundaries);

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      const parsed = JSON.parse(metadataAttr!);

      // Should use compact names
      expect(parsed.columns[0]).toHaveProperty('i');
      expect(parsed.columns[0]).toHaveProperty('x');
      expect(parsed.columns[0]).toHaveProperty('w');
      expect(parsed.columns[0]).toHaveProperty('min');
      expect(parsed.columns[0]).toHaveProperty('r');

      // Should not use long names
      expect(parsed.columns[0]).not.toHaveProperty('index');
      expect(parsed.columns[0]).not.toHaveProperty('width');
      expect(parsed.columns[0]).not.toHaveProperty('minWidth');
      expect(parsed.columns[0]).not.toHaveProperty('resizable');
    });

    it('should preserve numeric precision', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 123.456, width: 789.012, minWidth: 25.5, resizable: true },
      ];
      const fragment = createTestTableFragment(columnBoundaries);

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      const parsed = JSON.parse(metadataAttr!);

      expect(parsed.columns[0].x).toBe(123.456);
      expect(parsed.columns[0].w).toBe(789.012);
      expect(parsed.columns[0].min).toBe(25.5);
    });
  });

  describe('cell width rescaling (SD-1859)', () => {
    it('should use fragment.columnWidths for cell widths when present', () => {
      // Simulates a mixed-orientation doc: table measured at landscape width (432px per col)
      // but rendered in portrait where fragment.columnWidths rescales to 312px per col.
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-1' as BlockId,
        rows: [
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-1' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-1-2' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-2' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 432,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 432,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [432, 432],
        totalWidth: 864,
        totalHeight: 20,
      };

      // Fragment with rescaled column widths (portrait: 624px total)
      const fragment: TableFragment = {
        kind: 'table',
        blockId: 'test-table-1' as BlockId,
        fromRow: 0,
        toRow: 1,
        x: 0,
        y: 0,
        width: 624,
        height: 20,
        columnWidths: [312, 312], // rescaled from [432, 432]
      };

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
        applyStyles: () => {},
      });

      // Find rendered cell elements (absolutely positioned divs inside container)
      const cells = element.querySelectorAll<HTMLElement>('div[style*="position: absolute"]');
      expect(cells.length).toBeGreaterThanOrEqual(2);

      // Cell 1: should be at x=0, width=312 (not 432)
      const cell1 = cells[0];
      expect(cell1.style.left).toBe('0px');
      expect(cell1.style.width).toBe('312px');

      // Cell 2: should be at x=312, width=312 (not 432)
      const cell2 = cells[1];
      expect(cell2.style.left).toBe('312px');
      expect(cell2.style.width).toBe('312px');
    });

    it('should fall back to cellMeasure.width when fragment.columnWidths is absent', () => {
      const block = createTestTableBlock();
      const measure = createTestTableMeasure();
      // Fragment without columnWidths — should use measure.columnWidths
      const fragment: TableFragment = {
        kind: 'table',
        blockId: 'test-table-1' as BlockId,
        fromRow: 0,
        toRow: 1,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        // no columnWidths
      };

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
        applyStyles: () => {},
      });

      const cells = element.querySelectorAll<HTMLElement>('div[style*="position: absolute"]');
      expect(cells.length).toBeGreaterThanOrEqual(1);

      // Should use measure.columnWidths[0] = 100
      expect(cells[0].style.width).toBe('100px');
    });
  });

  describe('boundary segment logic', () => {
    it('should create segments for cells with varying rowspan', () => {
      // Create a table with mixed rowspans:
      // Row 0: [Cell(colspan=1, rowspan=2), Cell(colspan=1, rowspan=1)]
      // Row 1: [Cell(colspan=1, rowspan=1)] (only one cell due to rowspan above)
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-segments' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              {
                id: 'cell-0-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-0' as BlockId,
                  runs: [],
                },
                attrs: { colspan: 1, rowspan: 2 },
              },
              {
                id: 'cell-0-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-1' as BlockId,
                  runs: [],
                },
                attrs: { colspan: 1, rowspan: 1 },
              },
            ],
          },
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-1' as BlockId,
                  runs: [],
                },
                attrs: { colspan: 1, rowspan: 1 },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 40,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 2,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 40,
      };

      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 100, minWidth: 25, resizable: true },
      ];

      const fragment = createTestTableFragment(columnBoundaries);
      fragment.fromRow = 0;
      fragment.toRow = 2;

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.segments).toBeDefined();
      expect(Array.isArray(parsed.segments)).toBe(true);

      // Column 0 should have no segments at boundary (it's the left edge)
      // Column 1 should have segments where cells end at column 1
      expect(parsed.segments[1]).toBeDefined();
      expect(Array.isArray(parsed.segments[1])).toBe(true);
    });

    it('should handle cells spanning multiple rows with boundary detection', () => {
      // Table with a cell spanning 3 rows in first column
      // This means column boundary 1 exists only in rows where column 1 has actual cells
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-rowspan' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              {
                id: 'cell-0-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-0' as BlockId,
                  runs: [],
                },
                attrs: { colspan: 1, rowspan: 3 },
              },
              {
                id: 'cell-0-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              {
                id: 'cell-2-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 60,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 3,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 60,
      };

      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 100, minWidth: 25, resizable: true },
      ];

      const fragment = createTestTableFragment(columnBoundaries);
      fragment.fromRow = 0;
      fragment.toRow = 3;

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.segments).toBeDefined();

      // Verify segments exist for column 1 (where cells actually end)
      expect(parsed.segments[1]).toBeDefined();
      expect(Array.isArray(parsed.segments[1])).toBe(true);
      expect(parsed.segments[1].length).toBeGreaterThan(0);
    });

    it('should handle empty rows gracefully', () => {
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-empty' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              {
                id: 'cell-0-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-0' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          // Empty row - no cells
          {
            id: 'row-1' as BlockId,
            cells: [],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              {
                id: 'cell-2-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-0' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100],
        totalWidth: 100,
        totalHeight: 60,
      };

      const columnBoundaries: TableColumnBoundary[] = [{ index: 0, x: 0, width: 100, minWidth: 25, resizable: true }];

      const fragment = createTestTableFragment(columnBoundaries);
      fragment.fromRow = 0;
      fragment.toRow = 3;

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      // Should not crash with empty row
      expect(element).toBeDefined();
      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();
    });

    it('should properly merge adjacent segments', () => {
      // Table where boundary exists in consecutive rows - should merge into single segment
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-merge' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              {
                id: 'cell-0-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-0' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-0-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-1' as BlockId,
            cells: [
              {
                id: 'cell-1-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-0' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-1-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              {
                id: 'cell-2-0' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-0' as BlockId,
                  runs: [],
                },
              },
              {
                id: 'cell-2-1' as BlockId,
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-2-1' as BlockId,
                  runs: [],
                },
              },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 0,
                colSpan: 1,
                rowSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 20 },
                width: 100,
                height: 20,
                gridColumnStart: 1,
                colSpan: 1,
                rowSpan: 1,
              },
            ],
            height: 20,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 60,
      };

      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 100, minWidth: 25, resizable: true },
      ];

      const fragment = createTestTableFragment(columnBoundaries);
      fragment.fromRow = 0;
      fragment.toRow = 3;

      blockLookup.set(fragment.blockId, { block, measure });

      const element = renderTableFragment({
        doc,
        fragment,
        context,
        blockLookup,
        renderLine: (_block, _line, _ctx, _lineIndex, _isLastLine) => doc.createElement('div'),
        applyFragmentFrame: () => {
          // Intentionally empty for test mock
        },
        applySdtDataset: () => {
          // Intentionally empty for test mock
        },
        applyStyles: () => {
          // Intentionally empty for test mock
        },
      });

      const metadataAttr = element.getAttribute('data-table-boundaries');
      expect(metadataAttr).toBeTruthy();

      const parsed = JSON.parse(metadataAttr!);
      expect(parsed.segments).toBeDefined();

      // Column 1 boundary should exist in all three rows
      // Should be merged into a single segment
      expect(parsed.segments[1]).toBeDefined();
      expect(Array.isArray(parsed.segments[1])).toBe(true);

      // Verify that segments are being created
      // Since all rows have the boundary at column 1, it should merge into fewer segments
      const col1Segments = parsed.segments[1];
      expect(col1Segments.length).toBeGreaterThan(0);

      // Each segment should have c (column), y (position), h (height)
      col1Segments.forEach((seg: { c: number; y: number; h: number }) => {
        expect(seg).toHaveProperty('c');
        expect(seg).toHaveProperty('y');
        expect(seg).toHaveProperty('h');
        expect(typeof seg.y).toBe('number');
        expect(typeof seg.h).toBe('number');
      });
    });

    it('should scope segments to fragment row range for split tables', () => {
      // A 3-row table split across two pages:
      // Fragment 1 (page 1): rows 0-1, height 60
      // Fragment 2 (page 2): row 2, height 30
      // Each fragment should only have segments matching its own rows.
      const block: TableBlock = {
        kind: 'table',
        id: 'test-table-split' as BlockId,
        rows: [
          {
            id: 'row-0' as BlockId,
            cells: [
              { id: 'cell-0-0' as BlockId, paragraph: { kind: 'paragraph', id: 'p-0-0' as BlockId, runs: [] } },
              { id: 'cell-0-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-0-1' as BlockId, runs: [] } },
            ],
          },
          {
            id: 'row-1' as BlockId,
            cells: [
              { id: 'cell-1-0' as BlockId, paragraph: { kind: 'paragraph', id: 'p-1-0' as BlockId, runs: [] } },
              { id: 'cell-1-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-1-1' as BlockId, runs: [] } },
            ],
          },
          {
            id: 'row-2' as BlockId,
            cells: [
              { id: 'cell-2-0' as BlockId, paragraph: { kind: 'paragraph', id: 'p-2-0' as BlockId, runs: [] } },
              { id: 'cell-2-1' as BlockId, paragraph: { kind: 'paragraph', id: 'p-2-1' as BlockId, runs: [] } },
            ],
          },
        ],
      };

      const measure: TableMeasure = {
        kind: 'table',
        rows: [
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 0,
                colSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 1,
                colSpan: 1,
              },
            ],
            height: 30,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 0,
                colSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 1,
                colSpan: 1,
              },
            ],
            height: 30,
          },
          {
            cells: [
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 0,
                colSpan: 1,
              },
              {
                paragraph: { kind: 'paragraph', lines: [], totalHeight: 30 },
                width: 100,
                height: 30,
                gridColumnStart: 1,
                colSpan: 1,
              },
            ],
            height: 30,
          },
        ],
        columnWidths: [100, 100],
        totalWidth: 200,
        totalHeight: 90,
      };

      const columnBoundaries: TableColumnBoundary[] = [
        { index: 0, x: 0, width: 100, minWidth: 25, resizable: true },
        { index: 1, x: 100, width: 100, minWidth: 25, resizable: true },
      ];

      const renderDeps = {
        doc,
        context,
        blockLookup,
        renderLine: (_block: ParagraphBlock, _line: unknown, _ctx: unknown, _lineIndex: number, _isLastLine: boolean) =>
          doc.createElement('div'),
        applyFragmentFrame: () => {},
        applySdtDataset: () => {},
        applyStyles: () => {},
      };

      // Fragment 1: rows 0-1 (height = 60)
      const fragment1: TableFragment = {
        kind: 'table',
        blockId: 'test-table-split' as BlockId,
        fromRow: 0,
        toRow: 2,
        x: 0,
        y: 0,
        width: 200,
        height: 60,
        continuesOnNext: true,
        metadata: { columnBoundaries, coordinateSystem: 'fragment' },
      };

      blockLookup.set(fragment1.blockId, { block, measure });
      const el1 = renderTableFragment({ ...renderDeps, fragment: fragment1 });
      const parsed1 = JSON.parse(el1.getAttribute('data-table-boundaries')!);

      // Fragment 1 has 2 rows of height 30 each → segment height should be 60
      expect(parsed1.segments[1]).toHaveLength(1);
      expect(parsed1.segments[1][0].h).toBe(60);
      expect(parsed1.segments[1][0].y).toBe(0);

      // Fragment 2: row 2 only (height = 30)
      const fragment2: TableFragment = {
        kind: 'table',
        blockId: 'test-table-split' as BlockId,
        fromRow: 2,
        toRow: 3,
        x: 0,
        y: 0,
        width: 200,
        height: 30,
        continuesFromPrev: true,
        metadata: { columnBoundaries, coordinateSystem: 'fragment' },
      };

      const el2 = renderTableFragment({ ...renderDeps, fragment: fragment2 });
      const parsed2 = JSON.parse(el2.getAttribute('data-table-boundaries')!);

      // Fragment 2 has 1 row of height 30 → segment height should be 30
      expect(parsed2.segments[1]).toHaveLength(1);
      expect(parsed2.segments[1][0].h).toBe(30);
      expect(parsed2.segments[1][0].y).toBe(0);
    });
  });
});
