/**
 * Unit tests for resolvePageNumberTokens module
 *
 * Tests the resolution of page number and total page count tokens with
 * section-aware numbering context support.
 */

import { describe, it, expect } from 'bun:test';
import { resolvePageNumberTokens } from './resolvePageTokens';
import type { Layout, FlowBlock, ParagraphBlock, Measure, TextRun } from '@superdoc/contracts';
import type { NumberingContext } from './resolvePageTokens';

describe('resolvePageNumberTokens', () => {
  describe('basic token resolution', () => {
    it('should resolve pageNumber tokens with display page text', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 10,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 1,
            displayText: 'i', // Roman numeral
            sectionIndex: 0,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      expect(result.affectedBlockIds.size).toBe(1);
      expect(result.affectedBlockIds.has('para-1')).toBe(true);

      const updatedBlock = result.updatedBlocks.get('para-1') as ParagraphBlock;
      expect(updatedBlock).toBeDefined();
      expect(updatedBlock.runs[1].text).toBe('i');
      expect(updatedBlock.runs[1].token).toBeUndefined();

      // Verify original block is not mutated
      expect((blocks[0] as ParagraphBlock).runs[1].text).toBe('0');
      expect((blocks[0] as ParagraphBlock).runs[1].token).toBe('pageNumber');
    });

    it('should resolve totalPageCount tokens', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 99,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 1,
            displayText: '1',
            sectionIndex: 0,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      expect(result.affectedBlockIds.size).toBe(1);

      const updatedBlock = result.updatedBlocks.get('para-1') as ParagraphBlock;
      expect(updatedBlock.runs[1].text).toBe('99');
      expect(updatedBlock.runs[1].token).toBeUndefined();
    });

    it('should resolve both pageNumber and totalPageCount in same paragraph', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 25,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 7,
            displayText: '7',
            sectionIndex: 0,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      const updatedBlock = result.updatedBlocks.get('para-1') as ParagraphBlock;
      expect(updatedBlock.runs[1].text).toBe('7');
      expect(updatedBlock.runs[3].text).toBe('25');
    });
  });

  describe('section-aware numbering', () => {
    it('should use display page text from numbering context for section with restart', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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
        {
          kind: 'paragraph',
          id: 'para-3',
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

      const measures: Measure[] = [
        { kind: 'paragraph', lines: [], totalHeight: 0 },
        { kind: 'paragraph', lines: [], totalHeight: 0 },
        { kind: 'paragraph', lines: [], totalHeight: 0 },
      ];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
          {
            number: 2,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-2',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
          {
            number: 3,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-3',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      // Section 0: pages 1-2 with lowercase roman (i, ii)
      // Section 1: page 3 with restart at 1 in decimal format
      const numberingCtx: NumberingContext = {
        totalPages: 3,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 1,
            displayText: 'i',
            sectionIndex: 0,
          },
          {
            physicalPage: 2,
            displayNumber: 2,
            displayText: 'ii',
            sectionIndex: 0,
          },
          {
            physicalPage: 3,
            displayNumber: 1,
            displayText: '1',
            sectionIndex: 1,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      expect(result.affectedBlockIds.size).toBe(3);

      const block1 = result.updatedBlocks.get('para-1') as ParagraphBlock;
      expect(block1.runs[0].text).toBe('i');

      const block2 = result.updatedBlocks.get('para-2') as ParagraphBlock;
      expect(block2.runs[0].text).toBe('ii');

      const block3 = result.updatedBlocks.get('para-3') as ParagraphBlock;
      expect(block3.runs[0].text).toBe('1');
    });
  });

  describe('optimization and edge cases', () => {
    it('should skip blocks without page tokens', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [
            {
              text: 'Regular text',
              fontFamily: 'Arial',
              fontSize: 12,
            },
          ],
        } as ParagraphBlock,
      ];

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 1,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 1,
            displayText: '1',
            sectionIndex: 0,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      expect(result.affectedBlockIds.size).toBe(0);
      expect(result.updatedBlocks.size).toBe(0);
    });

    it('should handle hasPageTokens flag optimization', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [
            {
              text: 'Text without tokens',
              fontFamily: 'Arial',
              fontSize: 12,
            },
          ],
          attrs: {
            hasPageTokens: false,
          },
        } as ParagraphBlock,
      ];

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 1,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 1,
            displayText: '1',
            sectionIndex: 0,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      // Should skip due to hasPageTokens: false optimization
      expect(result.affectedBlockIds.size).toBe(0);
    });

    it('should handle empty layout', () => {
      const blocks: FlowBlock[] = [];
      const measures: Measure[] = [];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 0,
        displayPages: [],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      expect(result.affectedBlockIds.size).toBe(0);
      expect(result.updatedBlocks.size).toBe(0);
    });

    it('should handle invalid numbering context gracefully', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const invalidNumberingCtx: NumberingContext = {
        totalPages: 0,
        displayPages: [],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, invalidNumberingCtx);

      // Should return empty result due to invalid context
      expect(result.affectedBlockIds.size).toBe(0);
      expect(result.updatedBlocks.size).toBe(0);
    });

    it('should not mutate original blocks', () => {
      const originalRun = {
        text: '0',
        token: 'pageNumber',
        fontFamily: 'Arial',
        fontSize: 12,
        bold: true,
        color: '#FF0000',
      } as TextRun;

      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
          runs: [originalRun],
        } as ParagraphBlock,
      ];

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 5,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 1,
            displayText: '1',
            sectionIndex: 0,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      // Original block should not be mutated
      expect(originalRun.text).toBe('0');
      expect(originalRun.token).toBe('pageNumber');

      // Updated block should have resolved token
      const updatedBlock = result.updatedBlocks.get('para-1') as ParagraphBlock;
      expect(updatedBlock.runs[0].text).toBe('1');
      expect(updatedBlock.runs[0].token).toBeUndefined();

      // Other properties should be preserved
      expect(updatedBlock.runs[0].bold).toBe(true);
      expect(updatedBlock.runs[0].color).toBe('#FF0000');
    });

    it('should skip non-paragraph fragments', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'image',
          id: 'img-1',
          src: 'test.png',
        },
      ];

      const measures: Measure[] = [{ kind: 'image', width: 100, height: 100 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'image',
                blockId: 'img-1',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 1,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 1,
            displayText: '1',
            sectionIndex: 0,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      expect(result.affectedBlockIds.size).toBe(0);
    });

    it('should handle missing display page info gracefully', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      // Numbering context with no display pages
      const numberingCtx: NumberingContext = {
        totalPages: 1,
        displayPages: [], // Empty array
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      // Should handle gracefully and not process blocks
      expect(result.affectedBlockIds.size).toBe(0);
    });

    it('should process each block only once even if it spans multiple pages', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 1,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 5,
                x: 0,
                y: 0,
                width: 100,
                continuesOnNext: true,
              },
            ],
          },
          {
            number: 2,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 5,
                toLine: 10,
                x: 0,
                y: 0,
                width: 100,
                continuesFromPrev: true,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 2,
        displayPages: [
          {
            physicalPage: 1,
            displayNumber: 1,
            displayText: '1',
            sectionIndex: 0,
          },
          {
            physicalPage: 2,
            displayNumber: 2,
            displayText: '2',
            sectionIndex: 0,
          },
        ],
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      // Block should only be processed once
      expect(result.affectedBlockIds.size).toBe(1);
      expect(result.updatedBlocks.size).toBe(1);

      // Should use display text from first page where block appears
      const updatedBlock = result.updatedBlocks.get('para-1') as ParagraphBlock;
      expect(updatedBlock.runs[0].text).toBe('1');
    });
  });

  describe('convergence scenarios', () => {
    it('should handle digit count transitions (9 -> 10)', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 10,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 15,
        displayPages: Array.from({ length: 15 }, (_, i) => ({
          physicalPage: i + 1,
          displayNumber: i + 1,
          displayText: String(i + 1),
          sectionIndex: 0,
        })),
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      const updatedBlock = result.updatedBlocks.get('para-1') as ParagraphBlock;
      expect(updatedBlock.runs[1].text).toBe('10'); // Two digits
    });

    it('should handle digit count transitions (99 -> 100)', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'para-1',
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

      const measures: Measure[] = [{ kind: 'paragraph', lines: [], totalHeight: 0 }];

      const layout: Layout = {
        pageSize: { w: 612, h: 792 },
        pages: [
          {
            number: 100,
            fragments: [
              {
                kind: 'para',
                blockId: 'para-1',
                fromLine: 0,
                toLine: 1,
                x: 0,
                y: 0,
                width: 100,
              },
            ],
          },
        ],
      };

      const numberingCtx: NumberingContext = {
        totalPages: 105,
        displayPages: Array.from({ length: 105 }, (_, i) => ({
          physicalPage: i + 1,
          displayNumber: i + 1,
          displayText: String(i + 1),
          sectionIndex: 0,
        })),
      };

      const result = resolvePageNumberTokens(layout, blocks, measures, numberingCtx);

      const updatedBlock = result.updatedBlocks.get('para-1') as ParagraphBlock;
      expect(updatedBlock.runs[0].text).toBe('100'); // Three digits
    });
  });
});
