import { describe, it, expect } from 'vitest';
import { FlowBlockCache, shiftBlockPositions, shiftCachedBlocks } from './cache.js';
import type { FlowBlock, ParagraphBlock, ImageBlock, DrawingBlock, Run } from '@superdoc/contracts';

describe('FlowBlockCache', () => {
  const makeParagraphNode = (text: string, rev: number) => ({
    type: 'paragraph',
    attrs: { sdBlockId: 'p1', sdBlockRev: rev, paraId: null },
    content: [{ type: 'run', content: [{ type: 'text', text }] }],
  });

  const mockBlocks: FlowBlock[] = [
    { kind: 'paragraph', id: 'p1', runs: [{ text: 'hello', pmStart: 0, pmEnd: 5 } as Run] } as ParagraphBlock,
  ];

  it('returns MISS when no cached entry exists', () => {
    const cache = new FlowBlockCache();
    cache.begin();

    const node = makeParagraphNode('hello', 1);
    const result = cache.get('p1', node);

    expect(result.entry).toBeNull();
  });

  it('returns HIT when sdBlockRev matches', () => {
    const cache = new FlowBlockCache();
    const node = makeParagraphNode('hello', 1);

    // Populate cache
    cache.begin();
    cache.set('p1', JSON.stringify(node), 1, mockBlocks, 0);
    cache.commit();

    // Same node, same rev → HIT
    cache.begin();
    const result = cache.get('p1', node);

    expect(result.entry).not.toBeNull();
    expect(result.entry!.blocks).toBe(mockBlocks);
  });

  it('retains serialized node across fast-path hits so external fallback stays incremental', () => {
    const cache = new FlowBlockCache();
    const node = makeParagraphNode('hello', 5);

    // Render 1: cache is populated with serialized JSON.
    cache.begin();
    cache.set('p1', JSON.stringify(node), 5, mockBlocks, 0);
    cache.commit();

    // Render 2: local-only fast path hit, caller writes lookup payload into next generation.
    cache.begin();
    const fastPathHit = cache.get('p1', node);
    expect(fastPathHit.entry).not.toBeNull();
    cache.set('p1', fastPathHit.nodeJson, fastPathHit.nodeRev, fastPathHit.entry!.blocks, 0);
    cache.commit();

    // Render 3: collaboration/external change mode requires JSON fallback.
    // With unchanged content this should still be a HIT.
    cache.setHasExternalChanges(true);
    cache.begin();
    const externalFallback = cache.get('p1', node);

    expect(externalFallback.entry).not.toBeNull();
  });

  it('returns MISS when sdBlockRev differs', () => {
    const cache = new FlowBlockCache();
    const nodeV1 = makeParagraphNode('hello', 1);
    const nodeV2 = makeParagraphNode('hello world', 2);

    // Populate with v1
    cache.begin();
    cache.set('p1', JSON.stringify(nodeV1), 1, mockBlocks, 0);
    cache.commit();

    // v2 has different rev → MISS
    cache.begin();
    const result = cache.get('p1', nodeV2);

    expect(result.entry).toBeNull();
  });

  it('returns MISS when content changes with same sdBlockRev and externalChanges flag is set', () => {
    const cache = new FlowBlockCache();
    const nodeOriginal = makeParagraphNode('hello', 5);
    const nodeModifiedByYjs = makeParagraphNode('hello world from remote user', 5); // Same rev, different content!

    // Populate cache with original content
    cache.begin();
    cache.set('p1', JSON.stringify(nodeOriginal), 5, mockBlocks, 0);
    cache.commit();

    // Y.js-origin transaction changed content but blockNodePlugin didn't increment sdBlockRev.
    // With the externalChanges flag, the fast path falls through to JSON comparison.
    cache.setHasExternalChanges(true);
    cache.begin();
    const result = cache.get('p1', nodeModifiedByYjs);

    expect(result.entry).toBeNull(); // Correct: JSON comparison catches the content change
  });

  it('returns HIT when content is unchanged even with externalChanges flag', () => {
    const cache = new FlowBlockCache();
    const node = makeParagraphNode('hello', 5);

    cache.begin();
    cache.set('p1', JSON.stringify(node), 5, mockBlocks, 0);
    cache.commit();

    // externalChanges flag is set but content is identical — should still HIT
    cache.setHasExternalChanges(true);
    cache.begin();
    const result = cache.get('p1', node);

    expect(result.entry).not.toBeNull(); // JSON comparison confirms content is same
  });

  it('without externalChanges flag, same sdBlockRev trusts fast path (HIT)', () => {
    const cache = new FlowBlockCache();
    const nodeOriginal = makeParagraphNode('hello', 5);
    const nodeModified = makeParagraphNode('hello world', 5); // Same rev, different content

    cache.begin();
    cache.set('p1', JSON.stringify(nodeOriginal), 5, mockBlocks, 0);
    cache.commit();

    // Without the flag, fast path trusts sdBlockRev → HIT (this is the performance path)
    cache.begin();
    const result = cache.get('p1', nodeModified);

    expect(result.entry).not.toBeNull(); // Fast path HIT — correct for local-only edits
  });

  it('commit() clears externalChanges flag', () => {
    const cache = new FlowBlockCache();
    const nodeOriginal = makeParagraphNode('hello', 5);
    const nodeModified = makeParagraphNode('hello world', 5);

    cache.begin();
    cache.set('p1', JSON.stringify(nodeOriginal), 5, mockBlocks, 0);
    cache.commit();

    // Set flag and commit (which should clear it)
    cache.setHasExternalChanges(true);
    cache.begin();
    cache.set('p1', JSON.stringify(nodeOriginal), 5, mockBlocks, 0);
    cache.commit(); // This clears externalChanges

    // Now query with modified content — flag was cleared, so fast path applies
    cache.begin();
    const result = cache.get('p1', nodeModified);

    expect(result.entry).not.toBeNull(); // Fast path HIT — flag was cleared by commit
  });

  it('returns MISS via JSON fallback when sdBlockRev is unavailable', () => {
    const cache = new FlowBlockCache();
    const nodeNoRev = { type: 'paragraph', attrs: { sdBlockId: 'p1' }, content: [{ type: 'text', text: 'hello' }] };
    const nodeNoRevModified = {
      type: 'paragraph',
      attrs: { sdBlockId: 'p1' },
      content: [{ type: 'text', text: 'hello world' }],
    };

    // Populate without rev
    cache.begin();
    cache.set('p1', JSON.stringify(nodeNoRev), null, mockBlocks, 0);
    cache.commit();

    // Different content, no rev → falls to JSON comparison → MISS
    cache.begin();
    const result = cache.get('p1', nodeNoRevModified);

    expect(result.entry).toBeNull(); // Correct: JSON comparison catches the change
  });

  it('clear() resets all cache state', () => {
    const cache = new FlowBlockCache();
    const node = makeParagraphNode('hello', 1);

    cache.begin();
    cache.set('p1', JSON.stringify(node), 1, mockBlocks, 0);
    cache.commit();

    cache.clear();

    cache.begin();
    const result = cache.get('p1', node);

    expect(result.entry).toBeNull(); // Cache was cleared
  });

  it('commit() discards entries not seen in current render', () => {
    const cache = new FlowBlockCache();
    const nodeA = makeParagraphNode('hello', 1);
    const nodeB = {
      ...makeParagraphNode('world', 1),
      attrs: { ...makeParagraphNode('world', 1).attrs, sdBlockId: 'p2' },
    };

    // Render 1: both paragraphs
    cache.begin();
    cache.set('p1', JSON.stringify(nodeA), 1, mockBlocks, 0);
    cache.set('p2', JSON.stringify(nodeB), 1, mockBlocks, 10);
    cache.commit();

    // Render 2: only p1 (p2 was deleted)
    cache.begin();
    cache.get('p1', nodeA); // access p1
    cache.set('p1', JSON.stringify(nodeA), 1, mockBlocks, 0);
    cache.commit();

    // Render 3: p2 should be gone
    cache.begin();
    const result = cache.get('p2', nodeB);

    expect(result.entry).toBeNull(); // p2 was pruned
  });
});

describe('shiftBlockPositions', () => {
  describe('paragraph blocks', () => {
    it('shifts pmStart and pmEnd in runs', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'hello', pmStart: 10, pmEnd: 15 } as Run, { text: 'world', pmStart: 15, pmEnd: 20 } as Run],
      };

      const shifted = shiftBlockPositions(block, 5) as ParagraphBlock;

      expect(shifted.runs[0].pmStart).toBe(15);
      expect(shifted.runs[0].pmEnd).toBe(20);
      expect(shifted.runs[1].pmStart).toBe(20);
      expect(shifted.runs[1].pmEnd).toBe(25);
    });

    it('handles null pmStart/pmEnd in runs', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'hello', pmStart: null, pmEnd: undefined } as unknown as Run],
      };

      const shifted = shiftBlockPositions(block, 5) as ParagraphBlock;

      expect(shifted.runs[0].pmStart).toBeNull();
      expect(shifted.runs[0].pmEnd).toBeUndefined();
    });

    it('returns a new block instance (does not mutate original)', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'hello', pmStart: 10, pmEnd: 15 } as Run],
      };

      const shifted = shiftBlockPositions(block, 5);

      expect(shifted).not.toBe(block);
      expect((shifted as ParagraphBlock).runs).not.toBe(block.runs);
      expect(block.runs[0].pmStart).toBe(10); // Original unchanged
    });
  });

  describe('image blocks', () => {
    it('shifts pmStart and pmEnd in attrs', () => {
      const block = {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
        attrs: { pmStart: 10, pmEnd: 12 },
      } as unknown as ImageBlock;

      const shifted = shiftBlockPositions(block, 5) as ImageBlock;

      expect((shifted.attrs as Record<string, unknown>).pmStart).toBe(15);
      expect((shifted.attrs as Record<string, unknown>).pmEnd).toBe(17);
    });

    it('handles only pmStart in attrs', () => {
      const block = {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
        attrs: { pmStart: 10 },
      } as unknown as ImageBlock;

      const shifted = shiftBlockPositions(block, 5) as ImageBlock;

      expect((shifted.attrs as Record<string, unknown>).pmStart).toBe(15);
      expect((shifted.attrs as Record<string, unknown>).pmEnd).toBeUndefined();
    });

    it('handles only pmEnd in attrs', () => {
      const block = {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
        attrs: { pmEnd: 12 },
      } as unknown as ImageBlock;

      const shifted = shiftBlockPositions(block, 5) as ImageBlock;

      expect((shifted.attrs as Record<string, unknown>).pmStart).toBeUndefined();
      expect((shifted.attrs as Record<string, unknown>).pmEnd).toBe(17);
    });

    it('preserves other attrs properties', () => {
      const block = {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
        attrs: { pmStart: 10, pmEnd: 12, customProp: 'value', isAnchor: true },
      } as unknown as ImageBlock;

      const shifted = shiftBlockPositions(block, 5) as ImageBlock;

      expect((shifted.attrs as Record<string, unknown>).customProp).toBe('value');
      expect((shifted.attrs as Record<string, unknown>).isAnchor).toBe(true);
    });

    it('returns shallow copy when no attrs positions', () => {
      const block = {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
        attrs: { customProp: 'value' },
      } as unknown as ImageBlock;

      const shifted = shiftBlockPositions(block, 5);

      expect(shifted).not.toBe(block);
      expect(shifted.kind).toBe('image');
    });

    it('returns shallow copy when no attrs', () => {
      const block = {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
      } as ImageBlock;

      const shifted = shiftBlockPositions(block, 5);

      expect(shifted).not.toBe(block);
      expect(shifted.kind).toBe('image');
    });

    it('does not mutate original block', () => {
      const block = {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
        attrs: { pmStart: 10, pmEnd: 12 },
      } as unknown as ImageBlock;

      shiftBlockPositions(block, 5);

      expect((block.attrs as Record<string, unknown>).pmStart).toBe(10);
      expect((block.attrs as Record<string, unknown>).pmEnd).toBe(12);
    });
  });

  describe('drawing blocks', () => {
    it('shifts pmStart and pmEnd in attrs', () => {
      const block = {
        kind: 'drawing',
        id: 'draw1',
        drawingKind: 'vectorShape',
        attrs: { pmStart: 20, pmEnd: 22 },
      } as unknown as DrawingBlock;

      const shifted = shiftBlockPositions(block, -5) as DrawingBlock;

      expect((shifted.attrs as Record<string, unknown>).pmStart).toBe(15);
      expect((shifted.attrs as Record<string, unknown>).pmEnd).toBe(17);
    });

    it('handles negative deltas correctly', () => {
      const block = {
        kind: 'drawing',
        id: 'draw1',
        drawingKind: 'vectorShape',
        attrs: { pmStart: 100, pmEnd: 102 },
      } as unknown as DrawingBlock;

      const shifted = shiftBlockPositions(block, -50) as DrawingBlock;

      expect((shifted.attrs as Record<string, unknown>).pmStart).toBe(50);
      expect((shifted.attrs as Record<string, unknown>).pmEnd).toBe(52);
    });
  });

  describe('blocks with top-level positions', () => {
    it('shifts pmStart and pmEnd at block level', () => {
      const block = {
        kind: 'sectionBreak',
        id: 'sb1',
        pmStart: 100,
        pmEnd: 102,
      } as unknown as FlowBlock;

      const shifted = shiftBlockPositions(block, 10) as FlowBlock & { pmStart: number; pmEnd: number };

      expect(shifted.pmStart).toBe(110);
      expect(shifted.pmEnd).toBe(112);
    });
  });

  describe('blocks without positions', () => {
    it('returns shallow copy for blocks without any position tracking', () => {
      const block = {
        kind: 'pageBreak',
        id: 'pb1',
      } as FlowBlock;

      const shifted = shiftBlockPositions(block, 10);

      expect(shifted).not.toBe(block);
      expect(shifted.kind).toBe('pageBreak');
      expect(shifted.id).toBe('pb1');
    });
  });
});

describe('shiftCachedBlocks', () => {
  it('shifts all blocks in array', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'hello', pmStart: 10, pmEnd: 15 } as Run],
      } as ParagraphBlock,
      {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
        attrs: { pmStart: 20, pmEnd: 22 },
      } as unknown as ImageBlock,
    ];

    const shifted = shiftCachedBlocks(blocks, 5);

    expect(shifted.length).toBe(2);
    expect((shifted[0] as ParagraphBlock).runs[0].pmStart).toBe(15);
    expect(((shifted[1] as ImageBlock).attrs as Record<string, unknown>).pmStart).toBe(25);
  });

  it('returns new array (does not mutate original)', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'hello', pmStart: 10, pmEnd: 15 } as Run],
      } as ParagraphBlock,
    ];

    const shifted = shiftCachedBlocks(blocks, 5);

    expect(shifted).not.toBe(blocks);
    expect((blocks[0] as ParagraphBlock).runs[0].pmStart).toBe(10);
  });

  it('handles empty array', () => {
    const shifted = shiftCachedBlocks([], 5);
    expect(shifted).toEqual([]);
  });

  it('creates copies even with delta of 0', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'image',
        id: 'img1',
        src: 'test.png',
        attrs: { pmStart: 20, pmEnd: 22 },
      } as unknown as ImageBlock,
    ];

    const shifted = shiftCachedBlocks(blocks, 0);

    expect(shifted).not.toBe(blocks);
    expect(shifted[0]).not.toBe(blocks[0]);
  });
});
