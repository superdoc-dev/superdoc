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
} from './tables-adapter.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

const DIRECT = { changeMode: 'direct' } as const;

function requireTableNodeId(result: { success: boolean; table?: { nodeId?: string } }, label: string): string {
  if (!result.success) {
    throw new Error(`${label} failed: expected success.`);
  }
  const nodeId = (result as { table?: { nodeId?: string } }).table?.nodeId;
  if (!nodeId) {
    throw new Error(`${label}: expected result.table.nodeId to be defined.`);
  }
  return nodeId;
}

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
});
