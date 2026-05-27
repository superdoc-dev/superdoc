import { describe, expect, it, vi } from 'vitest';

import { createInternalNodeMoveTransaction } from './internal-node-move.js';

function createMoveState(options?: {
  sourceNodeType?: string;
  sourceNodeSize?: number;
  mappedTarget?: number;
  canInsertAt?: boolean;
}) {
  const sourceNode = {
    type: { name: options?.sourceNodeType ?? 'structuredContentBlock' },
    nodeSize: options?.sourceNodeSize ?? 10,
  };

  const doc = {
    content: { size: 200 },
    nodeAt: vi.fn((pos: number) => (pos === 20 ? sourceNode : null)),
    resolve: vi.fn(() => ({
      depth: 0,
      node: () => ({
        canReplaceWith: vi.fn(() => options?.canInsertAt ?? true),
      }),
      index: vi.fn(() => 0),
    })),
  };

  const tr = {
    doc: { content: { size: 200 } },
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: {
      map: vi.fn(() => options?.mappedTarget ?? 80),
    },
  };

  return { doc, tr, sourceNode };
}

describe('createInternalNodeMoveTransaction', () => {
  it('moves a node when the source and target are valid', () => {
    const { doc, tr, sourceNode } = createMoveState();

    const result = createInternalNodeMoveTransaction(
      { doc: doc as never, tr: tr as never },
      {
        sourceStart: 20,
        sourceEnd: 30,
        targetPos: 80,
        canInsertAt: () => true,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction).toBe(tr);
      expect(result.mappedTarget).toBe(80);
    }
    expect(doc.nodeAt).toHaveBeenCalledWith(20);
    expect(tr.delete).toHaveBeenCalledWith(20, 30);
    expect(tr.insert).toHaveBeenCalledWith(80, sourceNode);
    expect(tr.setMeta).toHaveBeenCalledWith('uiEvent', 'drop');
  });

  it('rejects drops inside the source range', () => {
    const { doc, tr } = createMoveState();

    const result = createInternalNodeMoveTransaction(
      { doc: doc as never, tr: tr as never },
      {
        sourceStart: 20,
        sourceEnd: 30,
        targetPos: 25,
        canInsertAt: () => true,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('same-range');
    }
    expect(tr.delete).not.toHaveBeenCalled();
    expect(tr.insert).not.toHaveBeenCalled();
  });

  it('rejects when the source node type does not match', () => {
    const { doc, tr } = createMoveState({ sourceNodeType: 'image' });

    const result = createInternalNodeMoveTransaction(
      { doc: doc as never, tr: tr as never },
      {
        sourceStart: 20,
        sourceEnd: 30,
        targetPos: 80,
        expectedNodeType: 'structuredContentBlock',
        canInsertAt: () => true,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('wrong-node-type');
    }
    expect(tr.delete).not.toHaveBeenCalled();
  });

  it('rejects when the target cannot accept the node', () => {
    const { doc, tr } = createMoveState();

    const result = createInternalNodeMoveTransaction(
      { doc: doc as never, tr: tr as never },
      {
        sourceStart: 20,
        sourceEnd: 30,
        targetPos: 80,
        canInsertAt: () => false,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid-target');
    }
    expect(tr.insert).not.toHaveBeenCalled();
  });

  it('moves a block node to the nearest valid sibling boundary when dropped inside text content', () => {
    const { doc, tr, sourceNode } = createMoveState({ mappedTarget: 80 });
    doc.nodeAt.mockImplementation((pos: number) => (pos === 120 ? sourceNode : null));
    tr.doc = {
      content: { size: 200 },
      resolve: vi.fn(() => ({
        depth: 1,
        before: vi.fn(() => 70),
        after: vi.fn(() => 90),
      })),
    } as never;
    const canInsertAt = vi.fn((_doc, pos: number) => pos === 70);

    const result = createInternalNodeMoveTransaction(
      { doc: doc as never, tr: tr as never },
      {
        sourceStart: 120,
        sourceEnd: 130,
        targetPos: 80,
        canInsertAt,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mappedTarget).toBe(70);
    }
    expect(canInsertAt).toHaveBeenCalledWith(tr.doc, 80, sourceNode);
    expect(canInsertAt).toHaveBeenCalledWith(tr.doc, 70, sourceNode);
    expect(tr.insert).toHaveBeenCalledWith(70, sourceNode);
  });

  it('moves a block node to the after boundary when dropped near the end of text while dragging upward', () => {
    const { doc, tr, sourceNode } = createMoveState({ mappedTarget: 88 });
    doc.nodeAt.mockImplementation((pos: number) => (pos === 120 ? sourceNode : null));
    tr.doc = {
      content: { size: 200 },
      resolve: vi.fn(() => ({
        depth: 1,
        before: vi.fn(() => 70),
        after: vi.fn(() => 90),
      })),
    } as never;
    const canInsertAt = vi.fn((_doc, pos: number) => pos === 70 || pos === 90);

    const result = createInternalNodeMoveTransaction(
      { doc: doc as never, tr: tr as never },
      {
        sourceStart: 120,
        sourceEnd: 130,
        targetPos: 88,
        canInsertAt,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mappedTarget).toBe(90);
    }
    expect(tr.insert).toHaveBeenCalledWith(90, sourceNode);
  });

  it('avoids restoring a moved block to its original boundary when another fallback boundary is valid', () => {
    const { doc, tr, sourceNode } = createMoveState({ sourceNodeSize: 40 });
    doc.nodeAt.mockImplementation((pos: number) => (pos === 19 ? sourceNode : null));
    tr.doc = {
      content: { size: 59 },
      resolve: vi.fn(() => ({
        depth: 1,
        before: vi.fn(() => 10),
        after: vi.fn(() => 19),
      })),
    } as never;
    tr.mapping.map = vi.fn((pos: number) => pos);
    const canInsertAt = vi.fn((_doc, pos: number) => pos === 10 || pos === 19);

    const result = createInternalNodeMoveTransaction(
      { doc: doc as never, tr: tr as never },
      {
        sourceStart: 19,
        sourceEnd: 59,
        targetPos: 17,
        canInsertAt,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mappedTarget).toBe(10);
    }
    expect(tr.insert).toHaveBeenCalledWith(10, sourceNode);
  });
});
