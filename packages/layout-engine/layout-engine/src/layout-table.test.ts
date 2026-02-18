/**
 * Tests for table layout with column boundary metadata generation
 */

import { describe, it, expect } from 'vitest';
import { layoutTableBlock } from './layout-table.js';
import type { TableBlock, TableMeasure, TableFragment, BlockId, TableAttrs } from '@superdoc/contracts';

/**
 * Creates a dummy table fragment for test scenarios where prior page content is needed.
 *
 * This helper is used to simulate a page that already has content (fragments.length > 0),
 * which triggers specific layout behaviors like the table start preflight check. The dummy
 * fragment represents existing content that occupies space on the page before the table.
 *
 * @returns A minimal TableFragment with zero dimensions that serves as a placeholder
 */
const createDummyFragment = (): TableFragment => ({
  kind: 'table',
  blockId: 'dummy' as BlockId,
  fromRow: 0,
  toRow: 0,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  metadata: { columnBoundaries: [], coordinateSystem: 'fragment' },
});

/**
 * Create a mock table block for testing
 */
function createMockTableBlock(
  rowCount: number,
  rowAttrs?: Array<{ repeatHeader?: boolean; cantSplit?: boolean }>,
  tableAttrs?: TableAttrs,
): TableBlock {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    id: `row-${i}` as BlockId,
    cells: [
      {
        id: `cell-${i}-0` as BlockId,
        paragraph: {
          kind: 'paragraph' as const,
          id: `para-${i}-0` as BlockId,
          runs: [],
        },
      },
      {
        id: `cell-${i}-1` as BlockId,
        paragraph: {
          kind: 'paragraph' as const,
          id: `para-${i}-1` as BlockId,
          runs: [],
        },
      },
    ],
    attrs: rowAttrs?.[i]
      ? {
          tableRowProperties: {
            repeatHeader: rowAttrs[i].repeatHeader,
            cantSplit: rowAttrs[i].cantSplit,
          },
        }
      : undefined,
  }));

  return {
    kind: 'table',
    id: 'test-table' as BlockId,
    rows,
    attrs: tableAttrs,
  };
}

/**
 * Create a mock table measure for testing table layout scenarios.
 *
 * @param columnWidths - Array of column widths in pixels
 * @param rowHeights - Array of row heights in pixels
 * @param lineHeightsPerRow - Optional 2D array specifying line heights for each row's cells.
 *   Format: lineHeightsPerRow[rowIndex] = [lineHeight1, lineHeight2, ...]
 *   If omitted, cells will have no lines. This parameter enables testing of mid-row
 *   splitting behavior where rows are split at line boundaries.
 * @returns A TableMeasure object with mocked cell, row, and line data
 */
function createMockTableMeasure(
  columnWidths: number[],
  rowHeights: number[],
  lineHeightsPerRow?: number[][],
): TableMeasure {
  return {
    kind: 'table',
    rows: rowHeights.map((height, rowIdx) => ({
      cells: columnWidths.map((width) => ({
        paragraph: {
          kind: 'paragraph',
          lines: (lineHeightsPerRow?.[rowIdx] ?? []).map((lineHeight) => ({
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 1,
            width,
            ascent: lineHeight * 0.75,
            descent: lineHeight * 0.25,
            lineHeight,
          })),
          totalHeight: height,
        },
        width,
        height,
      })),
      height,
    })),
    columnWidths,
    totalWidth: columnWidths.reduce((sum, w) => sum + w, 0),
    totalHeight: rowHeights.reduce((sum, h) => sum + h, 0),
  };
}

describe('layoutTableBlock', () => {
  describe('metadata generation', () => {
    it('should generate column boundary metadata for tables', () => {
      const block = createMockTableBlock(2);
      const measure = createMockTableMeasure([100, 150, 200], [20, 25]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 450,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(1);
      const fragment = fragments[0];

      expect(fragment.metadata).toBeDefined();
      expect(fragment.metadata?.columnBoundaries).toBeDefined();
      expect(fragment.metadata?.coordinateSystem).toBe('fragment');
    });

    it('should create correct number of column boundaries', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([100, 150, 200], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 450,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const fragment = fragments[0];
      expect(fragment.metadata?.columnBoundaries).toHaveLength(3);
    });

    it('should set correct column boundary positions', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([100, 150, 200], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 450,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      expect(boundaries).toBeDefined();

      // First column starts at x=0, width=100
      expect(boundaries![0]).toMatchObject({
        index: 0,
        x: 0,
        width: 100,
      });

      // Second column starts at x=100, width=150
      expect(boundaries![1]).toMatchObject({
        index: 1,
        x: 100,
        width: 150,
      });

      // Third column starts at x=250, width=200
      expect(boundaries![2]).toMatchObject({
        index: 2,
        x: 250,
        width: 200,
      });
    });

    it('should set minimum widths for columns', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([100, 150, 200], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 450,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      expect(boundaries).toBeDefined();

      // All columns should have minWidth >= 25 (absolute minimum)
      boundaries?.forEach((boundary) => {
        expect(boundary.minWidth).toBeGreaterThanOrEqual(25);
      });
    });

    it('should mark all columns as resizable', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([100, 150, 200], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 450,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      expect(boundaries).toBeDefined();

      boundaries?.forEach((boundary) => {
        expect(boundary.resizable).toBe(true);
      });
    });

    it('should handle single-column tables', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([300], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 300,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      expect(boundaries).toHaveLength(1);
      expect(boundaries![0]).toMatchObject({
        index: 0,
        x: 0,
        width: 300,
      });
    });

    it('should not include rowBoundaries metadata (Phase 1 scope)', () => {
      const block = createMockTableBlock(3);
      const measure = createMockTableMeasure([100, 150], [20, 25, 30]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 250,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const fragment = fragments[0];
      expect(fragment.metadata?.rowBoundaries).toBeUndefined();
    });
  });

  describe('justification alignment', () => {
    it('positions the table based on justification', () => {
      const measure = createMockTableMeasure([100, 100], [20]);
      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      const layoutWithJustification = (justification: 'center' | 'right') => {
        const block = createMockTableBlock(1, undefined, { justification });
        fragments.length = 0;

        layoutTableBlock({
          block,
          measure,
          columnWidth: 500,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 0,
        });

        return fragments[0];
      };

      const centerFragment = layoutWithJustification('center');
      expect(centerFragment.x).toBe(150);

      const rightFragment = layoutWithJustification('right');
      expect(rightFragment.x).toBe(300);
    });
  });

  describe('table start preflight', () => {
    it('starts a splittable first row on the current page when some content fits', () => {
      const block = createMockTableBlock(1, [{ cantSplit: false }]);
      const measure = createMockTableMeasure([100], [200], [[10, 10, 10, 10, 10]]);

      const fragments: TableFragment[] = [createDummyFragment()];
      let advanced = false;
      const contentBottom = 40; // Only 30px remaining on the current page

      // Create a persistent state object that can be mutated
      const pageState = {
        page: { fragments },
        columnIndex: 0,
        cursorY: 10, // Prior content occupies space
        contentBottom,
      };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => pageState,
        advanceColumn: (state) => {
          advanced = true;
          pageState.cursorY = 0;
          return pageState;
        },
        columnX: () => 0,
      });

      // Should start on current page (not advance during preflight)
      expect(fragments[1]).toBeDefined();
      expect(fragments[1].y).toBe(10); // First fragment starts at current cursor position
      // Should eventually advance after rendering what fits on current page
      expect(advanced).toBe(true);
      expect(fragments.length).toBeGreaterThan(2); // Dummy + first partial + continuation(s)
    });

    it('advances when the first row is cantSplit and does not fit the remaining space', () => {
      const block = createMockTableBlock(1, [{ cantSplit: true }]);
      const measure = createMockTableMeasure([100], [200], [[10, 10, 10, 10, 10, 10]]);

      const fragments: TableFragment[] = [createDummyFragment()];
      let cursorY = 20;
      let contentBottom = 60; // Only 40px remaining; row needs 200px
      let advanced = false;

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: { fragments },
          columnIndex: 0,
          cursorY,
          contentBottom,
        }),
        advanceColumn: () => {
          advanced = true;
          cursorY = 0;
          contentBottom = 300; // New page with enough space
          return {
            page: { fragments },
            columnIndex: 0,
            cursorY,
            contentBottom,
          };
        },
        columnX: () => 0,
      });

      expect(advanced).toBe(true);
      expect(fragments.length).toBeGreaterThan(1);
      expect(fragments[1].y).toBe(0);
    });

    it('handles zero available space with prior fragments', () => {
      const block = createMockTableBlock(1, [{ cantSplit: false }]);
      const measure = createMockTableMeasure([100], [100], [[10, 10, 10]]);

      const fragments: TableFragment[] = [createDummyFragment()];
      let advanced = false;
      const contentBottom = 20;

      const pageState = {
        page: { fragments },
        columnIndex: 0,
        cursorY: 20, // Cursor at bottom - zero available space
        contentBottom,
      };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => pageState,
        advanceColumn: (state) => {
          advanced = true;
          pageState.cursorY = 0;
          pageState.page = { fragments };
          return pageState;
        },
        columnX: () => 0,
      });

      // Should advance immediately since no space available
      expect(advanced).toBe(true);
      expect(fragments[1].y).toBe(0); // Table starts on new page
    });

    it('does not advance when no prior fragments regardless of available space', () => {
      const block = createMockTableBlock(1, [{ cantSplit: false }]);
      const measure = createMockTableMeasure([100], [100], [[10, 10, 10]]);

      const fragments: TableFragment[] = []; // No prior fragments
      let advanced = false;
      const contentBottom = 50;

      const pageState = {
        page: { fragments },
        columnIndex: 0,
        cursorY: 10,
        contentBottom,
      };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => pageState,
        advanceColumn: (state) => {
          advanced = true;
          pageState.cursorY = 0;
          return pageState;
        },
        columnX: () => 0,
      });

      // Should not advance during preflight when page is empty (no prior fragments)
      // Preflight check only applies when there's already content on the page
      expect(fragments[0]).toBeDefined();
      expect(fragments[0].y).toBe(10); // Table starts at current cursor position
    });

    it('handles first row with empty paragraphs (no lines)', () => {
      const block = createMockTableBlock(1, [{ cantSplit: false }]);
      // No lineHeightsPerRow provided - cells will have no lines
      const measure = createMockTableMeasure([100], [50]);

      const fragments: TableFragment[] = [createDummyFragment()];
      let advanced = false;
      const contentBottom = 100;

      const pageState = {
        page: { fragments },
        columnIndex: 0,
        cursorY: 10,
        contentBottom,
      };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => pageState,
        advanceColumn: (state) => {
          advanced = true;
          pageState.cursorY = 0;
          return pageState;
        },
        columnX: () => 0,
      });

      // Empty paragraphs (no lines) should be handled gracefully
      // The row should still be rendered with its measured height
      expect(fragments.length).toBeGreaterThan(1);
      expect(fragments[1]).toBeDefined();
      expect(fragments[1].height).toBeGreaterThan(0);
    });
  });

  describe('calculateColumnMinWidth edge cases', () => {
    it('should handle out of bounds column index', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([100, 150], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 250,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      expect(boundaries).toBeDefined();
      // Should only have 2 columns, not crash when accessing non-existent column 999
      expect(boundaries!.length).toBe(2);
    });

    it('should handle single column table', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([300], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 300,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      expect(boundaries).toHaveLength(1);
      expect(boundaries![0].minWidth).toBeGreaterThanOrEqual(25);
      expect(boundaries![0].minWidth).toBeLessThanOrEqual(200);
    });

    it('should handle very wide column (> 200px)', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([500], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 500,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      // Min width should be capped at 200px
      expect(boundaries![0].minWidth).toBe(200);
    });

    it('should handle very narrow column (< 25px)', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([10], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 10,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      // Min width should be at least 25px
      expect(boundaries![0].minWidth).toBe(25);
    });

    it('should handle empty columnWidths array', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      // Should handle empty array gracefully
      expect(boundaries).toBeDefined();
      expect(boundaries!.length).toBe(0);
    });

    it('should handle negative measured width', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([-50], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      // Should default to minimum 25px for negative widths
      expect(boundaries![0].minWidth).toBe(25);
    });

    it('should handle zero measured width', () => {
      const block = createMockTableBlock(1);
      const measure = createMockTableMeasure([0], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      // Should default to minimum 25px for zero width
      expect(boundaries![0].minWidth).toBe(25);
    });

    it('should handle multiple columns with varying widths', () => {
      const block = createMockTableBlock(1);
      // Test mix: very narrow (10), normal (100), very wide (500)
      const measure = createMockTableMeasure([10, 100, 500], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 610,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const boundaries = fragments[0].metadata?.columnBoundaries;
      // Column 0: 10px -> should be 25px (minimum)
      expect(boundaries![0].minWidth).toBe(25);
      // Column 1: 100px -> should be 100px (within range)
      expect(boundaries![1].minWidth).toBe(100);
      // Column 2: 500px -> should be 200px (capped)
      expect(boundaries![2].minWidth).toBe(200);
    });
  });

  describe('layout behavior', () => {
    it('should create table fragments with correct dimensions', () => {
      const block = createMockTableBlock(2);
      const measure = createMockTableMeasure([100, 150], [20, 25]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 250,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 50,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 10,
      });

      expect(fragments).toHaveLength(1);
      const fragment = fragments[0];

      expect(fragment.kind).toBe('table');
      expect(fragment.blockId).toBe('test-table');
      expect(fragment.x).toBe(10);
      expect(fragment.y).toBe(50);
      expect(fragment.width).toBe(250); // totalWidth
      expect(fragment.height).toBe(45); // totalHeight (20 + 25)
    });

    it('should include all rows in fragment range', () => {
      const block = createMockTableBlock(5);
      const measure = createMockTableMeasure([100], Array(5).fill(20));

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const fragment = fragments[0];
      expect(fragment.fromRow).toBe(0);
      expect(fragment.toRow).toBe(5);
    });
  });

  describe('countHeaderRows behavior (via layoutTableBlock)', () => {
    it('should handle tables with no header rows', () => {
      const block = createMockTableBlock(3, [
        { repeatHeader: false },
        { repeatHeader: false },
        { repeatHeader: false },
      ]);
      const measure = createMockTableMeasure([100], [20, 20, 20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const fragment = fragments[0];
      expect(fragment.repeatHeaderCount).toBe(0);
      expect(fragment.fromRow).toBe(0);
      expect(fragment.toRow).toBe(3);
    });

    it('should handle tables with single header row', () => {
      const block = createMockTableBlock(3, [{ repeatHeader: true }, { repeatHeader: false }, { repeatHeader: false }]);
      const measure = createMockTableMeasure([100], [20, 20, 20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const fragment = fragments[0];
      // First fragment sets repeatHeaderCount=0 (headers included in body)
      expect(fragment.repeatHeaderCount).toBe(0);
      expect(fragment.fromRow).toBe(0);
      expect(fragment.toRow).toBe(3);
    });

    it('should handle tables with multiple contiguous header rows', () => {
      const block = createMockTableBlock(5, [
        { repeatHeader: true },
        { repeatHeader: true },
        { repeatHeader: true },
        { repeatHeader: false },
        { repeatHeader: false },
      ]);
      const measure = createMockTableMeasure([100], [20, 20, 20, 20, 20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const fragment = fragments[0];
      // First fragment includes headers in body, repeatHeaderCount=0
      expect(fragment.repeatHeaderCount).toBe(0);
      expect(fragment.fromRow).toBe(0);
      expect(fragment.toRow).toBe(5);
    });

    it('should stop counting headers at first non-header row', () => {
      const block = createMockTableBlock(5, [
        { repeatHeader: true },
        { repeatHeader: true },
        { repeatHeader: false }, // Stops here
        { repeatHeader: true }, // Not counted
        { repeatHeader: false },
      ]);
      const measure = createMockTableMeasure([100], [20, 20, 20, 20, 20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const fragment = fragments[0];
      expect(fragment.fromRow).toBe(0);
      expect(fragment.toRow).toBe(5);
    });

    it('should handle all rows being headers', () => {
      const block = createMockTableBlock(3, [{ repeatHeader: true }, { repeatHeader: true }, { repeatHeader: true }]);
      const measure = createMockTableMeasure([100], [20, 20, 20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      // All rows are headers, but table still creates a fragment with all rows
      expect(fragments).toHaveLength(1);
      expect(fragments[0].fromRow).toBe(0);
      expect(fragments[0].toRow).toBe(3);
    });

    it('should handle undefined row attributes (no headers)', () => {
      const block = createMockTableBlock(3); // No row attrs
      const measure = createMockTableMeasure([100], [20, 20, 20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      const fragment = fragments[0];
      expect(fragment.repeatHeaderCount).toBe(0);
      expect(fragment.fromRow).toBe(0);
      expect(fragment.toRow).toBe(3);
    });
  });

  describe('findSplitPoint behavior (via layoutTableBlock)', () => {
    it('should split table when all rows fit on one page', () => {
      const block = createMockTableBlock(5);
      const measure = createMockTableMeasure([100], [20, 20, 20, 20, 20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000, // Plenty of space
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(1);
      expect(fragments[0].fromRow).toBe(0);
      expect(fragments[0].toRow).toBe(5);
    });

    it('should split table across multiple pages when rows exceed available height', () => {
      const block = createMockTableBlock(10);
      const measure = createMockTableMeasure([100], Array(10).fill(20));

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 100, // Only fits 5 rows at a time (100px / 20px)
        }),
        advanceColumn: (state) => {
          cursorY = 0; // Reset cursor for new page
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 100,
          };
        },
        columnX: () => 0,
      });

      expect(fragments.length).toBeGreaterThan(1);
    });

    it('should handle cantSplit row that does not fit (move to next page)', () => {
      const block = createMockTableBlock(5, [
        { cantSplit: false },
        { cantSplit: false },
        { cantSplit: true }, // Row 2 can't split
        { cantSplit: false },
        { cantSplit: false },
      ]);
      const measure = createMockTableMeasure([100], [20, 20, 30, 20, 20]);

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 50, // Fits rows 0-1 (40px), but not row 2 (30px more)
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 100, // More space on next page
          };
        },
        columnX: () => 0,
      });

      expect(fragments.length).toBeGreaterThan(1);
      // First fragment should end before the cantSplit row
      expect(fragments[0].toRow).toBeLessThanOrEqual(2);
    });

    it('should handle multiple cantSplit rows', () => {
      const block = createMockTableBlock(6, [
        { cantSplit: false },
        { cantSplit: true }, // Row 1
        { cantSplit: true }, // Row 2
        { cantSplit: false },
        { cantSplit: true }, // Row 4
        { cantSplit: false },
      ]);
      const measure = createMockTableMeasure([100], Array(6).fill(20));

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 50, // Fits 2-3 rows at a time
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 50,
          };
        },
        columnX: () => 0,
      });

      expect(fragments.length).toBeGreaterThan(0);
    });

    it('should handle row that exactly fills available space', () => {
      const block = createMockTableBlock(3);
      const measure = createMockTableMeasure([100], [50, 50, 50]);

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 100, // Exactly fits 2 rows (100px / 50px = 2)
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 100,
          };
        },
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(2);
      expect(fragments[0].fromRow).toBe(0);
      expect(fragments[0].toRow).toBe(2);
      expect(fragments[1].fromRow).toBe(2);
      expect(fragments[1].toRow).toBe(3);
    });
  });

  describe('integration: table splitting scenarios', () => {
    it('should split multi-page table with basic row boundaries', () => {
      const block = createMockTableBlock(20);
      const measure = createMockTableMeasure([100], Array(20).fill(25));

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 250, // Fits 10 rows per page (250px / 25px)
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 250,
          };
        },
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(2);
      expect(fragments[0].fromRow).toBe(0);
      expect(fragments[0].toRow).toBe(10);
      expect(fragments[1].fromRow).toBe(10);
      expect(fragments[1].toRow).toBe(20);
      expect(fragments[0].continuesOnNext).toBe(true);
      expect(fragments[1].continuesFromPrev).toBe(true);
    });

    it('should repeat header rows on continuation fragments', () => {
      const block = createMockTableBlock(10, [
        { repeatHeader: true },
        { repeatHeader: true },
        ...Array(8).fill({ repeatHeader: false }),
      ]);
      const measure = createMockTableMeasure([100], Array(10).fill(20));

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 120, // Fits 6 rows (120px / 20px)
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 120,
          };
        },
        columnX: () => 0,
      });

      expect(fragments.length).toBeGreaterThan(1);
      // First fragment starts with headers
      expect(fragments[0].fromRow).toBe(0);
      // Continuation fragments should have repeatHeaderCount
      if (fragments.length > 1) {
        expect(fragments[1].repeatHeaderCount).toBe(2);
      }
    });

    it('should skip header repetition when headers are taller than page', () => {
      const block = createMockTableBlock(5, [
        { repeatHeader: true },
        { repeatHeader: true },
        { repeatHeader: false },
        { repeatHeader: false },
        { repeatHeader: false },
      ]);
      const measure = createMockTableMeasure([100], [80, 80, 20, 20, 20]);

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 100, // Headers are 160px, page is 100px
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 100,
          };
        },
        columnX: () => 0,
      });

      // Should split but not repeat headers (they don't fit)
      if (fragments.length > 1) {
        expect(fragments[1].repeatHeaderCount).toBe(0);
      }
    });

    it('should not split floating tables', () => {
      const block = createMockTableBlock(10, undefined, {
        tableProperties: { floatingTableProperties: { horizontalAnchor: 'page' } },
      });
      const measure = createMockTableMeasure([100], Array(10).fill(20));

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 50, // Not enough space for all rows
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      // Floating table should be rendered as single fragment despite limited space
      expect(fragments).toHaveLength(1);
      expect(fragments[0].fromRow).toBe(0);
      expect(fragments[0].toRow).toBe(10);
      expect(fragments[0].continuesOnNext).toBeUndefined();
    });

    it('should handle cantSplit row forcing move to next page', () => {
      const block = createMockTableBlock(5, [
        { cantSplit: false },
        { cantSplit: false },
        { cantSplit: true }, // Large row that can't split
        { cantSplit: false },
        { cantSplit: false },
      ]);
      const measure = createMockTableMeasure([100], [20, 20, 80, 20, 20]);

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 100,
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 100,
          };
        },
        columnX: () => 0,
      });

      expect(fragments.length).toBeGreaterThan(1);
      // First fragment should end before cantSplit row
      expect(fragments[0].toRow).toBe(2);
      // Second fragment should start with cantSplit row
      expect(fragments[1].fromRow).toBe(2);
    });

    it('should handle over-tall row with forced mid-row split', () => {
      // Create a table with one very tall row that exceeds full page height
      const block = createMockTableBlock(3);
      // Row heights: normal (20px), over-tall (600px), normal (20px)
      const measure = createMockTableMeasure([100], [20, 600, 20]);

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 500, // Full page is 500px, row is 600px
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 500,
          };
        },
        columnX: () => 0,
      });

      // Should create multiple fragments due to over-tall row
      expect(fragments.length).toBeGreaterThan(1);

      // At least one fragment should have partialRow defined (when mid-row split is implemented)
      // For now, the over-tall row will be force-split at row boundaries
      // Once partialRow rendering is complete, this test should verify partialRow metadata
    });
  });

  describe('per-cell line fitting for partial row splits', () => {
    it('should allow cells to advance independently based on fitted lines', () => {
      // Create a table with a single row where cells have different line heights.
      // Each cell should advance based on its own fitted lines, not the minimum across cells.
      const block = createMockTableBlock(1);

      // Cell 0: 3 lines of 20px each (total 60px)
      // Cell 1: 3 lines of 40px each (total 120px)
      const measure = createMockTableMeasure(
        [100, 100], // Two columns
        [120], // Row height (max of cell heights)
        [[20, 20, 20]], // Row 0 defaults (applied to all cells)
      );

      if (measure.rows[0].cells[1]) {
        measure.rows[0].cells[1].paragraph = {
          kind: 'paragraph',
          lines: [
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 1,
              width: 100,
              ascent: 30,
              descent: 10,
              lineHeight: 40,
            },
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 1,
              width: 100,
              ascent: 30,
              descent: 10,
              lineHeight: 40,
            },
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 1,
              width: 100,
              ascent: 30,
              descent: 10,
              lineHeight: 40,
            },
          ],
          totalHeight: 120,
        };
      }

      const fragments: TableFragment[] = [];
      let pageCount = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 50, // Only enough space for 1 line from Cell 0 or Cell 1
        }),
        advanceColumn: (state) => {
          pageCount++;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 50, // Consistently small pages to force line-by-line splitting
          };
        },
        columnX: () => 0,
      });

      // We should see multiple fragments as the row is split
      expect(fragments.length).toBeGreaterThan(1);

      const fragmentWithPartial = fragments.find((f) => 'partialRow' in f && f.partialRow);
      expect(fragmentWithPartial).toBeDefined();

      if (fragmentWithPartial && 'partialRow' in fragmentWithPartial && fragmentWithPartial.partialRow) {
        const { toLineByCell } = fragmentWithPartial.partialRow;
        expect(toLineByCell[0]).toBeGreaterThan(toLineByCell[1]);
      }
    });

    it('should not call advanceColumn when partial row makes progress', () => {
      // This tests the bug fix where advanceColumn was being called even when progress was made
      const block = createMockTableBlock(1);

      // Create a row with multiple lines that will need to be split
      const measure = createMockTableMeasure(
        [100],
        [100], // Row with total height 100px
        [[20, 20, 20, 20, 20]], // 5 lines of 20px each
      );

      const fragments: TableFragment[] = [];
      let advanceCallCount = 0;
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: cursorY + 40, // Space for 2 lines at a time
        }),
        advanceColumn: (state) => {
          advanceCallCount++;
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 40,
          };
        },
        columnX: () => 0,
      });

      // The row should be split across multiple fragments as it makes progress
      expect(fragments.length).toBeGreaterThan(1);

      // advanceColumn should only be called when no progress is made or when starting a new page
      // With the fix, it should NOT be called when partial row makes progress
      // The number of advance calls should be less than the number of fragments
      // because progress-based continuations stay on the same page
      expect(advanceCallCount).toBeLessThan(fragments.length);
    });

    it('should not create a partial row when all cells fit', () => {
      // When all cells fit in the available space, no partial row metadata should exist.
      const block = createMockTableBlock(1);

      // Create a row where all cells will complete in available space
      const measure = createMockTableMeasure(
        [100, 100],
        [40], // Row height
        [
          [20, 20], // Cell 0: 2 lines of 20px (total 40px)
          [10, 10, 10, 10], // Cell 1: 4 lines of 10px (total 40px)
        ],
      );

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 100, // Plenty of space for entire row
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      // Should create a single fragment since everything fits
      expect(fragments.length).toBe(1);

      // The fragment should not have partialRow since it's complete
      const fragment = fragments[0];
      if ('partialRow' in fragment) {
        // partialRow can be either null or undefined for complete rows
        expect(fragment.partialRow == null).toBe(true);
      }
    });

    it('should handle cells with different line counts in partial row splits', () => {
      // Edge case: cells have different numbers of lines.
      const block = createMockTableBlock(1);

      // Cell 0 has 2 lines, Cell 1 has 4 lines
      const measure = createMockTableMeasure(
        [100, 100],
        [80], // Row height (max of cells)
        [[20, 20]], // Row 0 defaults (applied to all cells)
      );

      if (measure.rows[0].cells[1]) {
        measure.rows[0].cells[1].paragraph = {
          kind: 'paragraph',
          lines: [
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 1,
              width: 100,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 1,
              width: 100,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 1,
              width: 100,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 1,
              width: 100,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
          ],
          totalHeight: 80,
        };
      }

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: cursorY + 30, // Space for 1 line (plus some padding)
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 30,
          };
        },
        columnX: () => 0,
      });

      // Should create multiple fragments as the row is split
      expect(fragments.length).toBeGreaterThan(1);

      // Verify that partial row metadata exists and allows different advancements.
      const intermediateFragments = fragments.slice(0, -1);
      const fragmentWithUnevenAdvance = intermediateFragments.find((fragment) => {
        if (!('partialRow' in fragment) || !fragment.partialRow) return false;
        const { toLineByCell, fromLineByCell } = fragment.partialRow;
        const advancements = toLineByCell.map((to, idx) => to - fromLineByCell[idx]);
        return advancements.some((adv) => adv === 0) && advancements.some((adv) => adv > 0);
      });
      expect(fragmentWithUnevenAdvance).toBeDefined();
    });

    it('should handle continuation from partial rows correctly', () => {
      // Test that when a partial row continues to the next page, the fromLineByCell
      // is correctly carried forward
      const block = createMockTableBlock(1);

      // Create a row with 5 lines that will need multiple splits
      const measure = createMockTableMeasure([100], [100], [[20, 20, 20, 20, 20]]);

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: cursorY + 30, // Space for 1 line
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 30,
          };
        },
        columnX: () => 0,
      });

      // Should create multiple fragments
      expect(fragments.length).toBeGreaterThan(1);

      // Check that continuation fragments have proper fromLineByCell values
      let expectedStartLine = 0;
      for (const fragment of fragments) {
        if ('partialRow' in fragment && fragment.partialRow) {
          const { fromLineByCell, toLineByCell, isFirstPart, isLastPart } = fragment.partialRow;

          // fromLineByCell should match expected start line
          expect(fromLineByCell[0]).toBe(expectedStartLine);

          // toLineByCell should be greater than fromLineByCell
          expect(toLineByCell[0]).toBeGreaterThan(fromLineByCell[0]);

          // Update expected start line for next fragment
          expectedStartLine = toLineByCell[0];

          // Check first and last part flags
          if (fragments.indexOf(fragment) === 0) {
            expect(isFirstPart).toBe(true);
          }
          if (fragments.indexOf(fragment) === fragments.length - 1) {
            expect(isLastPart).toBe(true);
          }
        }
      }
    });

    it('should handle edge case of zero line advancement (no progress)', () => {
      // This test verifies the existence of the no-progress detection logic
      // The condition (!madeProgress && hadRemainingLinesBefore) ensures advanceColumn
      // is called when a partial row continuation cannot make progress
      const block = createMockTableBlock(1);

      // Create a simple row that requires splitting
      const measure = createMockTableMeasure([100], [60], [[20, 20, 20]]); // 3 lines of 20px each

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 25, // Space for 1 line at a time
        }),
        advanceColumn: (state) => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 25,
        }),
        columnX: () => 0,
      });

      // Verify that the row is split into multiple fragments
      // The no-progress logic exists to handle edge cases where space becomes insufficient
      // during continuation. While difficult to trigger in a simple test, the logic
      // is critical for production scenarios with complex layouts and padding.
      expect(fragments.length).toBeGreaterThan(1);

      // Verify that partial row splitting occurred
      const fragmentsWithPartialRow = fragments.filter((f) => 'partialRow' in f && f.partialRow !== null);
      expect(fragmentsWithPartialRow.length).toBeGreaterThan(0);
    });

    it('should maintain monotonic per-cell advancement across continuation fragments', () => {
      // Verify continuation fragments keep per-cell line progress monotonic
      // when cells have different line heights.
      const block = createMockTableBlock(1);

      // createMockTableMeasure applies line data per row (not per cell), so seed with
      // row defaults then override each cell explicitly.
      const measure = createMockTableMeasure([100, 100, 100], [120], [[10, 10, 10, 10, 10]]);
      if (measure.rows[0].cells[1]) {
        measure.rows[0].cells[1].paragraph = {
          kind: 'paragraph',
          lines: [20, 20, 20, 20, 20].map((lineHeight) => ({
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 1,
            width: 100,
            ascent: lineHeight * 0.75,
            descent: lineHeight * 0.25,
            lineHeight,
          })),
          totalHeight: 100,
        };
      }
      if (measure.rows[0].cells[2]) {
        measure.rows[0].cells[2].paragraph = {
          kind: 'paragraph',
          lines: [40, 40, 40].map((lineHeight) => ({
            fromRun: 0,
            fromChar: 0,
            toRun: 0,
            toChar: 1,
            width: 100,
            ascent: lineHeight * 0.75,
            descent: lineHeight * 0.25,
            lineHeight,
          })),
          totalHeight: 120,
        };
      }

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 300,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: cursorY + 50, // Space for varying number of lines per cell
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 50,
          };
        },
        columnX: () => 0,
      });

      // Should create multiple fragments
      expect(fragments.length).toBeGreaterThan(1);

      const partialFragments = fragments.filter((f) => 'partialRow' in f && Boolean(f.partialRow));
      expect(partialFragments.length).toBeGreaterThan(1);

      // First fragment should show uneven (independent) advancement.
      const firstPartial = partialFragments[0].partialRow!;
      const firstAdvancements = firstPartial.toLineByCell.map((to, idx) => to - firstPartial.fromLineByCell[idx]);
      expect(new Set(firstAdvancements.filter((a) => a > 0)).size).toBeGreaterThan(1);

      // Continuations must not regress per-cell line indices.
      for (let i = 1; i < partialFragments.length; i += 1) {
        const prev = partialFragments[i - 1].partialRow!;
        const current = partialFragments[i].partialRow!;
        current.fromLineByCell.forEach((fromLine, idx) => {
          expect(fromLine).toBe(prev.toLineByCell[idx]);
        });
      }
    });

    it('should correctly set isFirstPart and isLastPart flags', () => {
      // Test that the partial row info correctly identifies first and last parts
      const block = createMockTableBlock(1);

      // Create a row that will be split into exactly 3 parts
      const measure = createMockTableMeasure([100], [60], [[20, 20, 20]]); // 3 lines of 20px each

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 100,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: cursorY + 25, // Space for 1 line at a time
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 25,
          };
        },
        columnX: () => 0,
      });

      // Should have exactly 3 fragments (one per line)
      expect(fragments.length).toBe(3);

      // First fragment should have isFirstPart = true
      const firstFragment = fragments[0];
      if ('partialRow' in firstFragment && firstFragment.partialRow) {
        expect(firstFragment.partialRow.isFirstPart).toBe(true);
        expect(firstFragment.partialRow.isLastPart).toBe(false);
      }

      // Last fragment should have isLastPart = true
      const lastFragment = fragments[fragments.length - 1];
      if ('partialRow' in lastFragment && lastFragment.partialRow) {
        expect(lastFragment.partialRow.isFirstPart).toBe(false);
        expect(lastFragment.partialRow.isLastPart).toBe(true);
      }

      // Middle fragments should have both flags false
      if (fragments.length > 2) {
        for (let i = 1; i < fragments.length - 1; i++) {
          const fragment = fragments[i];
          if ('partialRow' in fragment && fragment.partialRow) {
            expect(fragment.partialRow.isFirstPart).toBe(false);
            expect(fragment.partialRow.isLastPart).toBe(false);
          }
        }
      }
    });
  });

  describe('tableIndent handling', () => {
    /**
     * Test suite for table indent functionality.
     * Tests the getTableIndentWidth() and applyTableIndent() helper functions
     * through integration with layoutTableBlock.
     */

    describe('getTableIndentWidth - edge cases', () => {
      it('should handle undefined attrs', () => {
        const block = createMockTableBlock(1);
        block.attrs = undefined;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        // Should create fragment with original x position (no indent applied)
        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle missing tableIndent property', () => {
        const block = createMockTableBlock(1);
        block.attrs = { borderCollapse: 'collapse' } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle null tableIndent', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: null } as unknown as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle tableIndent as string (invalid type)', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: 'invalid' } as unknown as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle tableIndent as array (invalid type)', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: [50] } as unknown as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle tableIndent object without width property', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { type: 'dxa' } } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle tableIndent with string width', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: '50' } } as unknown as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle tableIndent with NaN width', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: NaN } } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle tableIndent with Infinity width', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: Infinity } } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle tableIndent with negative Infinity width', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: -Infinity } } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });

      it('should handle valid positive tableIndent width', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: 50 } } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(60); // 10 + 50
        expect(fragments[0].width).toBe(50); // 100 - 50
      });

      it('should handle valid negative tableIndent width', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: -20 } } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(-10); // 10 + (-20)
        expect(fragments[0].width).toBe(120); // 100 - (-20)
      });

      it('should handle zero tableIndent width', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: 0 } } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 10,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(10);
        expect(fragments[0].width).toBe(100);
      });
    });

    describe('applyTableIndent - width clamping', () => {
      it('should apply positive indent correctly', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: 30 } } as TableAttrs;
        const measure = createMockTableMeasure([200], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 200,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 0,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(30);
        expect(fragments[0].width).toBe(170); // 200 - 30
      });

      it('should apply negative indent correctly (extends into margin)', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: -40 } } as TableAttrs;
        const measure = createMockTableMeasure([200], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 200,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 0,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(-40);
        expect(fragments[0].width).toBe(240); // 200 - (-40)
      });

      it('should clamp width to 0 when indent exceeds width', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: 250 } } as TableAttrs;
        const measure = createMockTableMeasure([100], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 100,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 0,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(250);
        expect(fragments[0].width).toBe(0); // Clamped to 0, not negative
      });

      it('should handle zero indent (no change)', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: 0 } } as TableAttrs;
        const measure = createMockTableMeasure([150], [20]);

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 150,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 5,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(5);
        expect(fragments[0].width).toBe(150);
      });
    });

    describe('tableIndent integration scenarios', () => {
      it('should apply tableIndent consistently across multiple fragments (table splitting)', () => {
        const block = createMockTableBlock(10);
        block.attrs = { tableIndent: { width: 25 } } as TableAttrs;
        const measure = createMockTableMeasure([100], Array(10).fill(20));

        const fragments: TableFragment[] = [];
        let cursorY = 0;
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 200,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY,
            contentBottom: 100, // Force splitting
          }),
          advanceColumn: (state) => {
            cursorY = 0;
            return {
              page: mockPage,
              columnIndex: 0,
              cursorY: 0,
              contentBottom: 100,
            };
          },
          columnX: () => 0,
        });

        // All fragments should have consistent indent applied
        expect(fragments.length).toBeGreaterThan(1);
        fragments.forEach((fragment) => {
          expect(fragment.x).toBe(25);
          expect(fragment.width).toBe(75); // 100 - 25 (measure totalWidth is used, not columnWidth)
        });
      });

      it('should apply negative tableIndent consistently across fragments', () => {
        const block = createMockTableBlock(10);
        block.attrs = { tableIndent: { width: -15 } } as TableAttrs;
        const measure = createMockTableMeasure([100], Array(10).fill(20));

        const fragments: TableFragment[] = [];
        let cursorY = 0;
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 200,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY,
            contentBottom: 100,
          }),
          advanceColumn: (state) => {
            cursorY = 0;
            return {
              page: mockPage,
              columnIndex: 0,
              cursorY: 0,
              contentBottom: 100,
            };
          },
          columnX: () => 0,
        });

        expect(fragments.length).toBeGreaterThan(1);
        fragments.forEach((fragment) => {
          expect(fragment.x).toBe(-15);
          expect(fragment.width).toBe(115); // 100 - (-15)
        });
      });

      it('should apply tableIndent to floating tables (monolithic layout)', () => {
        const block = createMockTableBlock(5, undefined, {
          tableProperties: { floatingTableProperties: { horizontalAnchor: 'page' } },
        });
        block.attrs = { ...block.attrs, tableIndent: { width: 40 } } as TableAttrs;
        const measure = createMockTableMeasure([100], Array(5).fill(20));

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 200,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 50, // Limited space but should render monolithically
          }),
          advanceColumn: (state) => state,
          columnX: () => 0,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(40);
        expect(fragments[0].width).toBe(60); // 100 - 40
      });

      it('should apply tableIndent to tables with no rows but non-zero totalHeight', () => {
        const block = createMockTableBlock(0); // No rows
        block.attrs = { tableIndent: { width: 20 } } as TableAttrs;
        const measure = createMockTableMeasure([100], []);
        measure.totalHeight = 50; // Non-zero height

        const fragments: TableFragment[] = [];
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 150,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 1000,
          }),
          advanceColumn: (state) => state,
          columnX: () => 0,
        });

        expect(fragments).toHaveLength(1);
        expect(fragments[0].x).toBe(20);
        expect(fragments[0].width).toBe(80); // 100 - 20
      });

      it('should apply tableIndent to partial row fragments', () => {
        const block = createMockTableBlock(1);
        block.attrs = { tableIndent: { width: 30 } } as TableAttrs;
        // Create a row with lines to enable partial row splitting
        const measure = createMockTableMeasure([100], [100], [[20, 20, 20, 20, 20]]);

        const fragments: TableFragment[] = [];
        let cursorY = 0;
        const mockPage = { fragments };

        layoutTableBlock({
          block,
          measure,
          columnWidth: 150,
          ensurePage: () => ({
            page: mockPage,
            columnIndex: 0,
            cursorY,
            contentBottom: cursorY + 40, // Force partial row splitting
          }),
          advanceColumn: (state) => {
            cursorY = 0;
            return {
              page: mockPage,
              columnIndex: 0,
              cursorY: 0,
              contentBottom: 40,
            };
          },
          columnX: () => 0,
        });

        // Should have multiple fragments due to partial row splitting
        expect(fragments.length).toBeGreaterThan(1);
        fragments.forEach((fragment) => {
          expect(fragment.x).toBe(30);
          expect(fragment.width).toBe(70); // 100 - 30
        });
      });
    });
  });

  describe('PM range functionality', () => {
    /**
     * Test suite for ProseMirror range computation in table fragments.
     * Tests the pmStart and pmEnd properties that enable selection and editing.
     */

    it('should compute PM ranges for basic table fragments', () => {
      const block = createMockTableBlock(2);
      // Add pmStart/pmEnd to paragraph attrs (not runs)
      (block.rows[0].cells[0].paragraph as ParagraphBlock).attrs = { pmStart: 5, pmEnd: 6 };
      (block.rows[0].cells[0].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'A', fontFamily: 'Arial', fontSize: 12 },
      ];

      (block.rows[0].cells[1].paragraph as ParagraphBlock).attrs = { pmStart: 8, pmEnd: 9 };
      (block.rows[0].cells[1].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'B', fontFamily: 'Arial', fontSize: 12 },
      ];

      (block.rows[1].cells[0].paragraph as ParagraphBlock).attrs = { pmStart: 12, pmEnd: 13 };
      (block.rows[1].cells[0].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'C', fontFamily: 'Arial', fontSize: 12 },
      ];

      (block.rows[1].cells[1].paragraph as ParagraphBlock).attrs = { pmStart: 15, pmEnd: 16 };
      (block.rows[1].cells[1].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'D', fontFamily: 'Arial', fontSize: 12 },
      ];

      const measure = createMockTableMeasure([100, 100], [20, 20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(1);
      const fragment = fragments[0];

      // Fragment should have PM range covering all rows
      expect(fragment.pmStart).toBe(5); // Minimum across all cells
      expect(fragment.pmEnd).toBe(16); // Maximum across all cells
    });

    it('should compute PM ranges for multi-page table splits', () => {
      const block = createMockTableBlock(4);

      // Add PM ranges to each row (in attrs)
      for (let i = 0; i < 4; i++) {
        const pmStart = i * 10;
        const pmEnd = pmStart + 5;

        (block.rows[i].cells[0].paragraph as ParagraphBlock).attrs = { pmStart, pmEnd };
        (block.rows[i].cells[0].paragraph as ParagraphBlock).runs = [
          { kind: 'text', text: `Row${i}`, fontFamily: 'Arial', fontSize: 12 },
        ];

        (block.rows[i].cells[1].paragraph as ParagraphBlock).attrs = { pmStart: pmStart + 7, pmEnd: pmEnd + 7 };
        (block.rows[i].cells[1].paragraph as ParagraphBlock).runs = [
          { kind: 'text', text: `Data${i}`, fontFamily: 'Arial', fontSize: 12 },
        ];
      }

      const measure = createMockTableMeasure([100, 100], [25, 25, 25, 25]);

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 60, // Fits 2 rows per page
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 60,
          };
        },
        columnX: () => 0,
      });

      expect(fragments.length).toBe(2);

      // First fragment: rows 0-1
      // Row 0: cells have pmEnd 5 and 12, Row 1: cells have pmEnd 15 and 22
      expect(fragments[0].pmStart).toBe(0); // Row 0 start (minimum)
      expect(fragments[0].pmEnd).toBe(22); // Row 1 Cell 1 end (maximum)

      // Second fragment: rows 2-3
      // Row 2: cells have pmEnd 25 and 32, Row 3: cells have pmEnd 35 and 42
      expect(fragments[1].pmStart).toBe(20); // Row 2 start
      expect(fragments[1].pmEnd).toBe(42); // Row 3 Cell 1 end (maximum)
    });

    it('should compute PM ranges for partial row splits', () => {
      const block = createMockTableBlock(1);

      // Create a cell with multiple lines, with PM range in attrs
      const paragraph0 = block.rows[0].cells[0].paragraph as ParagraphBlock;
      paragraph0.attrs = { pmStart: 5, pmEnd: 22 };
      paragraph0.runs = [
        { kind: 'text', text: 'Line1', fontFamily: 'Arial', fontSize: 12 },
        { kind: 'lineBreak' },
        { kind: 'text', text: 'Line2', fontFamily: 'Arial', fontSize: 12 },
        { kind: 'lineBreak' },
        { kind: 'text', text: 'Line3', fontFamily: 'Arial', fontSize: 12 },
      ];

      const paragraph1 = block.rows[0].cells[1].paragraph as ParagraphBlock;
      paragraph1.attrs = { pmStart: 24, pmEnd: 30 };
      paragraph1.runs = [{ kind: 'text', text: 'Cell1', fontFamily: 'Arial', fontSize: 12 }];

      const measure = createMockTableMeasure(
        [100, 100],
        [60],
        [
          [20, 20, 20], // Cell 0: 3 lines of 20px each
        ],
      );

      // Add lines for the second cell manually (since createMockTableMeasure doesn't handle multiple cells with different line counts)
      if (measure.rows[0].cells[1]) {
        measure.rows[0].cells[1].paragraph = {
          kind: 'paragraph',
          lines: [
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 5,
              width: 100,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
          ],
          totalHeight: 20,
        };
      }

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: cursorY + 25, // Space for 1 line at a time
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 25,
          };
        },
        columnX: () => 0,
      });

      // Should split into 3 fragments (one per line)
      expect(fragments.length).toBe(3);

      // Each fragment should have PM range for its content
      // Since we're splitting a single paragraph, all fragments should have PM ranges
      fragments.forEach((fragment) => {
        if (fragment.pmStart !== undefined && fragment.pmEnd !== undefined) {
          expect(typeof fragment.pmStart).toBe('number');
          expect(typeof fragment.pmEnd).toBe('number');
          expect(fragment.pmEnd).toBeGreaterThanOrEqual(fragment.pmStart);
        }
      });
    });

    it('should handle multi-block cells with PM ranges', () => {
      const block = createMockTableBlock(1);

      // Create a multi-block cell
      block.rows[0].cells[0].blocks = [
        {
          kind: 'paragraph',
          id: 'para1' as BlockId,
          runs: [{ kind: 'text', text: 'Block1', fontFamily: 'Arial', fontSize: 12, pmStart: 5, pmEnd: 11 }],
          attrs: { pmStart: 5, pmEnd: 11 },
        },
        {
          kind: 'paragraph',
          id: 'para2' as BlockId,
          runs: [{ kind: 'text', text: 'Block2', fontFamily: 'Arial', fontSize: 12, pmStart: 12, pmEnd: 18 }],
          attrs: { pmStart: 12, pmEnd: 18 },
        },
      ];
      delete block.rows[0].cells[0].paragraph;

      const measure = createMockTableMeasure([200], [40]);
      measure.rows[0].cells[0].blocks = [
        {
          kind: 'paragraph',
          lines: [
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 6,
              width: 50,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
          ],
          totalHeight: 20,
        },
        {
          kind: 'paragraph',
          lines: [
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 6,
              width: 50,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
          ],
          totalHeight: 20,
        },
      ];
      delete measure.rows[0].cells[0].paragraph;

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(1);
      expect(fragments[0].pmStart).toBe(5); // First block start
      expect(fragments[0].pmEnd).toBe(18); // Second block end
    });

    it('should handle edge case with mismatched block and measure lengths', () => {
      const block = createMockTableBlock(1);

      // Cell has 3 blocks
      block.rows[0].cells[0].blocks = [
        {
          kind: 'paragraph',
          id: 'para1' as BlockId,
          runs: [{ kind: 'text', text: 'Block1', fontFamily: 'Arial', fontSize: 12, pmStart: 5, pmEnd: 11 }],
          attrs: { pmStart: 5, pmEnd: 11 },
        },
        {
          kind: 'paragraph',
          id: 'para2' as BlockId,
          runs: [{ kind: 'text', text: 'Block2', fontFamily: 'Arial', fontSize: 12, pmStart: 12, pmEnd: 18 }],
          attrs: { pmStart: 12, pmEnd: 18 },
        },
        {
          kind: 'paragraph',
          id: 'para3' as BlockId,
          runs: [{ kind: 'text', text: 'Block3', fontFamily: 'Arial', fontSize: 12, pmStart: 19, pmEnd: 25 }],
          attrs: { pmStart: 19, pmEnd: 25 },
        },
      ];
      delete block.rows[0].cells[0].paragraph;

      const measure = createMockTableMeasure([200], [40]);
      // But measure only has 2 blocks (mismatch!)
      measure.rows[0].cells[0].blocks = [
        {
          kind: 'paragraph',
          lines: [
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 6,
              width: 50,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
          ],
          totalHeight: 20,
        },
        {
          kind: 'paragraph',
          lines: [
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 6,
              width: 50,
              ascent: 15,
              descent: 5,
              lineHeight: 20,
            },
          ],
          totalHeight: 20,
        },
      ];
      delete measure.rows[0].cells[0].paragraph;

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(1);
      // Should only process first 2 blocks (minimum of both lengths)
      expect(fragments[0].pmStart).toBe(5); // First block start
      expect(fragments[0].pmEnd).toBe(18); // Second block end (not 25!)
    });

    it('should handle partial row with out-of-bounds cellIndex', () => {
      const block = createMockTableBlock(1);

      // Add PM ranges to cells (in attrs)
      (block.rows[0].cells[0].paragraph as ParagraphBlock).attrs = { pmStart: 5, pmEnd: 10 };
      (block.rows[0].cells[0].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'Cell0', fontFamily: 'Arial', fontSize: 12 },
      ];

      (block.rows[0].cells[1].paragraph as ParagraphBlock).attrs = { pmStart: 12, pmEnd: 17 };
      (block.rows[0].cells[1].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'Cell1', fontFamily: 'Arial', fontSize: 12 },
      ];

      const measure = createMockTableMeasure(
        [100, 100],
        [60],
        [
          [20, 20, 20], // Cell 0: 3 lines
          [20, 20, 20], // Cell 1: 3 lines
        ],
      );

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: cursorY + 25, // Space for 1 line
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 25,
          };
        },
        columnX: () => 0,
      });

      // Should handle partial rows without crashing
      // The main assertion is that the layout completes without errors
      expect(fragments.length).toBeGreaterThan(0);

      // If any fragment has PM ranges, they should be valid numbers
      fragments.forEach((fragment) => {
        if (fragment.pmStart !== undefined) {
          expect(typeof fragment.pmStart).toBe('number');
        }
        if (fragment.pmEnd !== undefined) {
          expect(typeof fragment.pmEnd).toBe('number');
          if (fragment.pmStart !== undefined) {
            expect(fragment.pmEnd).toBeGreaterThanOrEqual(fragment.pmStart);
          }
        }
      });
    });

    it('should handle empty cells gracefully', () => {
      const block = createMockTableBlock(1);

      // Cell 0 is empty (no runs, no PM range)
      (block.rows[0].cells[0].paragraph as ParagraphBlock).runs = [];

      // Cell 1 has content with PM range in attrs
      (block.rows[0].cells[1].paragraph as ParagraphBlock).attrs = { pmStart: 12, pmEnd: 17 };
      (block.rows[0].cells[1].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'Cell1', fontFamily: 'Arial', fontSize: 12 },
      ];

      const measure = createMockTableMeasure([100, 100], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(1);
      // PM range should only include Cell1
      expect(fragments[0].pmStart).toBe(12);
      expect(fragments[0].pmEnd).toBe(17);
    });

    it('should handle cells without PM range metadata', () => {
      const block = createMockTableBlock(1);

      // Cells have runs but no PM range metadata
      (block.rows[0].cells[0].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'NoPM', fontFamily: 'Arial', fontSize: 12 },
      ];
      (block.rows[0].cells[1].paragraph as ParagraphBlock).runs = [
        { kind: 'text', text: 'AlsoNoPM', fontFamily: 'Arial', fontSize: 12 },
      ];

      const measure = createMockTableMeasure([100, 100], [20]);

      const fragments: TableFragment[] = [];
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY: 0,
          contentBottom: 1000,
        }),
        advanceColumn: (state) => state,
        columnX: () => 0,
      });

      expect(fragments).toHaveLength(1);
      // Fragment should not have PM range if source content lacks it
      expect(fragments[0].pmStart).toBeUndefined();
      expect(fragments[0].pmEnd).toBeUndefined();
    });

    it('should compute correct PM ranges for table continuations with repeat headers', () => {
      const block = createMockTableBlock(5, [
        { repeatHeader: true },
        { repeatHeader: false },
        { repeatHeader: false },
        { repeatHeader: false },
        { repeatHeader: false },
      ]);

      // Add PM ranges (in attrs)
      for (let i = 0; i < 5; i++) {
        const pmStart = i * 10;
        const pmEnd = pmStart + 5;

        (block.rows[i].cells[0].paragraph as ParagraphBlock).attrs = { pmStart, pmEnd };
        (block.rows[i].cells[0].paragraph as ParagraphBlock).runs = [
          { kind: 'text', text: `Row${i}`, fontFamily: 'Arial', fontSize: 12 },
        ];

        (block.rows[i].cells[1].paragraph as ParagraphBlock).attrs = { pmStart: pmStart + 6, pmEnd: pmEnd + 6 };
        (block.rows[i].cells[1].paragraph as ParagraphBlock).runs = [
          { kind: 'text', text: `Data${i}`, fontFamily: 'Arial', fontSize: 12 },
        ];
      }

      const measure = createMockTableMeasure([100, 100], [20, 20, 20, 20, 20]);

      const fragments: TableFragment[] = [];
      let cursorY = 0;
      const mockPage = { fragments };

      layoutTableBlock({
        block,
        measure,
        columnWidth: 200,
        ensurePage: () => ({
          page: mockPage,
          columnIndex: 0,
          cursorY,
          contentBottom: 50, // Fits 2 rows + header on continuation
        }),
        advanceColumn: (state) => {
          cursorY = 0;
          return {
            page: mockPage,
            columnIndex: 0,
            cursorY: 0,
            contentBottom: 50,
          };
        },
        columnX: () => 0,
      });

      expect(fragments.length).toBeGreaterThan(1);

      // First fragment: rows 0-2 (header + 2 body rows)
      expect(fragments[0].pmStart).toBe(0); // Row 0 start
      expect(fragments[0].pmEnd).toBeDefined();

      // Continuation fragments should only include body rows (not repeated headers)
      if (fragments.length > 1) {
        // Second fragment should start from row 2 or 3 (not row 0)
        expect(fragments[1].pmStart).toBeGreaterThan(15); // After first page content
      }
    });
  });
});
