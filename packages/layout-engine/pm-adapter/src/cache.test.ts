import { describe, it, expect } from 'vitest';
import { shiftBlockPositions, shiftCachedBlocks } from './cache.js';
import type { FlowBlock, ParagraphBlock, ImageBlock, DrawingBlock, Run } from '@superdoc/contracts';

describe('shiftBlockPositions', () => {
  describe('paragraph blocks', () => {
    it('shifts pmStart and pmEnd in runs', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [
          { text: 'hello', pmStart: 10, pmEnd: 15 } as Run,
          { text: 'world', pmStart: 15, pmEnd: 20 } as Run,
        ],
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
