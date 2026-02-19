/**
 * Unit tests for resolvePageTokens module
 *
 * Tests the resolution of page number and total page count tokens in paragraph blocks.
 */

import { describe, it, expect } from 'vitest';
import { resolveTokensInBlock } from './resolvePageTokens';
import type { ParagraphBlock, TextRun } from '@superdoc/contracts';

describe('resolveTokensInBlock', () => {
  it('should resolve pageNumber token with correct page number', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-1',
      runs: [
        {
          text: '0',
          token: 'pageNumber',
          fontFamily: 'Arial',
          fontSize: 12,
        } as TextRun,
      ],
    };

    const wasModified = resolveTokensInBlock(block, 5, 10);

    expect(wasModified).toBe(true);
    expect((block.runs[0] as { text?: string }).text).toBe('5');
    expect((block.runs[0] as { token?: string }).token).toBeUndefined();
  });

  it('should resolve totalPageCount token with correct total', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-2',
      runs: [
        {
          text: '0',
          token: 'totalPageCount',
          fontFamily: 'Arial',
          fontSize: 12,
        } as TextRun,
      ],
    };

    const wasModified = resolveTokensInBlock(block, 3, 99);

    expect(wasModified).toBe(true);
    expect((block.runs[0] as { text?: string }).text).toBe('99');
    expect((block.runs[0] as { token?: string }).token).toBeUndefined();
  });

  it('should resolve multiple tokens in the same block', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-3',
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
    };

    const wasModified = resolveTokensInBlock(block, 7, 25);

    expect(wasModified).toBe(true);
    expect((block.runs[0] as { text?: string }).text).toBe('Page ');
    expect((block.runs[1] as { text?: string }).text).toBe('7');
    expect((block.runs[1] as { token?: string }).token).toBeUndefined();
    expect((block.runs[2] as { text?: string }).text).toBe(' of ');
    expect((block.runs[3] as { text?: string }).text).toBe('25');
    expect((block.runs[3] as { token?: string }).token).toBeUndefined();
  });

  it('should not modify block without tokens', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-4',
      runs: [
        {
          text: 'Regular text',
          fontFamily: 'Arial',
          fontSize: 12,
        },
      ],
    };

    const wasModified = resolveTokensInBlock(block, 1, 10);

    expect(wasModified).toBe(false);
    expect((block.runs[0] as { text?: string }).text).toBe('Regular text');
  });

  it('should handle empty runs array', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-5',
      runs: [],
    };

    const wasModified = resolveTokensInBlock(block, 1, 10);

    expect(wasModified).toBe(false);
  });

  it('should handle invalid page number (use fallback)', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-6',
      runs: [
        {
          text: '0',
          token: 'pageNumber',
          fontFamily: 'Arial',
          fontSize: 12,
        } as TextRun,
      ],
    };

    // Test with invalid page number (0)
    const wasModified = resolveTokensInBlock(block, 0, 10);

    expect(wasModified).toBe(true);
    expect((block.runs[0] as { text?: string }).text).toBe('1'); // Should fallback to 1
  });

  it('should handle invalid total pages (use fallback)', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-7',
      runs: [
        {
          text: '0',
          token: 'totalPageCount',
          fontFamily: 'Arial',
          fontSize: 12,
        } as TextRun,
      ],
    };

    // Test with invalid total pages (negative)
    const wasModified = resolveTokensInBlock(block, 1, -5);

    expect(wasModified).toBe(true);
    expect((block.runs[0] as { text?: string }).text).toBe('1'); // Should fallback to 1
  });

  it('should handle tab runs mixed with text runs', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-8',
      runs: [
        {
          text: 'Page ',
          fontFamily: 'Arial',
          fontSize: 12,
        },
        {
          kind: 'tab',
          text: '\t',
        },
        {
          text: '0',
          token: 'pageNumber',
          fontFamily: 'Arial',
          fontSize: 12,
        } as TextRun,
      ],
    };

    const wasModified = resolveTokensInBlock(block, 3, 10);

    expect(wasModified).toBe(true);
    expect((block.runs[0] as { text?: string }).text).toBe('Page ');
    expect((block.runs[1] as { text?: string }).text).toBe('\t');
    expect((block.runs[2] as { text?: string }).text).toBe('3');
    expect((block.runs[2] as { token?: string }).token).toBeUndefined();
  });

  it('should not resolve pageReference tokens (handled separately)', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-9',
      runs: [
        {
          text: '0',
          token: 'pageReference',
          fontFamily: 'Arial',
          fontSize: 12,
          pageRefMetadata: {
            bookmarkId: 'bookmark1',
            instruction: 'PAGEREF bookmark1',
          },
        } as TextRun,
      ],
    };

    const wasModified = resolveTokensInBlock(block, 5, 10);

    // pageReference tokens should not be touched by this function
    expect(wasModified).toBe(false);
    expect((block.runs[0] as { text?: string }).text).toBe('0');
    expect((block.runs[0] as { token?: string }).token).toBe('pageReference');
  });

  it('should handle large page numbers', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-10',
      runs: [
        {
          text: '0',
          token: 'pageNumber',
          fontFamily: 'Arial',
          fontSize: 12,
        } as TextRun,
      ],
    };

    const wasModified = resolveTokensInBlock(block, 999, 1000);

    expect(wasModified).toBe(true);
    expect((block.runs[0] as { text?: string }).text).toBe('999');
  });

  it('should preserve run properties when resolving tokens', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'test-11',
      runs: [
        {
          text: '0',
          token: 'pageNumber',
          fontFamily: 'Times New Roman',
          fontSize: 14,
          bold: true,
          italic: true,
          color: '#FF0000',
          pmStart: 10,
          pmEnd: 11,
        } as TextRun,
      ],
    };

    const wasModified = resolveTokensInBlock(block, 2, 5);

    expect(wasModified).toBe(true);
    expect((block.runs[0] as { text?: string }).text).toBe('2');
    expect((block.runs[0] as { token?: string }).token).toBeUndefined();
    // Verify other properties are preserved
    expect((block.runs[0] as { fontFamily?: string }).fontFamily).toBe('Times New Roman');
    expect((block.runs[0] as { fontSize?: number }).fontSize).toBe(14);
    expect((block.runs[0] as { bold?: boolean }).bold).toBe(true);
    expect((block.runs[0] as { italic?: boolean }).italic).toBe(true);
    expect((block.runs[0] as { color?: string }).color).toBe('#FF0000');
    expect((block.runs[0] as { pmStart?: number }).pmStart).toBe(10);
    expect((block.runs[0] as { pmEnd?: number }).pmEnd).toBe(11);
  });
});
