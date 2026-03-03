import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { resolveRowLocator, resolveCellLocator } from './table-target-resolver.js';

vi.mock('prosemirror-tables', () => ({
  TableMap: {
    get: vi.fn(() => ({
      width: 1,
      height: 1,
      map: [1],
      positionAt: vi.fn(() => 1),
      colCount: vi.fn(() => 0),
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
