/**
 * Setter/Getter parity tests for table adapters.
 *
 * Validates that:
 * 1. Setters write the correct nested tableProperties values
 * 2. Setters sync extracted top-level attrs for pm-adapter rendering
 * 3. The getProperties getter reads from tableProperties (not top-level)
 * 4. Set→get round-trips produce correct output
 */
import { describe, it, expect, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  tablesSetLayoutAdapter,
  tablesSetStyleAdapter,
  tablesClearStyleAdapter,
  tablesSetStyleOptionAdapter,
  tablesSetCellSpacingAdapter,
  tablesClearCellSpacingAdapter,
  tablesSetBorderAdapter,
  tablesGetPropertiesAdapter,
} from '../tables-adapter.js';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

function createNode(
  type: string,
  children: ProseMirrorNode[],
  opts: { attrs?: Record<string, unknown>; text?: string; isBlock?: boolean; inlineContent?: boolean } = {},
): ProseMirrorNode {
  const tableRole =
    type === 'table'
      ? 'table'
      : type === 'tableRow'
        ? 'row'
        : type === 'tableCell'
          ? 'cell'
          : type === 'tableHeader'
            ? 'header_cell'
            : undefined;
  const nodeSize =
    opts.text != null
      ? Math.max(1, opts.text.length)
      : children.length === 0
        ? 2
        : 2 + children.reduce((sum, child) => sum + child.nodeSize, 0);
  const node: Record<string, unknown> = {
    type: { name: type, spec: tableRole ? { tableRole } : {} },
    attrs: opts.attrs ?? {},
    content: children,
    childCount: children.length,
    child: (i: number) => children[i],
    nodeSize,
    textContent: opts.text ?? '',
    isBlock: opts.isBlock ?? false,
    inlineContent: opts.inlineContent ?? false,
    forEach: (fn: (node: ProseMirrorNode, offset: number, index: number) => void) => {
      let offset = 0;
      children.forEach((child, index) => {
        fn(child, offset, index);
        offset += (child as any).nodeSize;
      });
    },
    descendants: (
      fn: (node: ProseMirrorNode, pos: number, parent?: ProseMirrorNode, index?: number) => boolean | void,
    ) => {
      const walk = (n: ProseMirrorNode, pos: number, parent?: ProseMirrorNode, index?: number) => {
        if (fn(n, pos, parent, index) === false) return;
        let offset = pos + 1;
        (n as any).content.forEach?.((child: ProseMirrorNode, childIndex: number) => {
          walk(child, offset, n, childIndex);
          offset += (child as any).nodeSize;
        });
      };
      let offset = 1;
      children.forEach((child, childIndex) => {
        walk(child, offset, node as unknown as ProseMirrorNode, childIndex);
        offset += (child as any).nodeSize;
      });
    },
    nodeAt: (pos: number) => {
      if (pos === 0) return node as unknown as ProseMirrorNode;
      let current = 1;
      for (const child of children) {
        if (pos === current) return child;
        current += (child as any).nodeSize;
      }
      return null;
    },
    resolve: (pos: number) => ({
      pos,
      parent: node,
      depth: 1,
      node: () => node,
    }),
    textBetween: () => '',
  };
  if (opts.text != null) {
    node.text = opts.text;
    node.isText = true;
  }
  return node as unknown as ProseMirrorNode;
}

function makeTableEditorWithProps(tableProperties: Record<string, unknown> = {}): {
  editor: Editor;
  getSetNodeMarkupCalls: () => Array<{ pos: number; type: null; attrs: Record<string, unknown> }>;
} {
  const textNode = createNode('text', [], { text: 'Hello' });
  const paragraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p1', paraId: 'p1', paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });
  const cell = createNode('tableCell', [paragraph], {
    attrs: { sdBlockId: 'cell-1', colspan: 1, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });
  const cell2 = createNode(
    'tableCell',
    [
      createNode('paragraph', [createNode('text', [], { text: 'World' })], {
        attrs: { sdBlockId: 'p2', paraId: 'p2', paragraphProperties: {} },
        isBlock: true,
        inlineContent: true,
      }),
    ],
    {
      attrs: { sdBlockId: 'cell-2', colspan: 1, rowspan: 1 },
      isBlock: true,
      inlineContent: false,
    },
  );
  const row = createNode('tableRow', [cell, cell2], {
    attrs: { sdBlockId: 'row-1', rowHeight: null, cantSplit: false, tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });
  const row2 = createNode(
    'tableRow',
    [
      createNode(
        'tableCell',
        [
          createNode('paragraph', [createNode('text', [], { text: 'R2C1' })], {
            attrs: { sdBlockId: 'p3', paraId: 'p3', paragraphProperties: {} },
            isBlock: true,
            inlineContent: true,
          }),
        ],
        { attrs: { sdBlockId: 'cell-3', colspan: 1, rowspan: 1 }, isBlock: true, inlineContent: false },
      ),
      createNode(
        'tableCell',
        [
          createNode('paragraph', [createNode('text', [], { text: 'R2C2' })], {
            attrs: { sdBlockId: 'p4', paraId: 'p4', paragraphProperties: {} },
            isBlock: true,
            inlineContent: true,
          }),
        ],
        { attrs: { sdBlockId: 'cell-4', colspan: 1, rowspan: 1 }, isBlock: true, inlineContent: false },
      ),
    ],
    {
      attrs: { sdBlockId: 'row-2', rowHeight: null, cantSplit: false, tableRowProperties: {} },
      isBlock: true,
      inlineContent: false,
    },
  );
  const table = createNode('table', [row, row2], {
    attrs: {
      sdBlockId: 'table-1',
      tableProperties,
      tableGrid: [5000, 5000],
    },
    isBlock: true,
    inlineContent: false,
  });
  const doc = createNode('doc', [table], { isBlock: false });

  const setNodeMarkupFn = vi.fn().mockReturnThis();
  const dispatch = vi.fn();

  const tr = {
    setNodeMarkup: setNodeMarkupFn,
    setMeta: vi.fn().mockReturnThis(),
    mapping: { maps: [], map: (p: number) => p, slice: () => ({ map: (p: number) => p }) },
    doc: { ...doc, textBetween: vi.fn(() => '') },
  };

  const editor = {
    state: {
      doc: { ...doc, textBetween: vi.fn(() => '') },
      tr,
      schema: { nodes: {}, text: (t: string) => createNode('text', [], { text: t }) },
    },
    dispatch,
    commands: {},
    can: vi.fn(() => ({})),
    schema: { marks: {}, nodes: {} },
    options: {},
  } as unknown as Editor;

  return {
    editor,
    getSetNodeMarkupCalls: () =>
      setNodeMarkupFn.mock.calls.map(([pos, type, attrs]: [number, null, Record<string, unknown>]) => ({
        pos,
        type,
        attrs,
      })),
  };
}

/** Extracts the written attrs from the last setNodeMarkup call. */
function lastWrittenAttrs(calls: Array<{ attrs: Record<string, unknown> }>): Record<string, unknown> {
  return calls[calls.length - 1]?.attrs ?? {};
}

// ---------------------------------------------------------------------------
// Setter → top-level sync parity tests
// ---------------------------------------------------------------------------

describe('table setter/getter parity', () => {
  describe('setLayout → top-level sync', () => {
    it('syncs justification to top-level when alignment is set', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', alignment: 'center' });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      expect((attrs.tableProperties as any).justification).toBe('center');
      expect(attrs.justification).toBe('center');
    });

    it('syncs tableWidth to top-level when preferredWidth is set', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', preferredWidth: 7200 });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      const tp = attrs.tableProperties as any;
      expect(tp.tableWidth).toEqual({ value: 7200, type: 'dxa' });
      // Top-level should be converted to pixels
      expect(attrs.tableWidth).toBeDefined();
      expect((attrs.tableWidth as any).type).toBe('dxa');
    });

    it('converts leftIndentPt to twips (× 20) in nested props', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', leftIndentPt: 36 });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      const tp = attrs.tableProperties as any;
      expect(tp.tableIndent.value).toBe(720); // 36 × 20
      expect(tp.tableIndent.type).toBe('dxa');
      // Top-level should be pixel-converted
      expect(attrs.tableIndent).toBeDefined();
    });

    it('syncs tableLayout to top-level', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', autoFitMode: 'fixedWidth' });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      expect((attrs.tableProperties as any).tableLayout).toBe('fixed');
      expect(attrs.tableLayout).toBe('fixed');
    });
  });

  describe('fitWindow write path', () => {
    it('sets tableLayout=autofit and tableWidth.type=pct for fitWindow', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', autoFitMode: 'fitWindow' });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      const tp = attrs.tableProperties as any;
      expect(tp.tableLayout).toBe('autofit');
      expect(tp.tableWidth.type).toBe('pct');
      expect(tp.tableWidth.value).toBe(5000); // default 100%
    });

    it('ignores preferredWidth input for fitWindow (always 100%)', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', autoFitMode: 'fitWindow', preferredWidth: 2500 });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      const tp = attrs.tableProperties as any;
      expect(tp.tableWidth).toEqual({ value: 5000, type: 'pct' });
    });

    it('sets tableLayout=autofit without pct for fitContents', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', autoFitMode: 'fitContents' });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      const tp = attrs.tableProperties as any;
      expect(tp.tableLayout).toBe('autofit');
      expect(tp.tableWidth).toBeUndefined(); // no width override
    });
  });

  describe('direction three-state', () => {
    it('writes rightToLeft=true for rtl', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', tableDirection: 'rtl' });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.rightToLeft).toBe(true);
    });

    it('writes rightToLeft=false for ltr (explicit)', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetLayoutAdapter(editor, { nodeId: 'table-1', tableDirection: 'ltr' });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.rightToLeft).toBe(false);
    });
  });

  describe('setStyle → top-level sync', () => {
    it('syncs tableStyleId to top-level', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetStyleAdapter(editor, { nodeId: 'table-1', styleId: 'TableGrid' });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      expect((attrs.tableProperties as any).tableStyleId).toBe('TableGrid');
      expect(attrs.tableStyleId).toBe('TableGrid');
    });
  });

  describe('clearStyle → top-level sync', () => {
    it('clears tableStyleId from both nested and top-level', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps({ tableStyleId: 'OldStyle' });
      tablesClearStyleAdapter(editor, { nodeId: 'table-1' });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      expect((attrs.tableProperties as any).tableStyleId).toBeUndefined();
      expect(attrs.tableStyleId).toBeNull();
    });
  });

  describe('setStyleOption → writes tblLook (not tableLook)', () => {
    it('writes to tblLook only', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'headerRow', enabled: true });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      const tp = attrs.tableProperties as any;
      expect(tp.tblLook.firstRow).toBe(true);
      expect(tp.tableLook).toBeUndefined();
    });

    it('inverts bandedRows to noHBand=false', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'bandedRows', enabled: true });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.tblLook.noHBand).toBe(false);
    });

    it('writes lastRow flag via lastRow input', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'lastRow', enabled: true });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.tblLook.lastRow).toBe(true);
    });

    it('writes lastColumn flag via lastColumn input', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'lastColumn', enabled: true });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.tblLook.lastColumn).toBe(true);
    });

    it('normalizes deprecated totalRow alias to lastRow', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'totalRow', enabled: true });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.tblLook.lastRow).toBe(true);
    });

    it('disables lastRow by writing false', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps({
        tblLook: { firstRow: true, lastRow: true, firstColumn: true, lastColumn: false, noHBand: false, noVBand: true },
      });
      tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'lastRow', enabled: false });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.tblLook.lastRow).toBe(false);
    });

    it('returns NO_OP when tblLook already has the requested value', () => {
      const { editor } = makeTableEditorWithProps({
        tblLook: { firstRow: true, lastRow: true, firstColumn: true, lastColumn: false, noHBand: false, noVBand: true },
      });
      const result = tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'lastRow', enabled: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failure.code).toBe('NO_OP');
      }
    });

    it('does not return NO_OP when tblLook is absent (materializes baseline)', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      const result = tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'lastRow', enabled: true });

      expect(result.success).toBe(true);
      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.tblLook.lastRow).toBe(true);
    });

    it('seeds full Word-default baseline on first materialization', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'lastRow', enabled: true });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      const look = tp.tblLook;
      // Word defaults (0x04A0) plus the requested mutation
      expect(look.firstRow).toBe(true);
      expect(look.lastRow).toBe(true); // mutated
      expect(look.firstColumn).toBe(true);
      expect(look.lastColumn).toBe(false);
      expect(look.noHBand).toBe(false);
      expect(look.noVBand).toBe(true);
    });

    it('deletes stale w:val on mutation', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps({
        tblLook: {
          val: '04A0',
          firstRow: true,
          lastRow: false,
          firstColumn: true,
          lastColumn: false,
          noHBand: false,
          noVBand: true,
        },
      });
      tablesSetStyleOptionAdapter(editor, { nodeId: 'table-1', flag: 'lastRow', enabled: true });

      const tp = lastWrittenAttrs(getSetNodeMarkupCalls()).tableProperties as any;
      expect(tp.tblLook.lastRow).toBe(true);
      expect(tp.tblLook.val).toBeUndefined();
    });
  });

  describe('setCellSpacing → canonical key', () => {
    it('writes tableCellSpacing (not tblCellSpacing)', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      tablesSetCellSpacingAdapter(editor, { nodeId: 'table-1', spacingPt: 5 });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      const tp = attrs.tableProperties as any;
      expect(tp.tableCellSpacing).toEqual({ value: 100, type: 'dxa' }); // 5 × 20
      expect(tp.tblCellSpacing).toBeUndefined();
      // Top-level mirror should be set
      expect(attrs.tableCellSpacing).toBeDefined();
      expect(attrs.borderCollapse).toBe('separate');
    });
  });

  describe('clearCellSpacing → cleans both keys', () => {
    it('deletes tableCellSpacing and tblCellSpacing', () => {
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps({
        tableCellSpacing: { value: 100, type: 'dxa' },
        tblCellSpacing: { w: 100, type: 'dxa' },
      });
      tablesClearCellSpacingAdapter(editor, { nodeId: 'table-1' });

      const attrs = lastWrittenAttrs(getSetNodeMarkupCalls());
      const tp = attrs.tableProperties as any;
      expect(tp.tableCellSpacing).toBeUndefined();
      expect(tp.tblCellSpacing).toBeUndefined();
      // Top-level mirror should be cleared
      expect(attrs.tableCellSpacing).toBeNull();
      expect(attrs.borderCollapse).toBeNull();
    });
  });

  describe('dual-scope sync guard', () => {
    it('does NOT sync table attrs when setBorder targets a cell', () => {
      // Create an editor where cell-1 is resolved as a cell target
      const { editor, getSetNodeMarkupCalls } = makeTableEditorWithProps();
      // setBorder with a cell target should NOT add tableStyleId etc. to cell attrs
      tablesSetBorderAdapter(editor, {
        nodeId: 'cell-1',
        edge: 'top',
        lineStyle: 'single',
        lineWeightPt: 1,
        color: '000000',
      });

      const calls = getSetNodeMarkupCalls();
      if (calls.length > 0) {
        const attrs = lastWrittenAttrs(calls);
        // Should NOT have table-level extracted attrs on a cell node
        expect(attrs.justification).toBeUndefined();
        expect(attrs.tableLayout).toBeUndefined();
        expect(attrs.tableStyleId).toBeUndefined();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// getProperties round-trip tests
// ---------------------------------------------------------------------------

describe('getProperties reads from tableProperties', () => {
  it('returns styleId from nested tableProperties', () => {
    const { editor } = makeTableEditorWithProps({ tableStyleId: 'CustomStyle' });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.styleId).toBe('CustomStyle');
  });

  it('returns alignment mapped from justification', () => {
    const { editor } = makeTableEditorWithProps({ justification: 'end' });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.alignment).toBe('right');
  });

  it('returns direction=rtl for rightToLeft=true', () => {
    const { editor } = makeTableEditorWithProps({ rightToLeft: true });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.direction).toBe('rtl');
  });

  it('returns direction=ltr for rightToLeft=false', () => {
    const { editor } = makeTableEditorWithProps({ rightToLeft: false });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.direction).toBe('ltr');
  });

  it('omits direction when rightToLeft is undefined', () => {
    const { editor } = makeTableEditorWithProps({});
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.direction).toBeUndefined();
  });

  it('returns preferredWidth from nested tableWidth', () => {
    const { editor } = makeTableEditorWithProps({ tableWidth: { value: 7200, type: 'dxa' } });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.preferredWidth).toBe(7200);
  });

  it('returns fixedWidth for tableLayout=fixed', () => {
    const { editor } = makeTableEditorWithProps({ tableLayout: 'fixed' });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.autoFitMode).toBe('fixedWidth');
  });

  it('returns fitWindow for autofit + pct width, without preferredWidth', () => {
    const { editor } = makeTableEditorWithProps({
      tableLayout: 'autofit',
      tableWidth: { value: 5000, type: 'pct' },
    });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.autoFitMode).toBe('fitWindow');
    expect(result.preferredWidth).toBeUndefined();
  });

  it('returns fitContents for autofit + dxa width', () => {
    const { editor } = makeTableEditorWithProps({
      tableLayout: 'autofit',
      tableWidth: { value: 7200, type: 'dxa' },
    });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.autoFitMode).toBe('fitContents');
  });

  it('reads styleOptions from tblLook', () => {
    const { editor } = makeTableEditorWithProps({
      tblLook: { firstRow: true, lastRow: false, noHBand: false, noVBand: true },
    });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.styleOptions).toEqual({
      headerRow: true,
      lastRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
    });
  });

  it('does not include totalRow in styleOptions output', () => {
    const { editor } = makeTableEditorWithProps({
      tblLook: { firstRow: true, lastRow: true, noHBand: false, noVBand: true },
    });
    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });
    expect(result.styleOptions).toHaveProperty('lastRow', true);
    expect(result.styleOptions).not.toHaveProperty('totalRow');
  });
});
