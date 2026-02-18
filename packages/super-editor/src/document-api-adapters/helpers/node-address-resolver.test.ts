import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { NodeAddress } from '@superdoc/document-api';
import {
  buildBlockIndex,
  findBlockById,
  findBlockByPos,
  isSupportedNodeType,
  toBlockAddress,
  type BlockCandidate,
  type BlockIndex,
} from './node-address-resolver.js';

// ---------------------------------------------------------------------------
// Helpers — lightweight ProseMirror-like stubs
// ---------------------------------------------------------------------------

/**
 * Creates a minimal ProseMirrorNode stub.
 *
 * `children` is a flat list of `{ node, offset }` pairs where `offset` is the
 * **absolute** document position of the child — matching how ProseMirror's
 * `descendants` callback provides positions.
 */
function makeNode(
  typeName: string,
  attrs: Record<string, unknown> = {},
  nodeSize = 10,
  children: Array<{ node: ProseMirrorNode; offset: number }> = [],
): ProseMirrorNode {
  const inlineTypes = new Set(['image', 'run', 'bookmarkStart', 'bookmarkEnd', 'commentRangeStart', 'commentRangeEnd']);
  const isBlock = typeName !== 'doc' && !inlineTypes.has(typeName);
  return {
    type: { name: typeName },
    attrs,
    nodeSize,
    isBlock,
    descendants(callback: (node: ProseMirrorNode, pos: number) => void) {
      for (const child of children) {
        callback(child.node, child.offset);
      }
    },
  } as unknown as ProseMirrorNode;
}

function makeEditor(docNode: ProseMirrorNode): Editor {
  return { state: { doc: docNode } } as unknown as Editor;
}

function indexFromNodes(
  ...entries: Array<{ typeName: string; attrs?: Record<string, unknown>; nodeSize?: number; offset: number }>
): BlockIndex {
  const children = entries.map((e) => ({
    node: makeNode(e.typeName, e.attrs ?? {}, e.nodeSize ?? 10),
    offset: e.offset,
  }));
  const totalSize = entries.reduce((max, e) => Math.max(max, e.offset + (e.nodeSize ?? 10)), 0) + 2;
  const doc = makeNode('doc', {}, totalSize, children);
  return buildBlockIndex(makeEditor(doc));
}

// ---------------------------------------------------------------------------
// isSupportedNodeType
// ---------------------------------------------------------------------------

describe('isSupportedNodeType', () => {
  it.each(['paragraph', 'heading', 'listItem', 'table', 'tableRow', 'tableCell', 'image', 'sdt'] as const)(
    'returns true for supported block type "%s"',
    (nodeType) => {
      expect(isSupportedNodeType(nodeType)).toBe(true);
    },
  );

  it.each(['text', 'run', 'field', 'bookmark', 'comment', 'hyperlink', 'footnoteRef', 'tab', 'lineBreak'] as const)(
    'returns false for unsupported type "%s"',
    (nodeType) => {
      expect(isSupportedNodeType(nodeType)).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// toBlockAddress
// ---------------------------------------------------------------------------

describe('toBlockAddress', () => {
  it('converts a BlockCandidate to a block NodeAddress', () => {
    const candidate: BlockCandidate = {
      node: makeNode('paragraph'),
      pos: 5,
      end: 15,
      nodeType: 'paragraph',
      nodeId: 'abc',
    };

    expect(toBlockAddress(candidate)).toEqual({
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: 'abc',
    });
  });

  it('does not include pos/end/node in the address', () => {
    const candidate: BlockCandidate = {
      node: makeNode('table'),
      pos: 0,
      end: 50,
      nodeType: 'table',
      nodeId: 't1',
    };

    const address = toBlockAddress(candidate);
    expect(Object.keys(address).sort()).toEqual(['kind', 'nodeId', 'nodeType']);
  });
});

// ---------------------------------------------------------------------------
// buildBlockIndex — node type mapping
// ---------------------------------------------------------------------------

describe('buildBlockIndex', () => {
  describe('paragraph type mapping', () => {
    it('maps a plain paragraph to "paragraph"', () => {
      const index = indexFromNodes({ typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 });
      expect(index.candidates[0].nodeType).toBe('paragraph');
    });

    it('maps a paragraph with heading styleId to "heading"', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1', paragraphProperties: { styleId: 'Heading1' } },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('heading');
    });

    it.each(['heading 2', 'Heading3', 'heading 6', 'HEADING 4'])(
      'recognises heading styleId variation "%s"',
      (styleId) => {
        const index = indexFromNodes({
          typeName: 'paragraph',
          attrs: { sdBlockId: 'p1', paragraphProperties: { styleId } },
          offset: 0,
        });
        expect(index.candidates[0].nodeType).toBe('heading');
      },
    );

    it('does not treat non-heading styleId as heading', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1', paragraphProperties: { styleId: 'Normal' } },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('paragraph');
    });

    it('does not treat heading7+ as heading', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1', paragraphProperties: { styleId: 'heading7' } },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('paragraph');
    });

    it('maps paragraph with numberingProperties (numId + ilvl) to "listItem"', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1', paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } } },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('listItem');
    });

    it('maps paragraph with numberingProperties (ilvl only) to "listItem"', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1', paragraphProperties: { numberingProperties: { ilvl: 2 } } },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('listItem');
    });

    it('maps paragraph with listRendering.markerText to "listItem"', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1', listRendering: { markerText: '1.' } },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('listItem');
    });

    it('maps paragraph with listRendering.path to "listItem"', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1', listRendering: { path: [0, 1] } },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('listItem');
    });

    it('does not map paragraph with empty listRendering.path to "listItem"', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1', listRendering: { path: [] } },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('paragraph');
    });

    it('heading takes priority over listItem when both are present', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: {
          sdBlockId: 'p1',
          paragraphProperties: {
            styleId: 'Heading1',
            numberingProperties: { numId: 1, ilvl: 0 },
          },
        },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe('heading');
    });
  });

  describe('non-paragraph type mapping', () => {
    it.each([
      ['table', 'table'],
      ['tableRow', 'tableRow'],
      ['tableCell', 'tableCell'],
      ['tableHeader', 'tableCell'],
      ['sdt', 'sdt'],
      ['structuredContentBlock', 'sdt'],
    ] as const)('maps PM node type "%s" to block type "%s"', (pmType, expectedBlockType) => {
      const index = indexFromNodes({
        typeName: pmType,
        attrs: { sdBlockId: 'test-id' },
        offset: 0,
      });
      expect(index.candidates[0].nodeType).toBe(expectedBlockType);
    });

    it('skips unsupported node types', () => {
      const index = indexFromNodes({ typeName: 'hardBreak', offset: 0 });
      expect(index.candidates).toHaveLength(0);
    });

    it('skips unknown node types', () => {
      const index = indexFromNodes({ typeName: 'someCustomNode', offset: 0 });
      expect(index.candidates).toHaveLength(0);
    });
  });

  describe('ID resolution — paragraph nodes', () => {
    it('prefers paraId over sdBlockId when both are present', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'sd1', paraId: 'p1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('p1');
    });

    it('falls back to paraId when sdBlockId is absent', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { paraId: 'p1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('p1');
    });

    it('falls back to paraId when sdBlockId is null', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: null, paraId: 'p1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('p1');
    });

    it('skips paragraph candidates when no explicit id attrs exist', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: {},
        offset: 7,
      });
      expect(index.candidates).toHaveLength(0);
    });
  });

  describe('ID resolution — non-paragraph nodes', () => {
    it('prefers imported IDs over sdBlockId when both are present', () => {
      const index = indexFromNodes({
        typeName: 'table',
        attrs: { sdBlockId: 'sd1', blockId: 'b1', id: 'i1', paraId: 'p1', uuid: 'u1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('b1');
    });

    it('uses sdBlockId when imported IDs are absent', () => {
      const index = indexFromNodes({
        typeName: 'table',
        attrs: { sdBlockId: 'sd1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('sd1');
    });

    it('falls back to blockId', () => {
      const index = indexFromNodes({
        typeName: 'table',
        attrs: { blockId: 'b1', id: 'i1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('b1');
    });

    it('falls back to id', () => {
      const index = indexFromNodes({
        typeName: 'table',
        attrs: { id: 'i1', paraId: 'p1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('i1');
    });

    it('falls back to paraId', () => {
      const index = indexFromNodes({
        typeName: 'table',
        attrs: { paraId: 'p1', uuid: 'u1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('p1');
    });

    it('falls back to uuid', () => {
      const index = indexFromNodes({
        typeName: 'table',
        attrs: { uuid: 'u1' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('u1');
    });

    it('skips non-paragraph candidates when no id attrs exist', () => {
      const index = indexFromNodes({
        typeName: 'table',
        attrs: {},
        offset: 3,
      });
      expect(index.candidates).toHaveLength(0);
    });

    it('ignores empty string attrs', () => {
      const index = indexFromNodes({
        typeName: 'table',
        attrs: { sdBlockId: '', blockId: '', id: 'real' },
        offset: 0,
      });
      expect(index.candidates[0].nodeId).toBe('real');
    });
  });

  describe('index structure', () => {
    it('populates byId with "nodeType:nodeId" keys', () => {
      const index = indexFromNodes(
        { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 },
        { typeName: 'table', attrs: { sdBlockId: 't1' }, offset: 12 },
      );
      expect(index.byId.has('paragraph:p1')).toBe(true);
      expect(index.byId.has('table:t1')).toBe(true);
    });

    it('sets end = pos + nodeSize on each candidate', () => {
      const index = indexFromNodes({
        typeName: 'paragraph',
        attrs: { sdBlockId: 'p1' },
        nodeSize: 15,
        offset: 5,
      });
      expect(index.candidates[0].pos).toBe(5);
      expect(index.candidates[0].end).toBe(20);
    });

    it('preserves insertion order in candidates array', () => {
      const index = indexFromNodes(
        { typeName: 'paragraph', attrs: { sdBlockId: 'a' }, offset: 0 },
        { typeName: 'paragraph', attrs: { sdBlockId: 'b' }, offset: 12 },
        { typeName: 'paragraph', attrs: { sdBlockId: 'c' }, offset: 24 },
      );
      expect(index.candidates.map((c) => c.nodeId)).toEqual(['a', 'b', 'c']);
    });

    it('excludes ambiguous composite keys from byId to prevent silent arbitrary resolution', () => {
      const p1 = makeNode('paragraph', { sdBlockId: 'dup' }, 10);
      const p2 = makeNode('paragraph', { sdBlockId: 'dup' }, 10);
      const doc = makeNode('doc', {}, 24, [
        { node: p1, offset: 0 },
        { node: p2, offset: 12 },
      ]);
      const index = buildBlockIndex(makeEditor(doc));

      // Ambiguous keys are excluded from byId to prevent silent arbitrary resolution.
      // Both candidates still appear in the ordered candidates array.
      expect(index.byId.get('paragraph:dup')).toBeUndefined();
      expect(index.candidates.filter((c) => c.nodeId === 'dup')).toHaveLength(2);
    });

    it('returns empty index for a document with no block nodes', () => {
      const doc = makeNode('doc', {}, 2);
      const index = buildBlockIndex(makeEditor(doc));
      expect(index.candidates).toHaveLength(0);
      expect(index.byId.size).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// findBlockById
// ---------------------------------------------------------------------------

describe('findBlockById', () => {
  function buildMultiTypeIndex(): BlockIndex {
    return indexFromNodes(
      { typeName: 'paragraph', attrs: { sdBlockId: 'p1' }, offset: 0 },
      { typeName: 'table', attrs: { sdBlockId: 't1' }, offset: 12 },
    );
  }

  it('returns the candidate matching a block address', () => {
    const index = buildMultiTypeIndex();
    const result = findBlockById(index, { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' });
    expect(result).toBeDefined();
    expect(result!.nodeId).toBe('p1');
    expect(result!.nodeType).toBe('paragraph');
  });

  it('returns undefined for a non-existent nodeId', () => {
    const index = buildMultiTypeIndex();
    expect(findBlockById(index, { kind: 'block', nodeType: 'paragraph', nodeId: 'nope' })).toBeUndefined();
  });

  it('returns undefined when nodeId matches but nodeType does not', () => {
    const index = buildMultiTypeIndex();
    // 'p1' exists as paragraph, not as table
    expect(findBlockById(index, { kind: 'block', nodeType: 'table', nodeId: 'p1' })).toBeUndefined();
  });

  it('returns undefined for an inline address', () => {
    const index = buildMultiTypeIndex();
    const address: NodeAddress = {
      kind: 'inline',
      nodeType: 'run',
      anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 5 } },
    };
    expect(findBlockById(index, address)).toBeUndefined();
  });

  it('treats duplicate nodeType:nodeId matches as ambiguous and does not resolve an arbitrary block', () => {
    const index = indexFromNodes(
      { typeName: 'paragraph', attrs: { sdBlockId: 'dup' }, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'dup' }, offset: 12 },
    );

    expect(findBlockById(index, { kind: 'block', nodeType: 'paragraph', nodeId: 'dup' })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// findBlockByPos
// ---------------------------------------------------------------------------

describe('findBlockByPos', () => {
  // Three non-overlapping paragraphs with gaps between them:
  //   a: [0, 10]   gap: (10, 15)   b: [15, 25]   gap: (25, 30)   c: [30, 40]
  function buildGappedIndex(): BlockIndex {
    return indexFromNodes(
      { typeName: 'paragraph', attrs: { sdBlockId: 'a' }, nodeSize: 10, offset: 0 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'b' }, nodeSize: 10, offset: 15 },
      { typeName: 'paragraph', attrs: { sdBlockId: 'c' }, nodeSize: 10, offset: 30 },
    );
  }

  it('finds the first block at its start position', () => {
    const index = buildGappedIndex();
    expect(findBlockByPos(index, 0)?.nodeId).toBe('a');
  });

  it('finds the first block at its end position (inclusive)', () => {
    const index = buildGappedIndex();
    // end = pos + nodeSize = 0 + 10 = 10; comparison is pos > candidate.end → 10 > 10 is false → found
    expect(findBlockByPos(index, 10)?.nodeId).toBe('a');
  });

  it('finds the middle block at a position within its range', () => {
    const index = buildGappedIndex();
    expect(findBlockByPos(index, 20)?.nodeId).toBe('b');
  });

  it('finds the last block at its start position', () => {
    const index = buildGappedIndex();
    expect(findBlockByPos(index, 30)?.nodeId).toBe('c');
  });

  it('finds the last block at its end position', () => {
    const index = buildGappedIndex();
    expect(findBlockByPos(index, 40)?.nodeId).toBe('c');
  });

  it('returns undefined for a position in a gap between blocks', () => {
    const index = buildGappedIndex();
    expect(findBlockByPos(index, 12)).toBeUndefined();
  });

  it('returns undefined for a position beyond all blocks', () => {
    const index = buildGappedIndex();
    expect(findBlockByPos(index, 100)).toBeUndefined();
  });

  it('returns undefined for an empty index', () => {
    const doc = makeNode('doc', {}, 2);
    const index = buildBlockIndex(makeEditor(doc));
    expect(findBlockByPos(index, 0)).toBeUndefined();
  });

  it('finds the only block in a single-element index', () => {
    const index = indexFromNodes({
      typeName: 'paragraph',
      attrs: { sdBlockId: 'solo' },
      nodeSize: 10,
      offset: 5,
    });
    expect(findBlockByPos(index, 5)?.nodeId).toBe('solo');
    expect(findBlockByPos(index, 10)?.nodeId).toBe('solo');
    expect(findBlockByPos(index, 15)?.nodeId).toBe('solo');
    expect(findBlockByPos(index, 4)).toBeUndefined();
    expect(findBlockByPos(index, 16)).toBeUndefined();
  });
});
