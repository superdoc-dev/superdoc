import { describe, it, expect } from 'bun:test';
import { findWordBoundaries, findParagraphBoundaries } from '../src/index.ts';
import type { FlowBlock } from '@superdoc/contracts';

describe('findWordBoundaries', () => {
  it('selects a word in the middle of text', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world test', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 16 }],
      },
    ];

    // Click in the middle of 'world' (position 7-8)
    const result = findWordBoundaries(blocks, 8);
    expect(result).toEqual({ from: 6, to: 11 }); // 'world'
  });

  it('selects a word at the start of text', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 11 }],
      },
    ];

    // Click in 'Hello'
    const result = findWordBoundaries(blocks, 2);
    expect(result).toEqual({ from: 0, to: 5 }); // 'Hello'
  });

  it('selects a word at the end of text', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 11 }],
      },
    ];

    // Click in 'world'
    const result = findWordBoundaries(blocks, 9);
    expect(result).toEqual({ from: 6, to: 11 }); // 'world'
  });

  it('handles multiple runs', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [
          { text: 'Hello ', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 6 },
          { text: 'world', fontFamily: 'Arial', fontSize: 16, pmStart: 6, pmEnd: 11 },
        ],
      },
    ];

    // Click in 'world' (second run)
    const result = findWordBoundaries(blocks, 8);
    expect(result).toEqual({ from: 6, to: 11 }); // 'world'
  });

  it('selects whitespace when clicking on space', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello   world', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 13 }],
      },
    ];

    // Click on the spaces between words
    const result = findWordBoundaries(blocks, 6);
    expect(result).toBeDefined();
    // Should select the whitespace region
    expect(result!.from).toBeLessThanOrEqual(6);
    expect(result!.to).toBeGreaterThan(6);
  });

  it('handles punctuation correctly', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello, world!', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 13 }],
      },
    ];

    // Click in 'world' (before the !)
    const result = findWordBoundaries(blocks, 8);
    expect(result).toEqual({ from: 7, to: 12 }); // 'world'
  });

  it('handles Unicode characters', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello 世界 test', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 14 }],
      },
    ];

    // Click in the Chinese characters
    const result = findWordBoundaries(blocks, 7);
    expect(result).toBeDefined();
    expect(result!.from).toBe(6);
    expect(result!.to).toBe(8);
  });

  it('handles empty paragraph', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: '', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 0 }],
      },
    ];

    const result = findWordBoundaries(blocks, 0);
    expect(result).toBeNull();
  });

  it('returns null for position outside block range', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 11 }],
      },
    ];

    const result = findWordBoundaries(blocks, 100);
    expect(result).toBeNull();
  });

  it('handles image blocks gracefully', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'image',
        id: 'test-image',
        src: 'test.jpg',
      },
    ];

    const result = findWordBoundaries(blocks, 0);
    expect(result).toBeNull();
  });

  it('handles multiple blocks', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'block-1',
        runs: [{ text: 'First paragraph', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 15 }],
      },
      {
        kind: 'paragraph',
        id: 'block-2',
        runs: [{ text: 'Second paragraph', fontFamily: 'Arial', fontSize: 16, pmStart: 15, pmEnd: 31 }],
      },
    ];

    // Click in 'Second'
    const result = findWordBoundaries(blocks, 17);
    expect(result).toEqual({ from: 15, to: 21 }); // 'Second'
  });
});

describe('findParagraphBoundaries', () => {
  it('selects entire paragraph for single block', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 11 }],
      },
    ];

    const result = findParagraphBoundaries(blocks, 5);
    expect(result).toEqual({ from: 0, to: 11 });
  });

  it('selects entire paragraph with multiple runs', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [
          { text: 'Hello ', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 6 },
          { text: 'world ', fontFamily: 'Arial', fontSize: 16, pmStart: 6, pmEnd: 12 },
          { text: 'test', fontFamily: 'Arial', fontSize: 16, pmStart: 12, pmEnd: 16 },
        ],
      },
    ];

    const result = findParagraphBoundaries(blocks, 8);
    expect(result).toEqual({ from: 0, to: 16 });
  });

  it('selects correct paragraph in multi-block document', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'block-1',
        runs: [{ text: 'First paragraph', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 15 }],
      },
      {
        kind: 'paragraph',
        id: 'block-2',
        runs: [{ text: 'Second paragraph', fontFamily: 'Arial', fontSize: 16, pmStart: 15, pmEnd: 31 }],
      },
      {
        kind: 'paragraph',
        id: 'block-3',
        runs: [{ text: 'Third paragraph', fontFamily: 'Arial', fontSize: 16, pmStart: 31, pmEnd: 46 }],
      },
    ];

    // Click in second paragraph
    const result = findParagraphBoundaries(blocks, 20);
    expect(result).toEqual({ from: 15, to: 31 });
  });

  it('handles position at start of paragraph', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 11 }],
      },
    ];

    const result = findParagraphBoundaries(blocks, 0);
    expect(result).toEqual({ from: 0, to: 11 });
  });

  it('handles position at end of paragraph', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 11 }],
      },
    ];

    const result = findParagraphBoundaries(blocks, 11);
    expect(result).toEqual({ from: 0, to: 11 });
  });

  it('handles empty paragraph', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: '', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 0 }],
      },
    ];

    const result = findParagraphBoundaries(blocks, 0);
    expect(result).toEqual({ from: 0, to: 0 });
  });

  it('returns null for position outside block range', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 11 }],
      },
    ];

    const result = findParagraphBoundaries(blocks, 100);
    expect(result).toBeNull();
  });

  it('returns null for image block without PM positions', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'image',
        id: 'test-image',
        src: 'test.jpg',
      },
    ];

    const result = findParagraphBoundaries(blocks, 0);
    expect(result).toBeNull();
  });

  it('handles blocks without pmStart/pmEnd', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-block',
        runs: [{ text: 'Hello world', fontFamily: 'Arial', fontSize: 16 }],
      },
    ];

    const result = findParagraphBoundaries(blocks, 5);
    // Should still work with fallback to 0
    expect(result).toBeDefined();
  });

  it('does not match image when pos is outside paragraph ranges (mixed content)', () => {
    const blocks: FlowBlock[] = [
      // Image first (no PM mapping available here)
      { kind: 'image', id: 'img-1', src: 'img.jpg' },
      // Paragraph starting at 10
      {
        kind: 'paragraph',
        id: 'block-1',
        runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 16, pmStart: 10, pmEnd: 15 }],
      },
    ];

    // Position clearly outside the paragraph range [10,15)
    const outOfRange = 5;
    const result = findParagraphBoundaries(blocks, outOfRange);
    expect(result).toBeNull();

    // Position inside the paragraph should select the paragraph, not the image
    const insidePara = 12;
    const result2 = findParagraphBoundaries(blocks, insidePara);
    expect(result2).toEqual({ from: 10, to: 15 });
  });
});
