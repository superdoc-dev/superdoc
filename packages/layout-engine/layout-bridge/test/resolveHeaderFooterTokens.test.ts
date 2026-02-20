/**
 * Unit tests for resolveHeaderFooterTokens module
 *
 * Tests the resolution of page number tokens in header and footer blocks.
 */

import { describe, it, expect } from 'vitest';
import { resolveHeaderFooterTokens, cloneHeaderFooterBlocks } from '../src/resolveHeaderFooterTokens';
import type { FlowBlock, ParagraphBlock, TextRun } from '@superdoc/contracts';

describe('resolveHeaderFooterTokens', () => {
  it('should resolve pageNumber token in header blocks', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'header-1',
        runs: [
          {
            text: 'Page ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: '0',
            token: 'pageNumber',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    resolveHeaderFooterTokens(blocks, 3, 10);

    const block = blocks[0] as ParagraphBlock;
    expect(block.runs[1].text).toBe('3');
    // Token is preserved so painter can re-resolve at render time
    expect((block.runs[1] as TextRun).token).toBe('pageNumber');
  });

  it('should use provided pageNumberText when resolving pageNumber tokens', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'header-dash',
        runs: [
          {
            text: '0',
            token: 'pageNumber',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    resolveHeaderFooterTokens(blocks, 1, 10, '-1-');

    const block = blocks[0] as ParagraphBlock;
    expect(block.runs[0].text).toBe('-1-');
    expect((block.runs[0] as TextRun).token).toBe('pageNumber');
  });

  it('should resolve totalPageCount token in footer blocks', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'footer-1',
        runs: [
          {
            text: 'Total: ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: '0',
            token: 'totalPageCount',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    resolveHeaderFooterTokens(blocks, 5, 99);

    const block = blocks[0] as ParagraphBlock;
    expect(block.runs[1].text).toBe('99');
    // Token is preserved so painter can re-resolve at render time
    expect((block.runs[1] as TextRun).token).toBe('totalPageCount');
  });

  it('should resolve both tokens in the same block', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'header-2',
        runs: [
          {
            text: 'Page ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: '0',
            token: 'pageNumber',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
          {
            text: ' of ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: '0',
            token: 'totalPageCount',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    resolveHeaderFooterTokens(blocks, 7, 25);

    const block = blocks[0] as ParagraphBlock;
    expect(block.runs[1].text).toBe('7');
    // Tokens preserved for painter
    expect((block.runs[1] as TextRun).token).toBe('pageNumber');
    expect(block.runs[3].text).toBe('25');
    expect((block.runs[3] as TextRun).token).toBe('totalPageCount');
  });

  it('should handle multiple paragraph blocks', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'header-3a',
        runs: [
          {
            text: '0',
            token: 'pageNumber',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
      {
        kind: 'paragraph',
        id: 'header-3b',
        runs: [
          {
            text: '0',
            token: 'totalPageCount',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    resolveHeaderFooterTokens(blocks, 4, 12);

    const block1 = blocks[0] as ParagraphBlock;
    const block2 = blocks[1] as ParagraphBlock;
    expect(block1.runs[0].text).toBe('4');
    // Tokens preserved for painter
    expect((block1.runs[0] as TextRun).token).toBe('pageNumber');
    expect(block2.runs[0].text).toBe('12');
    expect((block2.runs[0] as TextRun).token).toBe('totalPageCount');
  });

  it('should handle empty blocks array', () => {
    const blocks: FlowBlock[] = [];

    // Should not throw
    expect(() => {
      resolveHeaderFooterTokens(blocks, 1, 10);
    }).not.toThrow();
  });

  it('should handle invalid page number (use fallback)', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'header-4',
        runs: [
          {
            text: '0',
            token: 'pageNumber',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    resolveHeaderFooterTokens(blocks, -1, 10);

    const block = blocks[0] as ParagraphBlock;
    expect(block.runs[0].text).toBe('1'); // Should fallback to 1
  });

  it('should handle invalid total pages (use fallback)', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'header-5',
        runs: [
          {
            text: '0',
            token: 'totalPageCount',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    resolveHeaderFooterTokens(blocks, 1, 0);

    const block = blocks[0] as ParagraphBlock;
    expect(block.runs[0].text).toBe('1'); // Should fallback to 1
  });

  it('should skip non-paragraph blocks', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'image',
        id: 'img-1',
        src: 'test.jpg',
      },
      {
        kind: 'paragraph',
        id: 'header-6',
        runs: [
          {
            text: '0',
            token: 'pageNumber',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    resolveHeaderFooterTokens(blocks, 2, 5);

    // Image block should be unchanged
    expect(blocks[0].kind).toBe('image');
    // Paragraph block should have token resolved
    const block = blocks[1] as ParagraphBlock;
    expect(block.runs[0].text).toBe('2');
  });
});

describe('cloneHeaderFooterBlocks', () => {
  it('should create deep copy of paragraph blocks', () => {
    const original: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-1',
        runs: [
          {
            text: 'Original text',
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
        attrs: {
          alignment: 'center',
        },
      } as ParagraphBlock,
    ];

    const cloned = cloneHeaderFooterBlocks(original);

    // Verify it's a different array
    expect(cloned).not.toBe(original);
    expect(cloned[0]).not.toBe(original[0]);

    // Verify runs are cloned
    const originalBlock = original[0] as ParagraphBlock;
    const clonedBlock = cloned[0] as ParagraphBlock;
    expect(clonedBlock.runs).not.toBe(originalBlock.runs);
    expect(clonedBlock.runs[0]).not.toBe(originalBlock.runs[0]);

    // Verify content is the same
    expect(clonedBlock.id).toBe(originalBlock.id);
    expect(clonedBlock.runs[0].text).toBe(originalBlock.runs[0].text);
    expect(clonedBlock.attrs).toEqual(originalBlock.attrs);
  });

  it('should mutate clone without affecting original', () => {
    const original: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'test-2',
        runs: [
          {
            text: '0',
            token: 'pageNumber',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    const cloned = cloneHeaderFooterBlocks(original);

    // Resolve tokens in cloned version
    resolveHeaderFooterTokens(cloned, 5, 10);

    // Original should be unchanged
    const originalBlock = original[0] as ParagraphBlock;
    expect(originalBlock.runs[0].text).toBe('0');
    expect((originalBlock.runs[0] as TextRun).token).toBe('pageNumber');

    // Cloned should be modified (text updated, token preserved for painter)
    const clonedBlock = cloned[0] as ParagraphBlock;
    expect(clonedBlock.runs[0].text).toBe('5');
    expect((clonedBlock.runs[0] as TextRun).token).toBe('pageNumber');
  });

  it('should handle empty blocks array', () => {
    const original: FlowBlock[] = [];
    const cloned = cloneHeaderFooterBlocks(original);

    expect(cloned).toEqual([]);
    expect(cloned).not.toBe(original);
  });

  it('should clone non-paragraph blocks with shallow copy', () => {
    const original: FlowBlock[] = [
      {
        kind: 'image',
        id: 'img-1',
        src: 'test.jpg',
        width: 100,
        height: 100,
      },
    ];

    const cloned = cloneHeaderFooterBlocks(original);

    // Verify it's a different array and different object
    expect(cloned).not.toBe(original);
    expect(cloned[0]).not.toBe(original[0]);

    // Verify content is the same
    expect(cloned[0]).toEqual(original[0]);
  });

  it('should clone mixed block types', () => {
    const original: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: 'para-1',
        runs: [
          {
            text: 'Text',
            fontFamily: 'Arial',
            fontSize: 12,
          },
        ],
      } as ParagraphBlock,
      {
        kind: 'image',
        id: 'img-1',
        src: 'test.jpg',
      },
      {
        kind: 'paragraph',
        id: 'para-2',
        runs: [
          {
            text: '0',
            token: 'pageNumber',
            fontFamily: 'Arial',
            fontSize: 12,
          } as TextRun,
        ],
      } as ParagraphBlock,
    ];

    const cloned = cloneHeaderFooterBlocks(original);

    expect(cloned.length).toBe(3);
    expect(cloned[0].kind).toBe('paragraph');
    expect(cloned[1].kind).toBe('image');
    expect(cloned[2].kind).toBe('paragraph');

    // Verify paragraph blocks have cloned runs
    const clonedBlock1 = cloned[0] as ParagraphBlock;
    const originalBlock1 = original[0] as ParagraphBlock;
    expect(clonedBlock1.runs).not.toBe(originalBlock1.runs);
  });
});
