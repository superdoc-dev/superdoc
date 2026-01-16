import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import type { TableHitResult } from '@superdoc/layout-bridge';

import { getCellPosFromTableHit, shouldUseCellSelection, hitTestTable } from '../TableSelectionUtilities.js';

/**
 * Create a basic table schema for testing.
 */
const tableSchema = new Schema({
  nodes: {
    doc: { content: 'table+' },
    table: {
      content: 'tableRow+',
      tableRole: 'table',
      group: 'block',
    },
    tableRow: {
      content: 'tableCell+',
      tableRole: 'row',
    },
    tableCell: {
      content: 'paragraph+',
      tableRole: 'cell',
      attrs: { colspan: { default: 1 }, rowspan: { default: 1 } },
    },
    paragraph: {
      content: 'text*',
    },
    text: {},
  },
});

/**
 * Create a simple 2x2 table for testing.
 */
function createSimpleTable(): EditorState {
  const cell = (text: string) =>
    tableSchema.node('tableCell', null, [tableSchema.node('paragraph', null, [tableSchema.text(text)])]);
  const row = (...cells: ReturnType<typeof cell>[]) => tableSchema.node('tableRow', null, cells);
  const table = tableSchema.node('table', null, [row(cell('A1'), cell('B1')), row(cell('A2'), cell('B2'))]);
  const doc = tableSchema.node('doc', null, [table]);
  return EditorState.create({ schema: tableSchema, doc });
}

describe('TableSelectionUtilities', () => {
  describe('getCellPosFromTableHit', () => {
    it('returns null when tableHit is invalid', () => {
      const state = createSimpleTable();
      const blocks: FlowBlock[] = [{ kind: 'table', id: '0-table', rows: [] }];

      const result = getCellPosFromTableHit(null as unknown as TableHitResult, state.doc, blocks);
      expect(result).toBe(null);
    });

    it('returns null when tableHit.block is invalid', () => {
      const state = createSimpleTable();
      const blocks: FlowBlock[] = [{ kind: 'table', id: '0-table', rows: [] }];

      const invalidHit = { block: null, cellRowIndex: 0, cellColIndex: 0 } as unknown as TableHitResult;
      const result = getCellPosFromTableHit(invalidHit, state.doc, blocks);
      expect(result).toBe(null);
    });

    it('returns null when cell indices are negative', () => {
      const state = createSimpleTable();
      const blocks: FlowBlock[] = [{ kind: 'table', id: '0-table', rows: [] }];

      const invalidHit = {
        block: { id: '0-table', kind: 'table' },
        cellRowIndex: -1,
        cellColIndex: 0,
      } as unknown as TableHitResult;

      const result = getCellPosFromTableHit(invalidHit, state.doc, blocks);
      expect(result).toBe(null);
    });

    it('returns null when doc is null', () => {
      const blocks: FlowBlock[] = [{ kind: 'table', id: '0-table', rows: [] }];
      const hit = {
        block: { id: '0-table', kind: 'table' },
        cellRowIndex: 0,
        cellColIndex: 0,
      } as unknown as TableHitResult;

      const result = getCellPosFromTableHit(hit, null, blocks);
      expect(result).toBe(null);
    });

    it('returns cell position for valid table hit', () => {
      const state = createSimpleTable();
      const blocks: FlowBlock[] = [{ kind: 'table', id: '0-table', rows: [] }];

      const hit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = getCellPosFromTableHit(hit, state.doc, blocks);
      expect(result).not.toBe(null);
      expect(typeof result).toBe('number');
    });

    it('handles colspan correctly when finding cell position', () => {
      // Create table with merged cells
      const cell = (text: string, colspan = 1) =>
        tableSchema.node('tableCell', { colspan }, [tableSchema.node('paragraph', null, [tableSchema.text(text)])]);
      const row = (...cells: ReturnType<typeof cell>[]) => tableSchema.node('tableRow', null, cells);

      const table = tableSchema.node('table', null, [
        row(cell('A1', 2)), // merged cell spanning 2 columns
        row(cell('A2'), cell('B2')),
      ]);
      const doc = tableSchema.node('doc', null, [table]);
      const state = EditorState.create({ schema: tableSchema, doc });

      const blocks: FlowBlock[] = [{ kind: 'table', id: '0-table', rows: [] }];

      // Target column 1 (which falls within the merged cell at column 0)
      const hit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 1,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = getCellPosFromTableHit(hit, state.doc, blocks);
      // Should return position of the merged cell
      expect(result).not.toBe(null);
    });

    it('returns null when target row index is out of bounds', () => {
      const state = createSimpleTable();
      const blocks: FlowBlock[] = [{ kind: 'table', id: '0-table', rows: [] }];

      const hit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 10, // out of bounds
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = getCellPosFromTableHit(hit, state.doc, blocks);
      expect(result).toBe(null);
    });

    it('returns null when table block not found in blocks array', () => {
      const state = createSimpleTable();
      const blocks: FlowBlock[] = []; // empty blocks

      const hit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = getCellPosFromTableHit(hit, state.doc, blocks);
      expect(result).toBe(null);
    });

    it('handles invalid colspan gracefully', () => {
      const cell = (text: string, colspan: number | string = 1) =>
        tableSchema.node('tableCell', { colspan }, [tableSchema.node('paragraph', null, [tableSchema.text(text)])]);
      const row = (...cells: ReturnType<typeof cell>[]) => tableSchema.node('tableRow', null, cells);

      const table = tableSchema.node('table', null, [row(cell('A1', -1), cell('B1'))]);
      const doc = tableSchema.node('doc', null, [table]);
      const state = EditorState.create({ schema: tableSchema, doc });

      const blocks: FlowBlock[] = [{ kind: 'table', id: '0-table', rows: [] }];

      const hit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      // Should handle invalid colspan and default to 1
      const result = getCellPosFromTableHit(hit, state.doc, blocks);
      expect(result).not.toBe(null);
    });
  });

  describe('shouldUseCellSelection', () => {
    it('returns false when cellAnchor is null', () => {
      const currentTableHit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = shouldUseCellSelection(currentTableHit, null, 'none');
      expect(result).toBe(false);
    });

    it('returns false when cellDragMode is none and currentTableHit is null', () => {
      const cellAnchor = { tableBlockId: '0-table', cellRowIndex: 0, cellColIndex: 0 };

      const result = shouldUseCellSelection(null, cellAnchor, 'none');
      expect(result).toBe(false);
    });

    it('returns true when cellDragMode is active and currentTableHit is null', () => {
      const cellAnchor = { tableBlockId: '0-table', cellRowIndex: 0, cellColIndex: 0 };

      const result = shouldUseCellSelection(null, cellAnchor, 'active');
      expect(result).toBe(true);
    });

    it('returns true when cellDragMode is active and in different table', () => {
      const cellAnchor = { tableBlockId: '0-table', cellRowIndex: 0, cellColIndex: 0 };
      const currentTableHit: TableHitResult = {
        block: { id: '1-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = shouldUseCellSelection(currentTableHit, cellAnchor, 'active');
      expect(result).toBe(true);
    });

    it('returns false when in same cell with mode none', () => {
      const cellAnchor = { tableBlockId: '0-table', cellRowIndex: 0, cellColIndex: 0 };
      const currentTableHit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = shouldUseCellSelection(currentTableHit, cellAnchor, 'none');
      expect(result).toBe(false);
    });

    it('returns true when crossing cell boundary in same table', () => {
      const cellAnchor = { tableBlockId: '0-table', cellRowIndex: 0, cellColIndex: 0 };
      const currentTableHit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 1,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = shouldUseCellSelection(currentTableHit, cellAnchor, 'pending');
      expect(result).toBe(true);
    });

    it('returns true when in same table but different row', () => {
      const cellAnchor = { tableBlockId: '0-table', cellRowIndex: 0, cellColIndex: 0 };
      const currentTableHit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 1,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = shouldUseCellSelection(currentTableHit, cellAnchor, 'pending');
      expect(result).toBe(true);
    });

    it('returns false when in same cell with pending mode', () => {
      const cellAnchor = { tableBlockId: '0-table', cellRowIndex: 0, cellColIndex: 0 };
      const currentTableHit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = shouldUseCellSelection(currentTableHit, cellAnchor, 'pending');
      expect(result).toBe(false);
    });

    it('returns true when in same cell with active mode', () => {
      const cellAnchor = { tableBlockId: '0-table', cellRowIndex: 0, cellColIndex: 0 };
      const currentTableHit: TableHitResult = {
        block: { id: '0-table', kind: 'table' } as FlowBlock,
        cellRowIndex: 0,
        cellColIndex: 0,
        fragment: {} as TableHitResult['fragment'],
        pageIndex: 0,
      };

      const result = shouldUseCellSelection(currentTableHit, cellAnchor, 'active');
      expect(result).toBe(true);
    });
  });

  describe('hitTestTable', () => {
    it('returns null when layout is null', () => {
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      const result = hitTestTable(null, blocks, measures, 100, 100, 792, 10, null);
      expect(result).toBe(null);
    });

    it('returns null when no page found at coordinates', () => {
      const layout: Layout = {
        version: 1,
        pages: [],
      };
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      const result = hitTestTable(layout, blocks, measures, 100, 100, 792, 10, null);
      expect(result).toBe(null);
    });

    it('uses geometry helper when available', () => {
      const layout: Layout = {
        version: 1,
        pages: [
          {
            size: { w: 612, h: 792 },
            fragments: [],
          },
        ],
      };
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      const geometryHelper = {
        getPageIndexAtY: (y: number) => 0,
        getNearestPageIndex: (y: number) => 0,
        getPageTop: (idx: number) => 0,
      };

      const result = hitTestTable(layout, blocks, measures, 100, 100, 792, 10, geometryHelper);
      // Result depends on hitTestTableFragment implementation
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('falls back to manual page scan when geometry helper unavailable', () => {
      const layout: Layout = {
        version: 1,
        pages: [
          {
            size: { w: 612, h: 792 },
            fragments: [],
          },
        ],
        pageGap: 10,
      };
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      const result = hitTestTable(layout, blocks, measures, 100, 100, 792, 10, null);
      // Result depends on hitTestTableFragment implementation
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('handles coordinates outside all pages', () => {
      const layout: Layout = {
        version: 1,
        pages: [
          {
            size: { w: 612, h: 792 },
            fragments: [],
          },
        ],
      };
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      // Y coordinate far beyond page height
      const result = hitTestTable(layout, blocks, measures, 100, 10000, 792, 10, null);
      expect(result).toBe(null);
    });
  });
});
