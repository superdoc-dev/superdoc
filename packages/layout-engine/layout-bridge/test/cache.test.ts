import { describe, it, expect, beforeEach } from 'vitest';
import { MeasureCache } from '../src/cache';
import type { FlowBlock, ImageRun, TableBlock, TableCell } from '@superdoc/contracts';

const block = (id: string, text: string): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 16 }],
});

const imageRun = (src: string, width: number, height: number): ImageRun => ({
  kind: 'image',
  src,
  width,
  height,
});

const blockWithImage = (id: string, imgRun: ImageRun): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [imgRun],
});

/**
 * Creates a table block with specified cell content for testing.
 * Supports both new multi-block cells and legacy single paragraph cells.
 */
const tableBlock = (id: string, cellContents: string[][], useMultiBlock = false): TableBlock => ({
  kind: 'table',
  id,
  rows: cellContents.map((rowCells, rowIndex) => ({
    id: `${id}-row-${rowIndex}`,
    cells: rowCells.map((cellText, cellIndex) => {
      const cellId = `${id}-cell-${rowIndex}-${cellIndex}`;
      const paragraph = {
        kind: 'paragraph' as const,
        id: `${cellId}-para`,
        runs: [{ text: cellText, fontFamily: 'Arial', fontSize: 12 }],
      };

      const cell: TableCell = {
        id: cellId,
      };

      if (useMultiBlock) {
        cell.blocks = [paragraph];
      } else {
        cell.paragraph = paragraph;
      }

      return cell;
    }),
  })),
});

describe('MeasureCache', () => {
  let cache: MeasureCache<{ totalHeight: number }>;

  beforeEach(() => {
    cache = new MeasureCache();
  });

  it('stores and retrieves cached values', () => {
    const item = block('0-paragraph', 'hello');
    cache.set(item, 400, 600, { totalHeight: 20 });
    expect(cache.get(item, 400, 600)?.totalHeight).toBe(20);
    expect(cache.get(item, 300, 600)).toBeUndefined();
    expect(cache.get(item, 400, 500)).toBeUndefined();
  });

  it('invalidates entries by block id', () => {
    const item = block('0-paragraph', 'hello');
    cache.set(item, 400, 600, { totalHeight: 20 });
    cache.invalidate(['0-paragraph']);
    expect(cache.get(item, 400, 600)).toBeUndefined();
  });

  it('clears all entries', () => {
    const item = block('0-paragraph', 'hello');
    cache.set(item, 400, 600, { totalHeight: 20 });
    cache.clear();
    expect(cache.get(item, 400, 600)).toBeUndefined();
  });

  describe('edge cases', () => {
    it('handles null blocks in get()', () => {
      expect(cache.get(null as any, 100, 200)).toBeUndefined();
    });

    it('handles undefined blocks in get()', () => {
      expect(cache.get(undefined as any, 100, 200)).toBeUndefined();
    });

    it('handles blocks without ID', () => {
      const blockWithoutId = { kind: 'paragraph', runs: [] } as any;
      expect(cache.get(blockWithoutId, 100, 200)).toBeUndefined();
    });

    it('handles NaN dimensions', () => {
      const item = block('block1', 'test');
      cache.set(item, NaN, 200, { totalHeight: 10 });
      expect(cache.get(item, NaN, 200)).toEqual({ totalHeight: 10 });
      // NaN should be converted to 0
      expect(cache.get(item, 0, 200)).toEqual({ totalHeight: 10 });
    });

    it('handles Infinity dimensions', () => {
      const item = block('block1', 'test');
      cache.set(item, Infinity, 200, { totalHeight: 10 });
      expect(cache.get(item, Infinity, 200)).toEqual({ totalHeight: 10 });
      // Infinity should be converted to 0
      expect(cache.get(item, 0, 200)).toEqual({ totalHeight: 10 });
    });

    it('handles negative dimensions', () => {
      const item = block('block1', 'test');
      cache.set(item, -100, -200, { totalHeight: 10 });
      // Negative values should be clamped to 0
      expect(cache.get(item, 0, 0)).toEqual({ totalHeight: 10 });
    });

    it('handles extremely large dimension values', () => {
      const item = block('block1', 'test');
      cache.set(item, 10_000_000, 10_000_000, { totalHeight: 10 });
      // Values should be clamped to MAX_DIMENSION (1_000_000)
      expect(cache.get(item, 1_000_000, 1_000_000)).toEqual({ totalHeight: 10 });
    });

    it('invalidates with empty array', () => {
      const item = block('block1', 'test');
      cache.set(item, 100, 200, { totalHeight: 10 });
      cache.invalidate([]);
      expect(cache.get(item, 100, 200)).toEqual({ totalHeight: 10 });
    });

    it('invalidates with non-existent block IDs', () => {
      const item = block('block1', 'test');
      cache.set(item, 100, 200, { totalHeight: 10 });
      cache.invalidate(['nonexistent']);
      expect(cache.get(item, 100, 200)).toEqual({ totalHeight: 10 });
    });

    it('tracks stats correctly across operations', () => {
      const item = block('block1', 'test');

      cache.set(item, 100, 200, { totalHeight: 10 });
      let stats = cache.getStats();
      expect(stats.sets).toBe(1);

      cache.get(item, 100, 200); // hit
      cache.get(item, 200, 300); // miss

      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
    });

    it('handles fractional dimensions by flooring', () => {
      const item = block('block1', 'test');
      cache.set(item, 100.7, 200.9, { totalHeight: 10 });
      // Fractional values should be floored
      expect(cache.get(item, 100, 200)).toEqual({ totalHeight: 10 });
      expect(cache.get(item, 100.3, 200.5)).toEqual({ totalHeight: 10 });
    });

    it('handles null blocks in set() gracefully', () => {
      expect(() => cache.set(null as any, 100, 200, { totalHeight: 10 })).not.toThrow();
      // Should not be retrievable
      expect(cache.get(null as any, 100, 200)).toBeUndefined();
    });

    it('handles undefined blocks in set() gracefully', () => {
      expect(() => cache.set(undefined as any, 100, 200, { totalHeight: 10 })).not.toThrow();
      // Should not be retrievable
      expect(cache.get(undefined as any, 100, 200)).toBeUndefined();
    });
  });

  describe('image run caching', () => {
    it('creates different cache keys for images with different dimensions', () => {
      const block1 = blockWithImage('p1', imageRun('data:image/png;base64,abc', 100, 50));
      const block2 = blockWithImage('p1', imageRun('data:image/png;base64,abc', 200, 100));

      cache.set(block1, 400, 600, { totalHeight: 20 });
      // Different dimensions should result in cache miss
      expect(cache.get(block2, 400, 600)).toBeUndefined();
    });

    it('creates cache hit for images with same dimensions', () => {
      const block1 = blockWithImage('p1', imageRun('data:image/png;base64,abc', 100, 50));
      const block2 = blockWithImage('p1', imageRun('data:image/png;base64,abc', 100, 50));

      cache.set(block1, 400, 600, { totalHeight: 20 });
      // Same dimensions should result in cache hit
      expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 20 });
    });

    it('creates different cache keys for images with different sources', () => {
      const block1 = blockWithImage('p1', imageRun('data:image/png;base64,abc', 100, 50));
      const block2 = blockWithImage('p1', imageRun('data:image/png;base64,xyz', 100, 50));

      cache.set(block1, 400, 600, { totalHeight: 20 });
      // Different src should result in cache miss
      expect(cache.get(block2, 400, 600)).toBeUndefined();
    });

    it('uses first 50 chars of src for hash (long sources)', () => {
      const longSrc1 = 'data:image/svg+xml;base64,' + 'A'.repeat(100);
      const longSrc2 = 'data:image/svg+xml;base64,' + 'A'.repeat(100);
      // These should match because first 50 chars are the same
      const block1 = blockWithImage('p1', imageRun(longSrc1, 100, 50));
      const block2 = blockWithImage('p1', imageRun(longSrc2, 100, 50));

      cache.set(block1, 400, 600, { totalHeight: 20 });
      expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 20 });
    });

    it('differentiates when first 50 chars differ (long sources)', () => {
      const longSrc1 = 'data:image/svg+xml;base64,AAAA' + 'X'.repeat(100);
      const longSrc2 = 'data:image/svg+xml;base64,BBBB' + 'X'.repeat(100);
      // First 50 chars differ, should be cache miss
      const block1 = blockWithImage('p1', imageRun(longSrc1, 100, 50));
      const block2 = blockWithImage('p1', imageRun(longSrc2, 100, 50));

      cache.set(block1, 400, 600, { totalHeight: 20 });
      expect(cache.get(block2, 400, 600)).toBeUndefined();
    });

    it('handles paragraphs with mixed text and image runs', () => {
      const mixedBlock1: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [
          { text: 'Hello ', fontFamily: 'Arial', fontSize: 12 },
          imageRun('data:image/png;base64,abc', 100, 50),
          { text: ' World', fontFamily: 'Arial', fontSize: 12 },
        ],
      };
      const mixedBlock2: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [
          { text: 'Hello ', fontFamily: 'Arial', fontSize: 12 },
          imageRun('data:image/png;base64,abc', 200, 100), // Different dimensions
          { text: ' World', fontFamily: 'Arial', fontSize: 12 },
        ],
      };

      cache.set(mixedBlock1, 400, 600, { totalHeight: 30 });
      // Image dimensions changed, should be cache miss
      expect(cache.get(mixedBlock2, 400, 600)).toBeUndefined();
    });

    it('handles paragraphs with multiple images', () => {
      const multiImageBlock1: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [imageRun('img1.png', 100, 50), imageRun('img2.png', 80, 40)],
      };
      const multiImageBlock2: FlowBlock = {
        kind: 'paragraph',
        id: 'p1',
        runs: [
          imageRun('img1.png', 100, 50),
          imageRun('img2.png', 80, 60), // Second image height changed
        ],
      };

      cache.set(multiImageBlock1, 400, 600, { totalHeight: 25 });
      expect(cache.get(multiImageBlock2, 400, 600)).toBeUndefined();
    });

    it('invalidates image blocks by block id', () => {
      const imgBlock = blockWithImage('img-block', imageRun('test.png', 100, 100));
      cache.set(imgBlock, 400, 600, { totalHeight: 50 });

      cache.invalidate(['img-block']);
      expect(cache.get(imgBlock, 400, 600)).toBeUndefined();
    });
  });

  describe('table block caching', () => {
    it('invalidates cache when cell text changes', () => {
      const table1 = tableBlock('table-1', [
        ['Row 1 Cell 1', 'Row 1 Cell 2'],
        ['Row 2 Cell 1', 'Row 2 Cell 2'],
      ]);
      const table2 = tableBlock('table-1', [
        ['Row 1 Cell 1', 'Row 1 Cell 2 MODIFIED'],
        ['Row 2 Cell 1', 'Row 2 Cell 2'],
      ]);

      cache.set(table1, 800, 600, { totalHeight: 100 });
      // Different cell content should result in cache miss
      expect(cache.get(table2, 800, 600)).toBeUndefined();
    });

    it('creates cache hit when table content is identical', () => {
      const table1 = tableBlock('table-1', [
        ['Hello', 'World'],
        ['Foo', 'Bar'],
      ]);
      const table2 = tableBlock('table-1', [
        ['Hello', 'World'],
        ['Foo', 'Bar'],
      ]);

      cache.set(table1, 800, 600, { totalHeight: 100 });
      // Identical content should result in cache hit
      expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 100 });
    });

    it('handles multi-block cells (new format with blocks array)', () => {
      const table1 = tableBlock(
        'table-1',
        [
          ['Multi', 'Block'],
          ['Cell', 'Format'],
        ],
        true,
      );
      const table2 = tableBlock(
        'table-1',
        [
          ['Multi', 'Block'],
          ['Cell', 'Format'],
        ],
        true,
      );

      cache.set(table1, 800, 600, { totalHeight: 120 });
      // Multi-block format with identical content should cache hit
      expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 120 });
    });

    it('handles legacy single paragraph cells', () => {
      const table1 = tableBlock(
        'table-1',
        [
          ['Legacy', 'Format'],
          ['Test', 'Data'],
        ],
        false,
      );
      const table2 = tableBlock(
        'table-1',
        [
          ['Legacy', 'Format'],
          ['Test', 'Data'],
        ],
        false,
      );

      cache.set(table1, 800, 600, { totalHeight: 90 });
      // Legacy format with identical content should cache hit
      expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 90 });
    });

    it('handles empty tables', () => {
      const emptyTable1: TableBlock = {
        kind: 'table',
        id: 'empty-table',
        rows: [],
      };
      const emptyTable2: TableBlock = {
        kind: 'table',
        id: 'empty-table',
        rows: [],
      };

      cache.set(emptyTable1, 800, 600, { totalHeight: 0 });
      // Empty tables should cache hit
      expect(cache.get(emptyTable2, 800, 600)).toEqual({ totalHeight: 0 });
    });

    it('handles tables with no rows property', () => {
      const tableNoRows: TableBlock = {
        kind: 'table',
        id: 'table-no-rows',
        rows: undefined as unknown as TableBlock['rows'],
      };

      cache.set(tableNoRows, 800, 600, { totalHeight: 0 });
      // Should not throw and should cache the value
      expect(cache.get(tableNoRows, 800, 600)).toEqual({ totalHeight: 0 });
    });

    it('differentiates tables with different content', () => {
      const table1 = tableBlock('table-1', [
        ['A', 'B'],
        ['C', 'D'],
      ]);
      const table2 = tableBlock('table-1', [
        ['A', 'B'],
        ['C', 'E'], // Different content in last cell
      ]);

      cache.set(table1, 800, 600, { totalHeight: 100 });
      // Different content should result in cache miss
      expect(cache.get(table2, 800, 600)).toBeUndefined();
    });

    it('distinguishes different whitespace counts in table cells', () => {
      // REGRESSION TEST (PR #1551): Previously whitespace was normalized with /\s+/g
      // causing "Hello   World" and "Hello World" to incorrectly share cache despite
      // having different text widths when rendered.
      // Multiple spaces affect text width, so they MUST produce different cache keys
      const table1: TableBlock = {
        kind: 'table',
        id: 'table-whitespace',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0',
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text: 'Hello   World', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
      };
      const table2: TableBlock = {
        kind: 'table',
        id: 'table-whitespace',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0',
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text: 'Hello World', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
      };

      cache.set(table1, 800, 600, { totalHeight: 50 });
      // Different whitespace counts affect text width, so they should NOT share cache
      expect(cache.get(table2, 800, 600)).toBeUndefined();
    });

    describe('comprehensive whitespace edge cases', () => {
      it('distinguishes leading whitespace in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-leading-ws',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: ' Hello', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };
        const table2: TableBlock = {
          kind: 'table',
          id: 'table-leading-ws',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Leading whitespace should produce different cache key
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('distinguishes trailing whitespace in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-trailing-ws',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello ', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };
        const table2: TableBlock = {
          kind: 'table',
          id: 'table-trailing-ws',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Trailing whitespace should produce different cache key
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('distinguishes tabs vs spaces in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-tab-vs-space',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello\tWorld', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };
        const table2: TableBlock = {
          kind: 'table',
          id: 'table-tab-vs-space',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello World', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Tabs vs spaces should produce different cache key
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('distinguishes empty string vs whitespace-only in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-empty-vs-ws',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: '', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };
        const table2: TableBlock = {
          kind: 'table',
          id: 'table-empty-vs-ws',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: ' ', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Empty string vs whitespace-only should produce different cache key
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });
    });

    it('handles mixed multi-block and legacy cells', () => {
      const mixedTable: TableBlock = {
        kind: 'table',
        id: 'mixed-table',
        rows: [
          {
            id: 'row-0',
            cells: [
              // Multi-block cell
              {
                id: 'cell-0-0',
                blocks: [
                  {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Multi', fontFamily: 'Arial', fontSize: 12 }],
                  },
                ],
              },
              // Legacy cell
              {
                id: 'cell-0-1',
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-1',
                  runs: [{ text: 'Legacy', fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
      };

      cache.set(mixedTable, 800, 600, { totalHeight: 60 });
      expect(cache.get(mixedTable, 800, 600)).toEqual({ totalHeight: 60 });
    });

    it('handles cells with non-text runs (images)', () => {
      const tableWithImage: TableBlock = {
        kind: 'table',
        id: 'table-image',
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0',
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [
                    { text: 'Text before ', fontFamily: 'Arial', fontSize: 12 },
                    { kind: 'image', src: 'data:image/png;base64,abc', width: 100, height: 50 },
                    { text: ' text after', fontFamily: 'Arial', fontSize: 12 },
                  ],
                },
              },
            ],
          },
        ],
      };

      cache.set(tableWithImage, 800, 600, { totalHeight: 80 });
      // Image runs should not break the hashing logic
      expect(cache.get(tableWithImage, 800, 600)).toEqual({ totalHeight: 80 });
    });

    it('invalidates table cache by block id', () => {
      const table = tableBlock('invalidate-table', [
        ['A', 'B'],
        ['C', 'D'],
      ]);

      cache.set(table, 800, 600, { totalHeight: 100 });
      cache.invalidate(['invalidate-table']);
      expect(cache.get(table, 800, 600)).toBeUndefined();
    });

    describe('formatting changes', () => {
      it('invalidates cache when fontSize changes in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-font-size',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-font-size',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 16 }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Different fontSize should result in cache miss
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('invalidates cache when fontFamily changes in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-font-family',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-font-family',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Times New Roman', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Different fontFamily should result in cache miss
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('invalidates cache when bold changes in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-bold',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, bold: false }],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-bold',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, bold: true }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Different bold should result in cache miss
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('invalidates cache when italic changes in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-italic',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, italic: false }],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-italic',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, italic: true }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Different italic should result in cache miss
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('invalidates cache when color changes in table cells', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-color',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, color: '#000000' }],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-color',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, color: '#FF0000' }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Different color should result in cache miss
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('creates cache hit when table formatting is identical', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-identical',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [
                      {
                        text: 'Hello',
                        fontFamily: 'Arial',
                        fontSize: 14,
                        bold: true,
                        italic: true,
                        color: '#0000FF',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-identical',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [
                      {
                        text: 'Hello',
                        fontFamily: 'Arial',
                        fontSize: 14,
                        bold: true,
                        italic: true,
                        color: '#0000FF',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Identical formatting should result in cache hit
        expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 50 });
      });
    });

    describe('edge cases with formatting', () => {
      it('handles table cells with undefined fontSize', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-no-fontsize',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial' }],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-no-fontsize',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial' }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Identical content with undefined fontSize should cache hit
        expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 50 });
      });

      it('handles table cells with undefined fontFamily', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-no-fontfamily',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-no-fontfamily',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Identical content with undefined fontFamily should cache hit
        expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 50 });
      });

      it('invalidates when fontSize changes from undefined to defined', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-fontsize-change',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial' }],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-fontsize-change',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Adding fontSize should result in cache miss
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('handles table cells with non-text runs mixed with formatted text', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-mixed-runs',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [
                      { text: 'Before', fontFamily: 'Arial', fontSize: 12, bold: true },
                      { kind: 'image', src: 'img.png', width: 50, height: 50 },
                      { text: 'After', fontFamily: 'Arial', fontSize: 12, italic: true },
                    ],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-mixed-runs',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [
                      { text: 'Before', fontFamily: 'Arial', fontSize: 12, bold: true },
                      { kind: 'image', src: 'img.png', width: 50, height: 50 },
                      { text: 'After', fontFamily: 'Arial', fontSize: 14, italic: true }, // fontSize changed
                    ],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 70 });
        // Different fontSize in text run should invalidate cache
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('handles table cells with tracked changes and formatting', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-tracked-changes',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [
                      {
                        text: 'Hello',
                        fontFamily: 'Arial',
                        fontSize: 12,
                        bold: true,
                        trackedChange: {
                          kind: 'insert',
                          id: 'tc-1',
                          author: 'User A',
                          date: '2023-01-01',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-tracked-changes',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [
                      {
                        text: 'Hello',
                        fontFamily: 'Arial',
                        fontSize: 14, // fontSize changed
                        bold: true,
                        trackedChange: {
                          kind: 'insert',
                          id: 'tc-1',
                          author: 'User A',
                          date: '2023-01-01',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Formatting change should invalidate even with tracked changes
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('creates cache hit for identical tracked changes with formatting', () => {
        const table1: TableBlock = {
          kind: 'table',
          id: 'table-tracked-identical',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [
                      {
                        text: 'Hello',
                        fontFamily: 'Arial',
                        fontSize: 12,
                        bold: true,
                        trackedChange: {
                          kind: 'insert',
                          id: 'tc-1',
                          author: 'User A',
                          date: '2023-01-01',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };

        const table2: TableBlock = {
          kind: 'table',
          id: 'table-tracked-identical',
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [
                      {
                        text: 'Hello',
                        fontFamily: 'Arial',
                        fontSize: 12,
                        bold: true,
                        trackedChange: {
                          kind: 'insert',
                          id: 'tc-1',
                          author: 'User A',
                          date: '2023-01-01',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };

        cache.set(table1, 800, 600, { totalHeight: 50 });
        // Identical formatting and tracked changes should cache hit
        expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 50 });
      });
    });

    // ============================================================================
    // Table Cell Paragraph Attribute Caching Tests
    // These tests verify that paragraph-level attributes (alignment, spacing,
    // line height, indent, etc.) inside table cells are properly included in
    // cache keys. This fixes toolbar commands (alignment, line height, indent,
    // color, highlight) not updating immediately for text inside tables.
    // ============================================================================

    describe('paragraph attribute changes in table cells', () => {
      const tableWithParagraphAttrs = (
        id: string,
        text: string,
        paragraphAttrs: Record<string, unknown> = {},
        runAttrs: Record<string, unknown> = {},
      ): TableBlock => ({
        kind: 'table',
        id,
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0',
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text, fontFamily: 'Arial', fontSize: 12, ...runAttrs }],
                  attrs: paragraphAttrs,
                },
              },
            ],
          },
        ],
      });

      describe('alignment changes', () => {
        it('invalidates cache when alignment changes in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-align', 'Hello', { alignment: 'left' });
          const table2 = tableWithParagraphAttrs('table-align', 'Hello', { alignment: 'center' });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });

        it('creates cache hit when alignment is identical in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-align-same', 'Hello', { alignment: 'center' });
          const table2 = tableWithParagraphAttrs('table-align-same', 'Hello', { alignment: 'center' });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 50 });
        });
      });

      describe('spacing/line height changes', () => {
        it('invalidates cache when line height changes in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-line', 'Hello', { spacing: { line: 240 } });
          const table2 = tableWithParagraphAttrs('table-line', 'Hello', { spacing: { line: 480 } });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });

        it('invalidates cache when lineRule changes in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-rule', 'Hello', { spacing: { lineRule: 'auto' } });
          const table2 = tableWithParagraphAttrs('table-rule', 'Hello', { spacing: { lineRule: 'exact' } });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });

        it('invalidates cache when spacing.before changes in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-before', 'Hello', { spacing: { before: 100 } });
          const table2 = tableWithParagraphAttrs('table-before', 'Hello', { spacing: { before: 200 } });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });

        it('invalidates cache when spacing.after changes in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-after', 'Hello', { spacing: { after: 100 } });
          const table2 = tableWithParagraphAttrs('table-after', 'Hello', { spacing: { after: 200 } });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });
      });

      describe('indent changes', () => {
        it('invalidates cache when indent.left changes in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-indent-l', 'Hello', { indent: { left: 720 } });
          const table2 = tableWithParagraphAttrs('table-indent-l', 'Hello', { indent: { left: 1440 } });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });

        it('invalidates cache when indent.firstLine changes in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-indent-fl', 'Hello', { indent: { firstLine: 0 } });
          const table2 = tableWithParagraphAttrs('table-indent-fl', 'Hello', { indent: { firstLine: 720 } });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });
      });

      describe('highlight changes', () => {
        it('invalidates cache when highlight changes in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-hl', 'Hello', {}, { highlight: 'yellow' });
          const table2 = tableWithParagraphAttrs('table-hl', 'Hello', {}, { highlight: 'cyan' });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });

        it('invalidates cache when highlight is added in table cell', () => {
          const table1 = tableWithParagraphAttrs('table-hl-add', 'Hello', {}, {});
          const table2 = tableWithParagraphAttrs('table-hl-add', 'Hello', {}, { highlight: 'yellow' });

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });
      });

      describe('combined attribute changes', () => {
        it('creates cache hit for complex identical table cell paragraphs', () => {
          const complexAttrs = {
            alignment: 'justify',
            spacing: { before: 100, after: 100, line: 276, lineRule: 'auto' },
            indent: { left: 720, right: 0, firstLine: 360 },
          };

          const table1 = tableWithParagraphAttrs('table-complex', 'Hello', complexAttrs);
          const table2 = tableWithParagraphAttrs('table-complex', 'Hello', complexAttrs);

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 50 });
        });

        it('invalidates cache when any attribute in complex table cell changes', () => {
          const attrs1 = {
            alignment: 'justify',
            spacing: { before: 100, after: 100 },
            indent: { left: 720 },
          };
          const attrs2 = {
            alignment: 'center', // Changed
            spacing: { before: 100, after: 100 },
            indent: { left: 720 },
          };

          const table1 = tableWithParagraphAttrs('table-complex-chg', 'Hello', attrs1);
          const table2 = tableWithParagraphAttrs('table-complex-chg', 'Hello', attrs2);

          cache.set(table1, 800, 600, { totalHeight: 50 });
          expect(cache.get(table2, 800, 600)).toBeUndefined();
        });
      });
    });

    // ============================================================================
    // Table-Level and Cell-Level Border Caching Tests
    // These tests verify that table-level borders (outer and inner borders) and
    // cell-level borders are properly included in cache keys. This ensures that
    // slash menu commands like "remove borders" trigger cache invalidation and
    // re-render immediately, rather than requiring a subsequent keystroke.
    // ============================================================================

    describe('table-level border changes', () => {
      const tableWithBorders = (id: string, text: string, tableBorders?: Record<string, unknown>): TableBlock => ({
        kind: 'table',
        id,
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0',
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
                },
              },
            ],
          },
        ],
        attrs: tableBorders ? { borders: tableBorders } : undefined,
      });

      it('invalidates cache when table borders are removed', () => {
        const table1 = tableWithBorders('table-borders', 'Hello', {
          top: { style: 'single', width: 8, color: '000000' },
          bottom: { style: 'single', width: 8, color: '000000' },
        });
        const table2 = tableWithBorders('table-borders', 'Hello', {
          top: { style: 'none', width: 0, color: 'auto' },
          bottom: { style: 'none', width: 0, color: 'auto' },
        });

        cache.set(table1, 800, 600, { totalHeight: 50 });
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('invalidates cache when table borders are added', () => {
        const table1 = tableWithBorders('table-borders-add', 'Hello', undefined);
        const table2 = tableWithBorders('table-borders-add', 'Hello', {
          top: { style: 'single', width: 8, color: '000000' },
        });

        cache.set(table1, 800, 600, { totalHeight: 50 });
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('creates cache hit when table borders are identical', () => {
        const borders = {
          top: { style: 'single', width: 8, color: '000000' },
          bottom: { style: 'single', width: 8, color: '000000' },
        };
        const table1 = tableWithBorders('table-borders-same', 'Hello', borders);
        const table2 = tableWithBorders('table-borders-same', 'Hello', borders);

        cache.set(table1, 800, 600, { totalHeight: 50 });
        expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 50 });
      });
    });

    describe('cell-level border changes', () => {
      const tableWithCellBorders = (id: string, text: string, cellBorders?: Record<string, unknown>): TableBlock => ({
        kind: 'table',
        id,
        rows: [
          {
            id: 'row-0',
            cells: [
              {
                id: 'cell-0',
                paragraph: {
                  kind: 'paragraph',
                  id: 'para-0',
                  runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
                },
                attrs: cellBorders ? { borders: cellBorders } : undefined,
              },
            ],
          },
        ],
      });

      it('invalidates cache when cell borders are removed', () => {
        const table1 = tableWithCellBorders('cell-borders', 'Hello', {
          top: { style: 'single', width: 8, color: '000000' },
          bottom: { style: 'single', width: 8, color: '000000' },
        });
        const table2 = tableWithCellBorders('cell-borders', 'Hello', {
          top: { style: 'none', width: 0, color: 'auto' },
          bottom: { style: 'none', width: 0, color: 'auto' },
        });

        cache.set(table1, 800, 600, { totalHeight: 50 });
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('invalidates cache when cell borders are added', () => {
        const table1 = tableWithCellBorders('cell-borders-add', 'Hello', undefined);
        const table2 = tableWithCellBorders('cell-borders-add', 'Hello', {
          top: { style: 'single', width: 8, color: '000000' },
        });

        cache.set(table1, 800, 600, { totalHeight: 50 });
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });

      it('creates cache hit when cell borders are identical', () => {
        const borders = {
          top: { style: 'single', width: 8, color: '000000' },
          bottom: { style: 'single', width: 8, color: '000000' },
        };
        const table1 = tableWithCellBorders('cell-borders-same', 'Hello', borders);
        const table2 = tableWithCellBorders('cell-borders-same', 'Hello', borders);

        cache.set(table1, 800, 600, { totalHeight: 50 });
        expect(cache.get(table2, 800, 600)).toEqual({ totalHeight: 50 });
      });

      it('invalidates cache when cell padding changes', () => {
        const tableWithPadding = (
          id: string,
          padding?: { top?: number; right?: number; bottom?: number; left?: number },
        ): TableBlock => ({
          kind: 'table',
          id,
          rows: [
            {
              id: 'row-0',
              cells: [
                {
                  id: 'cell-0',
                  paragraph: {
                    kind: 'paragraph',
                    id: 'para-0',
                    runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
                  },
                  attrs: padding ? { padding } : undefined,
                },
              ],
            },
          ],
        });

        const table1 = tableWithPadding('cell-padding', { top: 10, right: 10, bottom: 10, left: 10 });
        const table2 = tableWithPadding('cell-padding', { top: 20, right: 20, bottom: 20, left: 20 });

        cache.set(table1, 800, 600, { totalHeight: 50 });
        expect(cache.get(table2, 800, 600)).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // Paragraph Attribute Caching Tests
  // These tests verify that paragraph-level attributes (alignment, spacing,
  // indent, borders, shading, tabs, etc.) are properly included in cache keys.
  // This is critical for fixing the toolbar command issue where align/center
  // wasn't updating immediately because the cache key didn't include alignment.
  // ============================================================================

  describe('paragraph attribute caching', () => {
    const paragraphWithAttrs = (id: string, text: string, attrs: Record<string, unknown> = {}): FlowBlock => ({
      kind: 'paragraph',
      id,
      runs: [{ text, fontFamily: 'Arial', fontSize: 16 }],
      attrs,
    });

    describe('alignment changes', () => {
      it('invalidates cache when alignment changes from left to center', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { alignment: 'left' });
        const block2 = paragraphWithAttrs('p1', 'Hello', { alignment: 'center' });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        // Different alignment should result in cache miss
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when alignment changes from undefined to center', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', {});
        const block2 = paragraphWithAttrs('p1', 'Hello', { alignment: 'center' });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('creates cache hit when alignment is identical', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { alignment: 'center' });
        const block2 = paragraphWithAttrs('p1', 'Hello', { alignment: 'center' });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 20 });
      });
    });

    describe('spacing changes', () => {
      it('invalidates cache when spacing.before changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { spacing: { before: 100 } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { spacing: { before: 200 } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when spacing.after changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { spacing: { after: 100 } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { spacing: { after: 200 } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when spacing.line changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { spacing: { line: 240 } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { spacing: { line: 360 } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when spacing.lineRule changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { spacing: { lineRule: 'auto' } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { spacing: { lineRule: 'exact' } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('creates cache hit when spacing is identical', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { spacing: { before: 100, after: 100, line: 240 } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { spacing: { before: 100, after: 100, line: 240 } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 20 });
      });
    });

    describe('indent changes', () => {
      it('invalidates cache when indent.left changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { indent: { left: 720 } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { indent: { left: 1440 } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when indent.firstLine changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { indent: { firstLine: 0 } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { indent: { firstLine: 720 } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('creates cache hit when indent is identical', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { indent: { left: 720, firstLine: 360 } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { indent: { left: 720, firstLine: 360 } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 20 });
      });
    });

    describe('border and shading changes', () => {
      it('invalidates cache when borders change', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { borders: { top: { style: 'solid', width: 1 } } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { borders: { top: { style: 'solid', width: 2 } } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when shading.fill changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { shading: { fill: '#fff' } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { shading: { fill: '#f0f0f0' } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });
    });

    describe('tab changes', () => {
      it('invalidates cache when tabs are added', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { tabs: [] });
        const block2 = paragraphWithAttrs('p1', 'Hello', { tabs: [{ val: 'center', pos: 4320 }] });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when tab position changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { tabs: [{ val: 'start', pos: 720 }] });
        const block2 = paragraphWithAttrs('p1', 'Hello', { tabs: [{ val: 'start', pos: 1440 }] });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('creates cache hit when tabs are identical', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { tabs: [{ val: 'center', pos: 4320, leader: 'dot' }] });
        const block2 = paragraphWithAttrs('p1', 'Hello', { tabs: [{ val: 'center', pos: 4320, leader: 'dot' }] });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 20 });
      });
    });

    describe('other paragraph attribute changes', () => {
      it('invalidates cache when direction changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { direction: 'ltr' });
        const block2 = paragraphWithAttrs('p1', 'Hello', { direction: 'rtl' });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when keepNext changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { keepNext: false });
        const block2 = paragraphWithAttrs('p1', 'Hello', { keepNext: true });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });

      it('invalidates cache when floatAlignment changes', () => {
        const block1 = paragraphWithAttrs('p1', 'Hello', { floatAlignment: 'left' });
        const block2 = paragraphWithAttrs('p1', 'Hello', { floatAlignment: 'center' });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });
    });

    describe('combined attribute changes', () => {
      it('creates cache hit for complex identical paragraphs', () => {
        const complexAttrs = {
          alignment: 'justify',
          spacing: { before: 100, after: 100, line: 276, lineRule: 'auto' },
          indent: { left: 720, right: 0, firstLine: 360 },
          borders: { top: { style: 'solid', width: 1, color: '#000' } },
          shading: { fill: '#f0f0f0' },
          tabs: [
            { val: 'center', pos: 4320 },
            { val: 'end', pos: 8640, leader: 'dot' },
          ],
          keepNext: true,
          direction: 'ltr',
        };

        const block1 = paragraphWithAttrs('p1', 'Hello', complexAttrs);
        const block2 = paragraphWithAttrs('p1', 'Hello', complexAttrs);

        cache.set(block1, 400, 600, { totalHeight: 50 });
        expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 50 });
      });

      it('invalidates cache when any attribute in complex paragraph changes', () => {
        const attrs1 = {
          alignment: 'justify',
          spacing: { before: 100, after: 100 },
          indent: { left: 720 },
        };
        const attrs2 = {
          alignment: 'center', // Changed from justify to center
          spacing: { before: 100, after: 100 },
          indent: { left: 720 },
        };

        const block1 = paragraphWithAttrs('p1', 'Hello', attrs1);
        const block2 = paragraphWithAttrs('p1', 'Hello', attrs2);

        cache.set(block1, 400, 600, { totalHeight: 50 });
        expect(cache.get(block2, 400, 600)).toBeUndefined();
      });
    });

    describe('non-visual attributes (should not affect cache key)', () => {
      it('creates cache hit when only sdt metadata changes', () => {
        // sdt is non-visual metadata
        const block1 = paragraphWithAttrs('p1', 'Hello', { sdt: { id: '1', tag: 'field1' } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { sdt: { id: '2', tag: 'field2' } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        // sdt changes should not affect cache key
        expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 20 });
      });

      it('creates cache hit when only wordLayout changes', () => {
        // wordLayout is computed output, not input
        const block1 = paragraphWithAttrs('p1', 'Hello', { wordLayout: { lines: 1 } });
        const block2 = paragraphWithAttrs('p1', 'Hello', { wordLayout: { lines: 2 } });

        cache.set(block1, 400, 600, { totalHeight: 20 });
        // wordLayout changes should not affect cache key
        expect(cache.get(block2, 400, 600)).toEqual({ totalHeight: 20 });
      });
    });
  });
});
