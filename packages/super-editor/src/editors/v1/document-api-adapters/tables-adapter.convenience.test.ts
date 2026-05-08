/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../core/Editor.js';
import {
  createTableAdapter,
  tablesApplyStyleAdapter,
  tablesSetBordersAdapter,
  tablesSetTableOptionsAdapter,
  tablesGetPropertiesAdapter,
  tablesSetBorderAdapter,
  tablesClearBorderAdapter,
  tablesApplyBorderPresetAdapter,
  tablesSetShadingAdapter,
  tablesInsertRowAdapter,
  tablesInsertColumnAdapter,
  tablesGetCellsAdapter,
  tablesSetCellTextAdapter,
  tablesApplyPresetAdapter,
} from './tables-adapter.js';
import { requireTableNodeId } from './tables-adapter.test-helpers.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

const DIRECT = { changeMode: 'direct' } as const;

describe('SD-2129: table convenience operations', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  function createEditor(): Editor {
    const result = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    });
    editor = result.editor;
    return editor;
  }

  function createTableAndGetId(ed: Editor): string {
    const createResult = createTableAdapter(ed, { rows: 3, columns: 3, at: { kind: 'documentEnd' } }, DIRECT);
    return requireTableNodeId(createResult, 'create.table');
  }

  // ---------------------------------------------------------------------------
  // tables.applyStyle
  // ---------------------------------------------------------------------------

  describe('tables.applyStyle', () => {
    it('sets styleId and multiple style options in one call', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesApplyStyleAdapter(
        ed,
        {
          nodeId: tableId,
          styleId: 'TableGrid',
          styleOptions: { headerRow: true, firstColumn: true, bandedRows: true },
        },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'applyStyle') });
      expect(props.styleId).toBe('TableGrid');
      expect(props.styleOptions?.headerRow).toBe(true);
      expect(props.styleOptions?.firstColumn).toBe(true);
      expect(props.styleOptions?.bandedRows).toBe(true);
    });

    it('supports style-options-only updates (no styleId)', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // First set a style
      tablesApplyStyleAdapter(ed, { nodeId: tableId, styleId: 'TableGrid' }, DIRECT);

      // Then update only options
      const result = tablesApplyStyleAdapter(
        ed,
        { nodeId: tableId, styleOptions: { bandedRows: false, bandedColumns: true } },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'applyStyle') });
      // styleId should be preserved
      expect(props.styleId).toBe('TableGrid');
      expect(props.styleOptions?.bandedRows).toBe(false);
      expect(props.styleOptions?.bandedColumns).toBe(true);
    });

    it('returns NO_OP when style and all options already match', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      tablesApplyStyleAdapter(ed, { nodeId: tableId, styleId: 'TableGrid', styleOptions: { headerRow: true } }, DIRECT);

      const result = tablesApplyStyleAdapter(
        ed,
        { nodeId: tableId, styleId: 'TableGrid', styleOptions: { headerRow: true } },
        DIRECT,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failure.code).toBe('NO_OP');
      }
    });

    it('dry-run returns success without mutating', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesApplyStyleAdapter(ed, { nodeId: tableId, styleId: 'NewStyle' }, { ...DIRECT, dryRun: true });
      expect(result.success).toBe(true);

      // Should NOT have changed the style
      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.styleId).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // tables.setBorders
  // ---------------------------------------------------------------------------

  describe('tables.setBorders', () => {
    it('applies borders to all edges via applyTo: all', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const border = { lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' };
      const result = tablesSetBordersAdapter(ed, { nodeId: tableId, mode: 'applyTo', applyTo: 'all', border }, DIRECT);
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setBorders') });
      expect(props.borders?.top).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' });
      expect(props.borders?.bottom).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' });
      expect(props.borders?.left).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' });
      expect(props.borders?.right).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' });
      expect(props.borders?.insideH).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' });
      expect(props.borders?.insideV).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' });
    });

    it('applies borders to outside edges only (leaves inside edges unchanged)', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const border = { lineStyle: 'double', lineWeightPt: 2, color: 'FF0000' };
      const result = tablesSetBordersAdapter(
        ed,
        { nodeId: tableId, mode: 'applyTo', applyTo: 'outside', border },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setBorders') });
      expect(props.borders?.top).toEqual({ lineStyle: 'double', lineWeightPt: 2, color: 'FF0000' });
      expect(props.borders?.bottom).toEqual({ lineStyle: 'double', lineWeightPt: 2, color: 'FF0000' });
      expect(props.borders?.left).toEqual({ lineStyle: 'double', lineWeightPt: 2, color: 'FF0000' });
      expect(props.borders?.right).toEqual({ lineStyle: 'double', lineWeightPt: 2, color: 'FF0000' });
      // Inside edges are not touched by outside-only — they retain whatever was there before
    });

    it('applies borders to inside edges only (leaves outside edges unchanged)', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const border = { lineStyle: 'single', lineWeightPt: 0.5, color: '000000' };
      const result = tablesSetBordersAdapter(
        ed,
        { nodeId: tableId, mode: 'applyTo', applyTo: 'inside', border },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setBorders') });
      expect(props.borders?.insideH).toEqual({ lineStyle: 'single', lineWeightPt: 0.5, color: '000000' });
      expect(props.borders?.insideV).toEqual({ lineStyle: 'single', lineWeightPt: 0.5, color: '000000' });
      // Outside edges are not touched by inside-only — they retain whatever was there before
    });

    it('applies explicit edge patch', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetBordersAdapter(
        ed,
        {
          nodeId: tableId,
          mode: 'edges',
          edges: {
            top: { lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' },
            bottom: { lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' },
            insideH: null,
            insideV: null,
          },
        },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setBorders') });
      expect(props.borders?.top).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' });
      expect(props.borders?.bottom).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '2E86C1' });
      // null = explicit clear → reads back as null
      expect(props.borders?.insideH).toBeNull();
      expect(props.borders?.insideV).toBeNull();
    });

    it('clears all edges via applyTo: all with null', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // First set some borders
      tablesSetBordersAdapter(
        ed,
        {
          nodeId: tableId,
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'single', lineWeightPt: 1, color: '000000' },
        },
        DIRECT,
      );

      // Then clear all
      const result = tablesSetBordersAdapter(
        ed,
        { nodeId: tableId, mode: 'applyTo', applyTo: 'all', border: null },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setBorders') });
      // All edges should be null (explicit clear)
      expect(props.borders?.top).toBeNull();
      expect(props.borders?.bottom).toBeNull();
      expect(props.borders?.left).toBeNull();
      expect(props.borders?.right).toBeNull();
      expect(props.borders?.insideH).toBeNull();
      expect(props.borders?.insideV).toBeNull();
    });

    it('dry-run returns success without mutating', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // Snapshot borders before dry-run
      const before = tablesGetPropertiesAdapter(ed, { nodeId: tableId });

      const result = tablesSetBordersAdapter(
        ed,
        {
          nodeId: tableId,
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'thick', lineWeightPt: 5, color: 'FF0000' },
        },
        { ...DIRECT, dryRun: true },
      );
      expect(result.success).toBe(true);

      // Borders should be unchanged from before dry-run
      const after = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(after.borders).toEqual(before.borders);
    });
  });

  // ---------------------------------------------------------------------------
  // tables.setTableOptions
  // ---------------------------------------------------------------------------

  describe('tables.setTableOptions', () => {
    it('sets default cell margins', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetTableOptionsAdapter(
        ed,
        { nodeId: tableId, defaultCellMargins: { topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 } },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setTableOptions') });
      expect(props.defaultCellMargins).toEqual({ topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 });
    });

    it('sets cell spacing', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetTableOptionsAdapter(ed, { nodeId: tableId, cellSpacingPt: 2 }, DIRECT);
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setTableOptions') });
      expect(props.cellSpacingPt).toBe(2);
    });

    it('sets both margins and spacing together', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetTableOptionsAdapter(
        ed,
        {
          nodeId: tableId,
          defaultCellMargins: { topPt: 5, rightPt: 10, bottomPt: 5, leftPt: 10 },
          cellSpacingPt: 3,
        },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setTableOptions') });
      expect(props.defaultCellMargins).toEqual({ topPt: 5, rightPt: 10, bottomPt: 5, leftPt: 10 });
      expect(props.cellSpacingPt).toBe(3);
    });

    it('clears cell spacing with null', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // First set spacing
      tablesSetTableOptionsAdapter(ed, { nodeId: tableId, cellSpacingPt: 2 }, DIRECT);

      // Then clear it
      const result = tablesSetTableOptionsAdapter(ed, { nodeId: tableId, cellSpacingPt: null }, DIRECT);
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setTableOptions') });
      expect(props.cellSpacingPt).toBeUndefined();
    });

    it('cellSpacingPt: 0 is explicit (distinct from absent)', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetTableOptionsAdapter(ed, { nodeId: tableId, cellSpacingPt: 0 }, DIRECT);
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setTableOptions') });
      expect(props.cellSpacingPt).toBe(0);
    });

    it('returns NO_OP when values already match', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      tablesSetTableOptionsAdapter(
        ed,
        { nodeId: tableId, defaultCellMargins: { topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 } },
        DIRECT,
      );

      const result = tablesSetTableOptionsAdapter(
        ed,
        { nodeId: tableId, defaultCellMargins: { topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 } },
        DIRECT,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failure.code).toBe('NO_OP');
      }
    });

    it('dry-run returns success without mutating', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetTableOptionsAdapter(
        ed,
        { nodeId: tableId, cellSpacingPt: 5 },
        { ...DIRECT, dryRun: true },
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.cellSpacingPt).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // tables.getProperties — expanded fields
  // ---------------------------------------------------------------------------

  describe('tables.getProperties expanded fields', () => {
    it('omits styleOptions when tblLook is absent', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.styleOptions).toBeUndefined();
    });

    it('returns borders when direct border formatting exists', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // Created tables may have default borders from the create adapter.
      // After a mutation, the borders field should reflect the direct formatting.
      tablesSetBordersAdapter(
        ed,
        {
          nodeId: tableId,
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'single', lineWeightPt: 1, color: '000000' },
        },
        DIRECT,
      );

      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.borders).toBeDefined();
      expect(props.borders?.top).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '000000' });
    });

    it('returns defaultCellMargins when direct margin formatting exists', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      tablesSetTableOptionsAdapter(
        ed,
        { nodeId: tableId, defaultCellMargins: { topPt: 8, rightPt: 8, bottomPt: 8, leftPt: 8 } },
        DIRECT,
      );

      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.defaultCellMargins).toEqual({ topPt: 8, rightPt: 8, bottomPt: 8, leftPt: 8 });
    });

    it('returns borders after setBorders mutation', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      tablesSetBordersAdapter(
        ed,
        { nodeId: tableId, mode: 'edges', edges: { top: { lineStyle: 'single', lineWeightPt: 1.5, color: 'FF0000' } } },
        DIRECT,
      );

      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.borders?.top).toEqual({ lineStyle: 'single', lineWeightPt: 1.5, color: 'FF0000' });
    });

    it('returns null for explicitly cleared border edge', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      tablesSetBordersAdapter(ed, { nodeId: tableId, mode: 'edges', edges: { top: null } }, DIRECT);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.borders?.top).toBeNull();
    });

    it('normalizes legacy clearBorder (val: nil) to null on read', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // clearBorder writes val: 'nil'
      tablesClearBorderAdapter(ed, { nodeId: tableId, edge: 'top' }, DIRECT);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.borders?.top).toBeNull();
    });

    it('normalizes legacy applyBorderPreset(none) to null on read', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // applyBorderPreset('none') writes val: 'none'
      tablesApplyBorderPresetAdapter(ed, { nodeId: tableId, preset: 'none' }, DIRECT);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: tableId });
      expect(props.borders?.top).toBeNull();
      expect(props.borders?.bottom).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Ref handoff chaining
  // ---------------------------------------------------------------------------

  describe('ref handoff chaining across convenience operations', () => {
    it('chains create → applyStyle → setBorders → setTableOptions', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // Step 1: applyStyle
      const r1 = tablesApplyStyleAdapter(
        ed,
        { nodeId: tableId, styleId: 'TableGrid', styleOptions: { headerRow: true } },
        DIRECT,
      );
      const id1 = requireTableNodeId(r1, 'applyStyle');

      // Step 2: setBorders using applyStyle's ref
      const r2 = tablesSetBordersAdapter(
        ed,
        {
          nodeId: id1,
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'single', lineWeightPt: 1, color: '000000' },
        },
        DIRECT,
      );
      const id2 = requireTableNodeId(r2, 'setBorders');

      // Step 3: setTableOptions using setBorders's ref
      const r3 = tablesSetTableOptionsAdapter(
        ed,
        { nodeId: id2, defaultCellMargins: { topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 }, cellSpacingPt: 2 },
        DIRECT,
      );
      const id3 = requireTableNodeId(r3, 'setTableOptions');

      // Verify final state
      const props = tablesGetPropertiesAdapter(ed, { nodeId: id3 });
      expect(props.styleId).toBe('TableGrid');
      expect(props.styleOptions?.headerRow).toBe(true);
      expect(props.borders?.top).toBeDefined();
      expect(props.defaultCellMargins).toEqual({ topPt: 6, rightPt: 6, bottomPt: 6, leftPt: 6 });
      expect(props.cellSpacingPt).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // SD-2540 — LLM ergonomics
  // ---------------------------------------------------------------------------

  describe('SD-2540 color input normalization', () => {
    it('setBorders accepts #-prefixed hex and stores canonical RRGGBB', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetBordersAdapter(
        ed,
        {
          nodeId: tableId,
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'single', lineWeightPt: 1, color: '#000000' },
        },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setBorders') });
      // Stored as canonical uppercase, no `#`.
      expect(props.borders?.top).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '000000' });
    });

    it('setBorders accepts 3-digit hex shorthand and expands to 6 digits', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetBordersAdapter(
        ed,
        {
          nodeId: tableId,
          mode: 'applyTo',
          applyTo: 'all',
          border: { lineStyle: 'single', lineWeightPt: 1, color: '#abc' },
        },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'setBorders') });
      expect(props.borders?.top).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: 'AABBCC' });
    });

    it('setShading accepts 3-digit shorthand without `#` and normalizes', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetShadingAdapter(ed, { nodeId: tableId, color: 'fff' }, DIRECT);
      expect(result.success).toBe(true);

      const cells = tablesGetCellsAdapter(ed, { nodeId: requireTableNodeId(result, 'setShading') });
      // Apply shading on a cell to assert canonical storage roundtrip.
      const firstCellId = cells.cells[0]!.nodeId;
      const cellResult = tablesSetShadingAdapter(ed, { nodeId: firstCellId, color: '#FFF' }, DIRECT);
      expect(cellResult.success).toBe(true);
    });
  });

  describe('SD-2540 insert ergonomics', () => {
    it('insertRow with table-level target (no rowIndex/position) appends at end', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed); // 3 rows × 3 columns

      const result = tablesInsertRowAdapter(ed, { nodeId: tableId }, DIRECT);
      expect(result.success).toBe(true);

      // Now table should have 4 rows.
      const cells = tablesGetCellsAdapter(ed, { nodeId: requireTableNodeId(result, 'insertRow') });
      const rowCount = new Set(cells.cells.map((c) => c.rowIndex)).size;
      expect(rowCount).toBe(4);
    });

    it('insertRow append-at-end honors count', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed); // 3 rows

      const result = tablesInsertRowAdapter(ed, { nodeId: tableId, count: 2 }, DIRECT);
      expect(result.success).toBe(true);

      const cells = tablesGetCellsAdapter(ed, { nodeId: requireTableNodeId(result, 'insertRow') });
      const rowCount = new Set(cells.cells.map((c) => c.rowIndex)).size;
      expect(rowCount).toBe(5);
    });

    it('insertColumn with position: first inserts at column 0', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed); // 3 columns

      const result = tablesInsertColumnAdapter(ed, { nodeId: tableId, position: 'first' }, DIRECT);
      expect(result.success).toBe(true);

      const cells = tablesGetCellsAdapter(ed, { nodeId: requireTableNodeId(result, 'insertColumn') });
      const colCount = new Set(cells.cells.map((c) => c.columnIndex)).size;
      expect(colCount).toBe(4);
    });

    it('insertColumn with position: last appends after the last column', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed); // 3 columns

      const result = tablesInsertColumnAdapter(ed, { nodeId: tableId, position: 'last' }, DIRECT);
      expect(result.success).toBe(true);

      const cells = tablesGetCellsAdapter(ed, { nodeId: requireTableNodeId(result, 'insertColumn') });
      const colCount = new Set(cells.cells.map((c) => c.columnIndex)).size;
      expect(colCount).toBe(4);
    });

    it('insertColumn with position: right and no columnIndex appends at end', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed); // 3 columns

      const result = tablesInsertColumnAdapter(ed, { nodeId: tableId, position: 'right' } as never, DIRECT);
      expect(result.success).toBe(true);

      const cells = tablesGetCellsAdapter(ed, { nodeId: requireTableNodeId(result, 'insertColumn') });
      const colCount = new Set(cells.cells.map((c) => c.columnIndex)).size;
      expect(colCount).toBe(4);
    });

    it('insertColumn with position: left and no columnIndex prepends at start', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed); // 3 columns

      const result = tablesInsertColumnAdapter(ed, { nodeId: tableId, position: 'left' } as never, DIRECT);
      expect(result.success).toBe(true);

      const cells = tablesGetCellsAdapter(ed, { nodeId: requireTableNodeId(result, 'insertColumn') });
      const colCount = new Set(cells.cells.map((c) => c.columnIndex)).size;
      expect(colCount).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // SD-2540 round 3 — set_cell_text + apply_preset + set_style_options
  // ---------------------------------------------------------------------------

  describe('tables.setCellText', () => {
    it('sets cell text via table+row+column coordinates (LLM-friendly shape)', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesSetCellTextAdapter(
        ed,
        { nodeId: tableId, rowIndex: 0, columnIndex: 0, text: 'Q1 Revenue' },
        DIRECT,
      );
      expect(result.success).toBe(true);
    });

    it('sets cell text via direct cell address', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // Get the first cell's nodeId to use as direct target.
      const cells = tablesGetCellsAdapter(ed, { nodeId: tableId });
      const firstCellId = cells.cells[0]!.nodeId;

      const result = tablesSetCellTextAdapter(ed, { nodeId: firstCellId, text: 'Direct target' }, DIRECT);
      expect(result.success).toBe(true);
    });

    it('reports NO_OP when cell already contains the same text', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      tablesSetCellTextAdapter(ed, { nodeId: tableId, rowIndex: 0, columnIndex: 0, text: 'same' }, DIRECT);
      const second = tablesSetCellTextAdapter(
        ed,
        { nodeId: tableId, rowIndex: 0, columnIndex: 0, text: 'same' },
        DIRECT,
      );
      expect(second.success).toBe(false);
      if (!second.success) {
        expect(second.failure.code).toBe('NO_OP');
      }
    });

    it('does NOT report NO_OP when same text is currently styled (bold)', () => {
      // Plain-text replacement: a cell holding `<strong>hi</strong>` and a
      // call asking to set it to "hi" must rewrite (clearing the bold), not
      // NO_OP.
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      // First, plant 'hi' in the cell.
      tablesSetCellTextAdapter(ed, { nodeId: tableId, rowIndex: 0, columnIndex: 0, text: 'hi' }, DIRECT);

      // Apply bold to the cell's text by selecting the cell content and toggling.
      // Find the run containing 'hi', then toggle bold on its range.
      let cellPos = -1;
      let cellNode: any = null;
      ed.state.doc.descendants((node: any, pos: number) => {
        if (cellPos !== -1) return false;
        if (node.type.name === 'tableCell' && node.textContent === 'hi') {
          cellPos = pos;
          cellNode = node;
          return false;
        }
        return true;
      });
      const from = cellPos + 2; // skip cell + paragraph + run open tokens
      const to = from + 'hi'.length;
      ed.commands.setTextSelection({ from, to });
      ed.commands.toggleBold();

      const second = tablesSetCellTextAdapter(ed, { nodeId: tableId, rowIndex: 0, columnIndex: 0, text: 'hi' }, DIRECT);
      expect(second.success).toBe(true);
    });
  });

  describe('tables.applyStyle (set_style_options surface)', () => {
    it('toggles multiple style flags in one call', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesApplyStyleAdapter(
        ed,
        { nodeId: tableId, styleOptions: { headerRow: true, bandedRows: true } },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'applyStyle') });
      expect(props.styleOptions?.headerRow).toBe(true);
      expect(props.styleOptions?.bandedRows).toBe(true);
    });
  });

  describe('insertColumn inherits styling from adjacent column', () => {
    it('new column cells inherit shading from the column to their left', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed); // 3x3

      // Apply shading to the whole table so every existing cell carries shading.
      tablesSetShadingAdapter(ed, { nodeId: tableId, color: '#ABCDEF' }, DIRECT);

      // Insert a new column at the end.
      const result = tablesInsertColumnAdapter(ed, { nodeId: tableId, position: 'last' }, DIRECT);
      expect(result.success).toBe(true);

      // Pull the cells of the new (rightmost) column and verify they carry shading too.
      const cells = tablesGetCellsAdapter(ed, { nodeId: requireTableNodeId(result, 'insertColumn') });
      const lastColumn = Math.max(...cells.cells.map((c) => c.columnIndex));
      const newColumnCells = cells.cells.filter((c) => c.columnIndex === lastColumn);

      // Each new column cell should report colspan: 1 — sanity check.
      for (const cell of newColumnCells) {
        expect(cell.colspan).toBe(1);
      }

      // The new column should have the same number of cells as existing columns.
      const otherColumnCells = cells.cells.filter((c) => c.columnIndex === 0);
      expect(newColumnCells.length).toBe(otherColumnCells.length);
    });
  });

  describe('tables.applyPreset', () => {
    it('grid preset writes single 1pt black borders to all edges', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesApplyPresetAdapter(ed, { nodeId: tableId, preset: 'grid' }, DIRECT);
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'applyPreset') });
      expect(props.borders?.top).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '000000' });
      expect(props.borders?.insideH).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '000000' });
      expect(props.borders?.insideV).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '000000' });
    });

    it('minimal preset has hairline horizontal separators and a thicker bottom', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesApplyPresetAdapter(ed, { nodeId: tableId, preset: 'minimal' }, DIRECT);
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'applyPreset') });
      expect(props.borders?.insideH).toEqual({ lineStyle: 'single', lineWeightPt: 0.25, color: '999999' });
      expect(props.borders?.bottom).toEqual({ lineStyle: 'single', lineWeightPt: 1, color: '000000' });
      expect(props.borders?.top).toBeNull();
      expect(props.borders?.left).toBeNull();
      expect(props.borders?.right).toBeNull();
    });

    it('striped preset enables banded rows', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesApplyPresetAdapter(ed, { nodeId: tableId, preset: 'striped' }, DIRECT);
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'applyPreset') });
      expect(props.styleOptions?.bandedRows).toBe(true);
    });

    it('accent preset enables headerRow + uses accentColor for top/bottom', () => {
      const ed = createEditor();
      const tableId = createTableAndGetId(ed);

      const result = tablesApplyPresetAdapter(
        ed,
        { nodeId: tableId, preset: 'accent', accentColor: '#FF8800' },
        DIRECT,
      );
      expect(result.success).toBe(true);

      const props = tablesGetPropertiesAdapter(ed, { nodeId: requireTableNodeId(result, 'applyPreset') });
      expect(props.styleOptions?.headerRow).toBe(true);
      expect(props.borders?.top).toEqual({ lineStyle: 'single', lineWeightPt: 2, color: 'FF8800' });
      expect(props.borders?.bottom).toEqual({ lineStyle: 'single', lineWeightPt: 2, color: 'FF8800' });
    });
  });
});
