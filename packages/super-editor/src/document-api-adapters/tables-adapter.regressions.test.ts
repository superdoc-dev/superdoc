import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, vi } from 'vitest';
import { TableMap } from 'prosemirror-tables';
import type { Editor } from '../core/Editor.js';
import {
  tablesClearBorderAdapter,
  tablesClearShadingAdapter,
  tablesDeleteCellAdapter,
  tablesDistributeColumnsAdapter,
  tablesInsertCellAdapter,
  tablesSetBorderAdapter,
  tablesSetShadingAdapter,
  tablesSplitCellAdapter,
  tablesSplitAdapter,
} from './tables-adapter.js';

vi.mock('prosemirror-tables', () => ({
  TableMap: {
    get: vi.fn(() => ({
      width: 2,
      height: 2,
      // Positions of cells within table content tree:
      // Row 0: cell-1 at pos 1, cell-2 at pos 10
      // Row 1: cell-3 at pos 21, cell-4 at pos 29
      map: [1, 10, 21, 29],
      positionAt: vi.fn((row: number, col: number) => [1, 10, 21, 29][row * 2 + col] ?? 1),
      colCount: vi.fn((pos: number) => (pos === 10 || pos === 29 ? 1 : 0)),
    })),
  },
}));

type NodeOptions = {
  attrs?: Record<string, unknown>;
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
};

type TableEditorOptions = {
  firstRowAsHeaders?: boolean;
  firstRowBorders?: Record<string, unknown> | null;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const attrs = options.attrs ?? {};
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? isBlock;
  const isLeaf = options.isLeaf ?? (isInline && !isText && children.length === 0);

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : options.nodeSize != null ? options.nodeSize : isLeaf ? 1 : contentSize + 2;

  const node = {
    type: {
      name: typeName,
      create(newAttrs: Record<string, unknown>) {
        return createNode(typeName, [], { attrs: newAttrs, isBlock, inlineContent });
      },
      createAndFill() {
        return createNode(typeName, [], { attrs: {}, isBlock, inlineContent });
      },
    },
    attrs,
    text: isText ? text : undefined,
    content: { size: contentSize },
    nodeSize,
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    isLeaf,
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
    forEach(fn: (node: ProseMirrorNode, offset: number, index: number) => void) {
      let offset = 0;
      children.forEach((child, index) => {
        fn(child, offset, index);
        offset += child.nodeSize;
      });
    },
    nodeAt(pos: number): ProseMirrorNode | null {
      let offset = 0;
      for (const child of children) {
        if (pos === offset) return child;
        if (pos < offset + child.nodeSize) {
          return (child as unknown as { nodeAt: (p: number) => ProseMirrorNode | null }).nodeAt(pos - offset - 1);
        }
        offset += child.nodeSize;
      }
      return null;
    },
    copy() {
      return node;
    },
    get textContent(): string {
      if (isText) return text;
      return children.map((c) => c.textContent).join('');
    },
    _children: children,
    descendants(callback: (node: ProseMirrorNode, pos: number) => boolean | void) {
      function walk(kids: ProseMirrorNode[], startPos: number) {
        let offset = startPos;
        for (const child of kids) {
          const childStart = offset;
          const result = callback(child, childStart);
          if (result !== false) {
            const innerKids = (child as unknown as { _children?: ProseMirrorNode[] })._children;
            if (innerKids && innerKids.length > 0) {
              walk(innerKids, childStart + 1);
            }
          }
          offset += child.nodeSize;
        }
      }
      walk(children, 0);
    },
  };

  return node as unknown as ProseMirrorNode;
}

function makeTableEditor(options: TableEditorOptions = {}): Editor {
  const firstRowAsHeaders = options.firstRowAsHeaders ?? false;
  const firstRowType = firstRowAsHeaders ? 'tableHeader' : 'tableCell';
  const firstRowAttrs =
    options.firstRowBorders === undefined
      ? {}
      : {
          borders: options.firstRowBorders,
        };
  const paragraph1 = createNode('paragraph', [createNode('text', [], { text: 'Hello' })], {
    attrs: { sdBlockId: 'p1', paraId: 'p1', paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });
  const paragraph2 = createNode('paragraph', [createNode('text', [], { text: 'World' })], {
    attrs: { sdBlockId: 'p2', paraId: 'p2', paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });
  const paragraph3 = createNode('paragraph', [createNode('text', [], { text: 'R2C1' })], {
    attrs: { sdBlockId: 'p3', paraId: 'p3', paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });
  const paragraph4 = createNode('paragraph', [createNode('text', [], { text: 'R2C2' })], {
    attrs: { sdBlockId: 'p4', paraId: 'p4', paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });

  const cell1 = createNode(firstRowType, [paragraph1], {
    attrs: { sdBlockId: 'cell-1', colspan: 1, rowspan: 1, colwidth: [100], ...firstRowAttrs },
    isBlock: true,
    inlineContent: false,
  });
  const cell2 = createNode(firstRowType, [paragraph2], {
    attrs: { sdBlockId: 'cell-2', colspan: 1, rowspan: 1, colwidth: [200], ...firstRowAttrs },
    isBlock: true,
    inlineContent: false,
  });
  const cell3 = createNode('tableCell', [paragraph3], {
    attrs: { sdBlockId: 'cell-3', colspan: 1, rowspan: 1, colwidth: [100] },
    isBlock: true,
    inlineContent: false,
  });
  const cell4 = createNode('tableCell', [paragraph4], {
    attrs: { sdBlockId: 'cell-4', colspan: 1, rowspan: 1, colwidth: [200] },
    isBlock: true,
    inlineContent: false,
  });

  const row1 = createNode('tableRow', [cell1, cell2], {
    attrs: { sdBlockId: 'row-1', tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });
  const row2 = createNode('tableRow', [cell3, cell4], {
    attrs: { sdBlockId: 'row-2', tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });

  const table = createNode('table', [row1, row2], {
    attrs: {
      sdBlockId: 'table-1',
      tableProperties: {},
      tableGrid: [5000, 5000],
      grid: [{ col: 1200 }, { col: 3000 }],
    },
    isBlock: true,
    inlineContent: false,
  });

  const doc = createNode('doc', [table], { isBlock: false });
  const mockParagraph = createNode('paragraph', [], {
    attrs: { paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });

  const tr = {
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    replaceWith: vi.fn().mockReturnThis(),
    setNodeMarkup: vi.fn().mockReturnThis(),
    setSelection: vi.fn().mockReturnThis(),
    setStoredMarks: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: {
      maps: [] as unknown[],
      map: (p: number) => p,
      slice: () => ({ map: (p: number) => p }),
    },
    doc,
  };

  return {
    state: {
      doc,
      tr,
      schema: {
        text: (text: string) => createNode('text', [], { text }),
        nodes: {
          paragraph: {
            createAndFill: vi.fn((attrs: Record<string, unknown> = {}, content?: unknown) => {
              const children = Array.isArray(content)
                ? (content as ProseMirrorNode[])
                : content
                  ? ([content] as ProseMirrorNode[])
                  : [];
              return createNode('paragraph', children, {
                attrs: { paragraphProperties: {}, ...attrs },
                isBlock: true,
                inlineContent: true,
              });
            }),
          },
          tableCell: {
            createAndFill: vi.fn((attrs: Record<string, unknown> = {}, content?: unknown) => {
              const children = Array.isArray(content)
                ? (content as ProseMirrorNode[])
                : content
                  ? ([content] as ProseMirrorNode[])
                  : [mockParagraph];
              return createNode('tableCell', children, {
                attrs: { colspan: 1, rowspan: 1, ...attrs },
                isBlock: true,
                inlineContent: false,
              });
            }),
          },
          tableRow: {
            createAndFill: vi.fn((attrs: Record<string, unknown> = {}, content?: unknown) => {
              const children = Array.isArray(content)
                ? (content as ProseMirrorNode[])
                : content
                  ? ([content] as ProseMirrorNode[])
                  : [];
              return createNode('tableRow', children, {
                attrs,
                isBlock: true,
                inlineContent: false,
              });
            }),
            create: vi.fn((attrs: Record<string, unknown> = {}, content?: unknown) => {
              const children = Array.isArray(content)
                ? (content as ProseMirrorNode[])
                : content
                  ? ([content] as ProseMirrorNode[])
                  : [];
              return createNode('tableRow', children, {
                attrs,
                isBlock: true,
                inlineContent: false,
              });
            }),
          },
          table: {
            create: vi.fn((attrs: Record<string, unknown> = {}, content?: unknown) => {
              const children = Array.isArray(content)
                ? (content as ProseMirrorNode[])
                : content
                  ? ([content] as ProseMirrorNode[])
                  : [];
              return createNode('table', children, {
                attrs,
                isBlock: true,
                inlineContent: false,
              });
            }),
          },
        },
      },
    },
    dispatch: vi.fn(),
    commands: {},
    can: vi.fn(() => ({})),
    schema: { marks: {}, nodes: {} },
    options: {},
  } as unknown as Editor;
}

function getTableGridUpdateAttrs(tr: { setNodeMarkup: ReturnType<typeof vi.fn> }): Record<string, unknown> | undefined {
  const tableUpdateCall = tr.setNodeMarkup.mock.calls.find(
    (call) => call[0] === 0 && typeof call[2] === 'object' && call[2] != null && 'grid' in call[2],
  );
  return tableUpdateCall?.[2] as Record<string, unknown> | undefined;
}

describe('tables-adapter regressions', () => {
  it('preserves shiftRight data by rebuilding the table instead of deleting the row tail cell', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as {
      delete: ReturnType<typeof vi.fn>;
      replaceWith: ReturnType<typeof vi.fn>;
    };
    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;

    const result = tablesInsertCellAdapter(editor, { nodeId: 'cell-4', mode: 'shiftRight' });
    expect(result.success).toBe(true);
    expect(tr.delete).not.toHaveBeenCalled();
    expect(tr.insert).toHaveBeenCalled();
    expect(tr.replaceWith).toHaveBeenCalledWith(0, expect.any(Number), expect.anything());
  });

  it('inserts shiftDown cells in the same column of the next row', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { insert: ReturnType<typeof vi.fn> };
    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;
    const map = TableMap.get(tableNode);

    const rowBelowOffset = map.map[1 * map.width + 0]!;
    const expectedInsertPos = 1 + rowBelowOffset;

    const result = tablesInsertCellAdapter(editor, { nodeId: 'cell-1', mode: 'shiftDown' });
    expect(result.success).toBe(true);
    expect(tr.insert).toHaveBeenCalledWith(expectedInsertPos, expect.anything());
  });

  it('inserts shiftUp replacement cells at the same column in the last row', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { insert: ReturnType<typeof vi.fn> };
    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;
    const map = TableMap.get(tableNode);

    const lastRowIndex = map.height - 1;
    const sameColumnOffset = map.map[lastRowIndex * map.width + 0]!;
    const expectedInsertPos = 1 + sameColumnOffset;

    const result = tablesDeleteCellAdapter(editor, { nodeId: 'cell-1', mode: 'shiftUp' });
    expect(result.success).toBe(true);
    expect(tr.insert).toHaveBeenCalledWith(expectedInsertPos, expect.anything());
  });

  it('inserts a separator paragraph before the split-off table', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { insert: ReturnType<typeof vi.fn> };
    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;
    const expectedInsertPos = tableNode.nodeSize;

    const result = tablesSplitAdapter(editor, { nodeId: 'table-1', atRowIndex: 1 });
    expect(result.success).toBe(true);
    expect(tr.insert).toHaveBeenCalledTimes(2);

    const firstInsertCall = tr.insert.mock.calls[0] as [number, ProseMirrorNode];
    const secondInsertCall = tr.insert.mock.calls[1] as [number, ProseMirrorNode];
    const insertedSeparator = firstInsertCall[1];
    const insertedTable = secondInsertCall[1];

    expect(firstInsertCall[0]).toBe(expectedInsertPos);
    expect(insertedSeparator.type.name).toBe('paragraph');
    expect(secondInsertCall[0]).toBe(expectedInsertPos + insertedSeparator.nodeSize);
    expect(insertedTable.type.name).toBe('table');
  });

  it('deletes shiftLeft cells without appending a trailing replacement cell', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as {
      delete: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      setNodeMarkup: ReturnType<typeof vi.fn>;
    };
    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;
    const targetCellOffset = TableMap.get(tableNode).map[0]!;
    const targetCellNode = tableNode.nodeAt(targetCellOffset) as ProseMirrorNode;
    const expectedStart = 1 + targetCellOffset;
    const expectedEnd = expectedStart + targetCellNode.nodeSize;

    const result = tablesDeleteCellAdapter(editor, { nodeId: 'cell-1', mode: 'shiftLeft' });
    expect(result.success).toBe(true);
    expect(tr.delete).toHaveBeenCalledWith(expectedStart, expectedEnd);
    expect(tr.insert).not.toHaveBeenCalled();
    expect(tr.setNodeMarkup).toHaveBeenCalledWith(
      expect.any(Number),
      null,
      expect.objectContaining({
        colspan: 2,
      }),
    );
  });

  it('deletes the row trailing cell for shiftLeft without appending a replacement cell', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as {
      delete: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      setNodeMarkup: ReturnType<typeof vi.fn>;
    };
    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;
    const targetCellOffset = TableMap.get(tableNode).map[1]!;
    const targetCellNode = tableNode.nodeAt(targetCellOffset) as ProseMirrorNode;
    const expectedStart = 1 + targetCellOffset;
    const expectedEnd = expectedStart + targetCellNode.nodeSize;

    const result = tablesDeleteCellAdapter(editor, { nodeId: 'cell-2', mode: 'shiftLeft' });
    expect(result.success).toBe(true);
    expect(tr.delete).toHaveBeenCalledWith(expectedStart, expectedEnd);
    expect(tr.insert).not.toHaveBeenCalled();
    expect(tr.setNodeMarkup).toHaveBeenCalledWith(
      expect.any(Number),
      null,
      expect.objectContaining({
        colspan: 2,
      }),
    );
  });

  it('falls back to trailing replacement cell when shiftLeft would widen a vertically merged trailing cell', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as {
      delete: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      setNodeMarkup: ReturnType<typeof vi.fn>;
    };
    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;
    const firstRow = tableNode.child(0) as ProseMirrorNode;
    const trailingCell = firstRow.child(1) as unknown as { attrs: Record<string, unknown> };
    trailingCell.attrs.rowspan = 2;
    trailingCell.attrs.tableCellProperties = { vMerge: 'restart' };

    const result = tablesDeleteCellAdapter(editor, { nodeId: 'cell-1', mode: 'shiftLeft' });
    expect(result.success).toBe(true);
    expect(tr.insert).toHaveBeenCalledWith(expect.any(Number), expect.anything());
    expect(tr.setNodeMarkup).not.toHaveBeenCalled();
  });

  it('shiftLeft vMerge fallback inserts at the post-delete row end without double-mapping', () => {
    // Regression: rowEndPos was computed from the post-delete doc (tr.doc) but then
    // passed through tr.mapping.map() which maps old→new, double-shifting the position.
    const editor = makeTableEditor();

    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;
    const firstRow = tableNode.child(0) as ProseMirrorNode;
    const trailingCell = firstRow.child(1) as unknown as { attrs: Record<string, unknown> };
    trailingCell.attrs.rowspan = 2;
    trailingCell.attrs.tableCellProperties = { vMerge: 'restart' };

    const cell1 = firstRow.child(0);
    const deletionStart = 2; // absolute position of cell-1
    const deletionSize = cell1.nodeSize; // 9

    // Build post-delete table: row 0 only contains the vMerge cell.
    const postDeleteRow0 = createNode('tableRow', [firstRow.child(1)], {
      attrs: { ...(firstRow.attrs as Record<string, unknown>) },
      isBlock: true,
      inlineContent: false,
    });
    const postDeleteTable = createNode('table', [postDeleteRow0, tableNode.child(1)], {
      attrs: { ...(tableNode.attrs as Record<string, unknown>) },
      isBlock: true,
      inlineContent: false,
    });
    const postDeleteDoc = createNode('doc', [postDeleteTable], { isBlock: false });

    const trObj = editor.state.tr as unknown as {
      delete: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      mapping: { map: (p: number) => number; maps: unknown[]; slice: () => { map: (p: number) => number } };
      doc: ProseMirrorNode;
    };

    // Swap tr.doc to the post-delete document when delete is called.
    trObj.delete = vi.fn(() => {
      trObj.doc = postDeleteDoc;
      return trObj;
    });

    // Simulate real deletion mapping: positions at or after the deleted range shift left.
    trObj.mapping.map = (pos: number) => {
      if (pos < deletionStart) return pos;
      if (pos < deletionStart + deletionSize) return deletionStart;
      return pos - deletionSize;
    };

    const result = tablesDeleteCellAdapter(editor, { nodeId: 'cell-1', mode: 'shiftLeft' });
    expect(result.success).toBe(true);
    expect(trObj.insert).toHaveBeenCalled();

    // Post-delete row 0 nodeSize = 2 + cell-2 size (9) = 11.
    // rowEndPos = tablePos(0) + 1 + 11 = 12.
    // Correct insert = 12 - 1 = 11 (just inside the row).
    // Old buggy code: tr.mapping.map(11) = 11 - 9 = 2 — wrong position!
    const insertPos = trObj.insert.mock.calls[0]![0];
    expect(insertPos).toBe(11);
  });

  it('keeps table grid widths in sync when distributing columns', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { setNodeMarkup: ReturnType<typeof vi.fn> };

    const result = tablesDistributeColumnsAdapter(editor, {
      nodeId: 'table-1',
      columnRange: { start: 0, end: 1 },
    });

    expect(result.success).toBe(true);

    expect(getTableGridUpdateAttrs(tr)).toMatchObject({
      userEdited: true,
      grid: [{ col: 2250 }, { col: 2250 }],
    });
  });

  it('updates object-shaped grid colWidths when distributing columns', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { setNodeMarkup: ReturnType<typeof vi.fn> };
    const tableNode = editor.state.doc.nodeAt(0) as ProseMirrorNode;
    (tableNode.attrs as Record<string, unknown>).grid = {
      source: 'ooxml',
      colWidths: [{ col: 1200 }, { col: 3000 }],
    };

    const result = tablesDistributeColumnsAdapter(editor, {
      nodeId: 'table-1',
      columnRange: { start: 0, end: 1 },
    });

    expect(result.success).toBe(true);
    expect(getTableGridUpdateAttrs(tr)).toMatchObject({
      userEdited: true,
      grid: {
        source: 'ooxml',
        colWidths: [{ col: 2250 }, { col: 2250 }],
      },
    });
  });

  it('only updates grid columns inside the requested range', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { setNodeMarkup: ReturnType<typeof vi.fn> };

    const result = tablesDistributeColumnsAdapter(editor, {
      nodeId: 'table-1',
      columnRange: { start: 0, end: 0 },
    });

    expect(result.success).toBe(true);
    expect(getTableGridUpdateAttrs(tr)).toMatchObject({
      userEdited: true,
      grid: [{ col: 1500 }, { col: 3000 }],
    });
  });

  it('splits a cell by structural row/column expansion without deleting neighboring cells', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as {
      delete: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      setNodeMarkup: ReturnType<typeof vi.fn>;
    };

    const result = tablesSplitCellAdapter(editor, {
      nodeId: 'cell-1',
      rows: 2,
      columns: 2,
    });

    expect(result.success).toBe(true);
    expect(tr.delete).not.toHaveBeenCalled();
    expect(tr.insert).toHaveBeenCalled();
    expect(getTableGridUpdateAttrs(tr)).toMatchObject({
      userEdited: true,
      grid: [{ col: 1200 }, { col: 3000 }, { col: 3000 }],
    });
  });

  it('does not copy header-only null borders when split inserts a body row from a header source row', () => {
    const editor = makeTableEditor({ firstRowAsHeaders: true, firstRowBorders: null });
    const tr = editor.state.tr as unknown as { insert: ReturnType<typeof vi.fn> };

    const result = tablesSplitCellAdapter(editor, {
      nodeId: 'cell-1',
      rows: 2,
      columns: 1,
    });

    expect(result.success).toBe(true);

    const insertedRow = tr.insert.mock.calls.find(([, node]) => node?.type?.name === 'tableRow')?.[1] as
      | ProseMirrorNode
      | undefined;
    expect(insertedRow).toBeDefined();

    const insertedCells = ((insertedRow as unknown as { _children?: ProseMirrorNode[] })._children ?? []).filter(
      (node) => node.type.name === 'tableCell',
    );
    expect(insertedCells.length).toBeGreaterThan(0);
    for (const cell of insertedCells) {
      expect((cell.attrs as Record<string, unknown>).borders).toBeUndefined();
    }
  });

  it('preserves non-target rows when split inserts columns by widening adjacent cells', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { setNodeMarkup: ReturnType<typeof vi.fn> };

    const result = tablesSplitCellAdapter(editor, {
      nodeId: 'cell-1',
      rows: 1,
      columns: 2,
    });

    expect(result.success).toBe(true);
    expect(tr.setNodeMarkup).toHaveBeenCalledWith(
      expect.any(Number),
      null,
      expect.objectContaining({
        colspan: 2,
      }),
    );
  });

  it('rejects paragraph targets for tables.setBorder', () => {
    const editor = makeTableEditor();
    const result = tablesSetBorderAdapter(editor, {
      nodeId: 'p1',
      edge: 'top',
      lineStyle: 'single',
      lineWeightPt: 1,
      color: '000000',
    });

    expect(result).toMatchObject({
      success: false,
      failure: { code: 'INVALID_TARGET' },
    });
  });

  it('applies table shading to all cells when target is a table', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { setNodeMarkup: ReturnType<typeof vi.fn> };

    const result = tablesSetShadingAdapter(editor, {
      nodeId: 'table-1',
      color: 'FFFF00',
    });

    expect(result.success).toBe(true);

    const cellUpdates = tr.setNodeMarkup.mock.calls.filter(
      (call) =>
        typeof call[2] === 'object' &&
        call[2] != null &&
        (call[2] as { tableCellProperties?: { shading?: { fill?: string } } }).tableCellProperties?.shading?.fill ===
          'FFFF00',
    );

    expect(cellUpdates).toHaveLength(4);
    for (const call of cellUpdates) {
      expect((call[2] as { background?: { color?: string } }).background).toEqual({ color: 'FFFF00' });
    }
  });

  it('does not write cell background when table shading color is auto', () => {
    const editor = makeTableEditor();
    const tr = editor.state.tr as unknown as { setNodeMarkup: ReturnType<typeof vi.fn> };

    const result = tablesSetShadingAdapter(editor, {
      nodeId: 'table-1',
      color: 'auto',
    });

    expect(result.success).toBe(true);

    const cellUpdates = tr.setNodeMarkup.mock.calls.filter(
      (call) =>
        typeof call[2] === 'object' &&
        call[2] != null &&
        (call[2] as { tableCellProperties?: { shading?: { fill?: string } } }).tableCellProperties?.shading?.fill ===
          'auto',
    );

    expect(cellUpdates).toHaveLength(4);
    for (const call of cellUpdates) {
      expect((call[2] as { background?: unknown }).background).toBeUndefined();
    }
  });

  it.each([
    {
      name: 'tables.setBorder',
      run: (editor: Editor) =>
        tablesSetBorderAdapter(editor, {
          nodeId: 'missing',
          edge: 'top',
          lineStyle: 'single',
          lineWeightPt: 1,
          color: '000000',
        }),
    },
    {
      name: 'tables.clearBorder',
      run: (editor: Editor) =>
        tablesClearBorderAdapter(editor, {
          nodeId: 'missing',
          edge: 'top',
        }),
    },
    {
      name: 'tables.setShading',
      run: (editor: Editor) =>
        tablesSetShadingAdapter(editor, {
          nodeId: 'missing',
          color: 'FF0000',
        }),
    },
    {
      name: 'tables.clearShading',
      run: (editor: Editor) =>
        tablesClearShadingAdapter(editor, {
          nodeId: 'missing',
        }),
    },
  ])('propagates pre-apply TARGET_NOT_FOUND for $name missing targets', ({ run }) => {
    const editor = makeTableEditor();

    try {
      run(editor);
      throw new Error('expected adapter to throw');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('TARGET_NOT_FOUND');
    }
  });
});
