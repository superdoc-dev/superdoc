import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { resolveRowLocator, resolveCellLocator, resolveTableScopedCellLocator } from './table-target-resolver.js';

let tableMapOverride: { width: number; height: number; map: number[] } | null = null;

vi.mock('prosemirror-tables', () => ({
  TableMap: {
    get: vi.fn(() => {
      if (tableMapOverride) return { ...tableMapOverride, positionAt: vi.fn(() => 0), colCount: vi.fn(() => 0) };
      return {
        width: 1,
        height: 1,
        map: [1],
        positionAt: vi.fn(() => 1),
        colCount: vi.fn(() => 0),
      };
    }),
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

/**
 * Build a document with nested tables:
 *
 *   doc
 *     outerTable
 *       outerRow
 *         outerCell
 *           innerTable
 *             innerRow
 *               innerCell
 *                 innerParagraph
 */
function makeNestedTableEditor(): Editor {
  const innerParagraph = createNode('paragraph', [createNode('text', [], { text: 'inner' })], {
    attrs: { sdBlockId: 'inner-p', paraId: 'inner-p', paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });

  const innerCell = createNode('tableCell', [innerParagraph], {
    attrs: { sdBlockId: 'inner-cell', colspan: 1, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });

  const innerRow = createNode('tableRow', [innerCell], {
    attrs: { sdBlockId: 'inner-row', tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });

  const innerTable = createNode('table', [innerRow], {
    attrs: { sdBlockId: 'inner-table', tableProperties: {}, tableGrid: [5000] },
    isBlock: true,
    inlineContent: false,
  });

  const outerCell = createNode('tableCell', [innerTable], {
    attrs: { sdBlockId: 'outer-cell', colspan: 1, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });

  const outerRow = createNode('tableRow', [outerCell], {
    attrs: { sdBlockId: 'outer-row', tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });

  const outerTable = createNode('table', [outerRow], {
    attrs: { sdBlockId: 'outer-table', tableProperties: {}, tableGrid: [5000] },
    isBlock: true,
    inlineContent: false,
  });

  const doc = createNode('doc', [outerTable], { isBlock: false });

  const tr = {
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    setNodeMarkup: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: { maps: [] as unknown[], map: (p: number) => p, slice: () => ({ map: (p: number) => p }) },
    doc,
  };

  return {
    state: {
      doc,
      tr,
      schema: { nodes: { tableCell: { createAndFill: vi.fn() } } },
    },
    dispatch: vi.fn(),
    commands: {},
    can: vi.fn(() => ({})),
    schema: { marks: {}, nodes: {} },
    options: {},
  } as unknown as Editor;
}

/**
 * Build a 2×2 table where cell (0,0) is merged across columns 0–1.
 *
 * Logical grid:
 *   row 0: [ mergedCell (colspan=2) ]
 *   row 1: [ cell-r1c0 ] [ cell-r1c1 ]
 *
 * TableMap.map for this layout:
 *   [0, 0, <offset-c0>, <offset-c1>]
 *   Indices 0 and 1 both point to offset 0 (the merged cell).
 */
function makeMergedCellTableEditor(): Editor {
  const makeParagraph = (id: string) =>
    createNode('paragraph', [createNode('text', [], { text: id })], {
      attrs: { sdBlockId: `p-${id}`, paraId: `p-${id}`, paragraphProperties: {} },
      isBlock: true,
      inlineContent: true,
    });

  // Row 0: single merged cell spanning 2 columns
  const mergedCell = createNode('tableCell', [makeParagraph('merged')], {
    attrs: { sdBlockId: 'merged-cell', colspan: 2, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });
  const row0 = createNode('tableRow', [mergedCell], {
    attrs: { sdBlockId: 'row-0', tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });

  // Row 1: two normal cells
  const cellR1C0 = createNode('tableCell', [makeParagraph('r1c0')], {
    attrs: { sdBlockId: 'cell-r1c0', colspan: 1, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });
  const cellR1C1 = createNode('tableCell', [makeParagraph('r1c1')], {
    attrs: { sdBlockId: 'cell-r1c1', colspan: 1, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });
  const row1 = createNode('tableRow', [cellR1C0, cellR1C1], {
    attrs: { sdBlockId: 'row-1', tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });

  const table = createNode('table', [row0, row1], {
    attrs: { sdBlockId: 'table-1', tableProperties: {}, tableGrid: [5000, 5000] },
    isBlock: true,
    inlineContent: false,
  });

  const doc = createNode('doc', [table], { isBlock: false });

  // The merged cell's offset relative to table content start (tablePos + 1):
  // row0 starts at offset 0 inside the table content; its content starts at +1;
  // the merged cell is at offset 1 inside row0.
  // Absolute: tablePos=0, table content start=1, row0 starts at 1, row0 content at 2,
  // mergedCell at 2.
  // Cell offset relative to table content start: mergedCell offset = 1
  //   (row0 node opens at 0, content at 1, mergedCell at 1)
  //
  // For TableMap: the map stores offsets relative to tablePos + 1 (the table content start).
  // We need: row0 content offset = 1 (row0 is at offset 0, opens at 0, content at 1).
  // mergedCell offset = 1 (first child of row0 content).
  //
  // row1 offset = row0.nodeSize = mergedCell.nodeSize + 2 (row wrapper)
  // mergedCell.nodeSize = paragraph.nodeSize + 2 = (text.nodeSize + 2) + 2 = "merged".length + 4 = 10
  // row0.nodeSize = 10 + 2 = 12
  // row1 starts at offset 12, content at 13.
  // cellR1C0 at 13, cellR1C1 at 13 + cellR1C0.nodeSize
  // cellR1C0.nodeSize = para.nodeSize + 2 = ("r1c0".length + 2) + 2 = 8
  // cellR1C1 at 13 + 8 = 21

  // mergedCell offset (from table content start = 1):
  //   row0 starts at 0 relative to table content, row0 content at 1, mergedCell at 1
  const mergedCellOffset = 1;
  // row1 starts at 12 relative to table content, row1 content at 13
  const cellR1C0Offset = 13;
  const cellR1C1Offset = 13 + cellR1C0.nodeSize;

  // TableMap.map for 2×2 grid with merged cell at (0,0)–(0,1):
  // [mergedCellOffset, mergedCellOffset, cellR1C0Offset, cellR1C1Offset]
  tableMapOverride = {
    width: 2,
    height: 2,
    map: [mergedCellOffset, mergedCellOffset, cellR1C0Offset, cellR1C1Offset],
  };

  const tr = {
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    setNodeMarkup: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: { maps: [] as unknown[], map: (p: number) => p, slice: () => ({ map: (p: number) => p }) },
    doc,
  };

  return {
    state: {
      doc,
      tr,
      schema: { nodes: { tableCell: { createAndFill: vi.fn() } } },
    },
    dispatch: vi.fn(),
    commands: {},
    can: vi.fn(() => ({})),
    schema: { marks: {}, nodes: {} },
    options: {},
  } as unknown as Editor;
}

describe('resolveTableScopedCellLocator', () => {
  afterEach(() => {
    tableMapOverride = null;
  });

  it('resolves anchor coordinates when targeting the anchor cell directly', () => {
    const editor = makeMergedCellTableEditor();
    const resolved = resolveTableScopedCellLocator(editor, { nodeId: 'table-1', rowIndex: 0, columnIndex: 0 }, 'test');

    expect(resolved.table.address.nodeId).toBe('table-1');
    expect(resolved.rowIndex).toBe(0);
    expect(resolved.columnIndex).toBe(0);
    expect(resolved.cellNode.attrs.sdBlockId).toBe('merged-cell');
  });

  it('canonicalizes non-anchor coordinate to anchor coordinates inside a merged span', () => {
    const editor = makeMergedCellTableEditor();
    // Target (0,1) — covered by the merged cell anchored at (0,0).
    const resolved = resolveTableScopedCellLocator(editor, { nodeId: 'table-1', rowIndex: 0, columnIndex: 1 }, 'test');

    // Must return the anchor coordinates (0,0), not the requested (0,1).
    expect(resolved.rowIndex).toBe(0);
    expect(resolved.columnIndex).toBe(0);
    expect(resolved.cellNode.attrs.sdBlockId).toBe('merged-cell');
  });

  it('resolves an unmerged cell in row 1', () => {
    const editor = makeMergedCellTableEditor();
    const resolved = resolveTableScopedCellLocator(editor, { nodeId: 'table-1', rowIndex: 1, columnIndex: 0 }, 'test');

    expect(resolved.rowIndex).toBe(1);
    expect(resolved.columnIndex).toBe(0);
    expect(resolved.cellNode.attrs.sdBlockId).toBe('cell-r1c0');
  });

  it('throws INVALID_TARGET for out-of-bounds coordinates', () => {
    const editor = makeMergedCellTableEditor();
    expect(() =>
      resolveTableScopedCellLocator(editor, { nodeId: 'table-1', rowIndex: 5, columnIndex: 0 }, 'test'),
    ).toThrow(/out of bounds/);
  });
});

describe('table-target-resolver nested tables', () => {
  it('resolveRowLocator picks the innermost parent table for a nested row', () => {
    const editor = makeNestedTableEditor();
    const resolved = resolveRowLocator(editor, { nodeId: 'inner-row' }, 'test');
    expect(resolved.table.address.nodeId).toBe('inner-table');
  });

  it('resolveCellLocator picks the innermost parent table for a nested cell', () => {
    const editor = makeNestedTableEditor();
    const resolved = resolveCellLocator(editor, { nodeId: 'inner-cell' }, 'test');
    expect(resolved.table.address.nodeId).toBe('inner-table');
  });

  it('resolveRowLocator still picks the outer table for outer rows', () => {
    const editor = makeNestedTableEditor();
    const resolved = resolveRowLocator(editor, { nodeId: 'outer-row' }, 'test');
    expect(resolved.table.address.nodeId).toBe('outer-table');
  });
});
