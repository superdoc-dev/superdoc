import { describe, it, expect } from 'vitest';
import { buildAnchorMap, resolvePageRefTokens, getTocBlocksForRemeasurement } from './resolvePageRefs.js';
import type { Layout, FlowBlock } from '@superdoc/contracts';

describe('buildAnchorMap', () => {
  it('maps bookmarks to page numbers based on fragment PM ranges', () => {
    const bookmarks = new Map([
      ['_Toc1', 10], // PM position 10
      ['_Toc2', 30], // PM position 30
      ['_Toc3', 50], // PM position 50
    ]);

    const layout: Layout = {
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: '0-paragraph',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 100,
              pmStart: 5,
              pmEnd: 25, // Contains _Toc1 (10) and _Toc2 (30 is outside)
            },
          ],
          margins: { top: 72, right: 72, bottom: 72, left: 72 },
        },
        {
          number: 2,
          fragments: [
            {
              kind: 'para',
              blockId: '1-paragraph',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 100,
              pmStart: 25,
              pmEnd: 45, // Contains _Toc2 (30)
            },
            {
              kind: 'para',
              blockId: '2-paragraph',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 25,
              width: 100,
              pmStart: 45,
              pmEnd: 60, // Contains _Toc3 (50)
            },
          ],
          margins: { top: 72, right: 72, bottom: 72, left: 72 },
        },
      ],
      pageSize: { w: 612, h: 792 },
    };

    const anchorMap = buildAnchorMap(bookmarks, layout);

    expect(anchorMap.size).toBe(3);
    expect(anchorMap.get('_Toc1')).toBe(1);
    expect(anchorMap.get('_Toc2')).toBe(2);
    expect(anchorMap.get('_Toc3')).toBe(2);
  });

  it('handles bookmarks not found in any fragment', () => {
    const bookmarks = new Map([
      ['_TocMissing', 999], // PM position outside all fragments
    ]);

    const layout: Layout = {
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: '0-paragraph',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 100,
              pmStart: 5,
              pmEnd: 25,
            },
          ],
          margins: { top: 72, right: 72, bottom: 72, left: 72 },
        },
      ],
      pageSize: { w: 612, h: 792 },
    };

    // Should log warning but not throw
    const anchorMap = buildAnchorMap(bookmarks, layout);

    expect(anchorMap.size).toBe(0);
    expect(anchorMap.has('_TocMissing')).toBe(false);
  });

  it('skips fragments without PM positions', () => {
    const bookmarks = new Map([['_Toc1', 10]]);

    const layout: Layout = {
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'image',
              blockId: 'image-1',
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              // Image fragments don't have pmStart/pmEnd (type assertion needed for test)
            },
            {
              kind: 'para',
              blockId: '0-paragraph',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 100,
              width: 100,
              pmStart: 5,
              pmEnd: 25,
            },
          ],
          margins: { top: 72, right: 72, bottom: 72, left: 72 },
        },
      ],
      pageSize: { w: 612, h: 792 },
    };

    const anchorMap = buildAnchorMap(bookmarks, layout);

    expect(anchorMap.size).toBe(1);
    expect(anchorMap.get('_Toc1')).toBe(1);
  });
});

describe('resolvePageRefTokens', () => {
  it('replaces pageReference token text with resolved page numbers', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'See page ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: '??', // Placeholder text
            fontFamily: 'Arial',
            fontSize: 12,
            token: 'pageReference',
            pageRefMetadata: {
              bookmarkId: '_Toc1',
              instruction: 'PAGEREF _Toc1 \\h',
            },
          },
        ],
      },
    ];

    const anchorMap = new Map([['_Toc1', 5]]);

    const affectedBlockIds = resolvePageRefTokens(blocks, anchorMap);

    expect(affectedBlockIds.size).toBe(1);
    expect(affectedBlockIds.has('0-paragraph')).toBe(true);
    const block = blocks[0];
    if (block.kind === 'paragraph') {
      expect((block.runs[1] as { text?: string }).text).toBe('5');
      // Verify token metadata is cleared after resolution
      expect((block.runs[1] as { token?: string }).token).toBeUndefined();
      expect((block.runs[1] as { pageRefMetadata?: unknown }).pageRefMetadata).toBeUndefined();
    }
  });

  it('handles multiple tokens in same paragraph', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Ref 1: ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: '??',
            fontFamily: 'Arial',
            fontSize: 12,
            token: 'pageReference',
            pageRefMetadata: {
              bookmarkId: '_Toc1',
              instruction: 'PAGEREF _Toc1 \\h',
            },
          },
          {
            text: ', Ref 2: ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: '??',
            fontFamily: 'Arial',
            fontSize: 12,
            token: 'pageReference',
            pageRefMetadata: {
              bookmarkId: '_Toc2',
              instruction: 'PAGEREF _Toc2 \\h',
            },
          },
        ],
      },
    ];

    const anchorMap = new Map([
      ['_Toc1', 3],
      ['_Toc2', 7],
    ]);

    const affectedBlockIds = resolvePageRefTokens(blocks, anchorMap);

    expect(affectedBlockIds.size).toBe(1);
    const block = blocks[0];
    if (block.kind === 'paragraph') {
      expect((block.runs[1] as { text?: string }).text).toBe('3');
      expect((block.runs[3] as { text?: string }).text).toBe('7');
    }
  });

  it('keeps placeholder text when bookmark not in anchor map', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: '??', // Fallback placeholder
            fontFamily: 'Arial',
            fontSize: 12,
            token: 'pageReference',
            pageRefMetadata: {
              bookmarkId: '_TocMissing',
              instruction: 'PAGEREF _TocMissing \\h',
            },
          },
        ],
      },
    ];

    const anchorMap = new Map([['_TocOther', 5]]);

    const affectedBlockIds = resolvePageRefTokens(blocks, anchorMap);

    // Block not affected since token wasn't resolved
    expect(affectedBlockIds.size).toBe(0);
    const block = blocks[0];
    if (block.kind === 'paragraph') {
      expect((block.runs[0] as { text?: string }).text).toBe('??'); // Unchanged
    }
  });

  it('skips non-paragraph blocks', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'image',
        id: 'image-1',
        altText: 'Test image',
        width: 100,
        height: 100,
      } as unknown as FlowBlock,
    ];

    const anchorMap = new Map();

    const affectedBlockIds = resolvePageRefTokens(blocks, anchorMap);

    expect(affectedBlockIds.size).toBe(0);
  });

  it('skips runs without pageReference token', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Page ',
            fontFamily: 'Arial',
            fontSize: 12,
          },
          {
            text: '1',
            fontFamily: 'Arial',
            fontSize: 12,
            token: 'pageNumber', // Different token type
          },
        ],
      },
    ];

    const anchorMap = new Map();

    const affectedBlockIds = resolvePageRefTokens(blocks, anchorMap);

    expect(affectedBlockIds.size).toBe(0);
  });
});

describe('getTocBlocksForRemeasurement', () => {
  it('filters TOC paragraphs that were affected by token resolution', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [],
        attrs: {
          isTocEntry: true,
        },
      },
      {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {
          isTocEntry: false,
        },
      },
      {
        kind: 'paragraph',
        id: '2-paragraph',
        runs: [],
        attrs: {
          isTocEntry: true,
        },
      },
      {
        kind: 'paragraph',
        id: '3-paragraph',
        runs: [],
        // No attrs (regular paragraph)
      },
    ];

    const affectedBlockIds = new Set(['0-paragraph', '1-paragraph', '3-paragraph']);

    const tocBlocks = getTocBlocksForRemeasurement(blocks, affectedBlockIds);

    expect(tocBlocks).toHaveLength(1);
    expect(tocBlocks[0].id).toBe('0-paragraph');
  });

  it('returns empty array when no TOC blocks affected', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [],
        attrs: {
          isTocEntry: true,
        },
      },
    ];

    const affectedBlockIds = new Set(['1-paragraph']); // Different block

    const tocBlocks = getTocBlocksForRemeasurement(blocks, affectedBlockIds);

    expect(tocBlocks).toHaveLength(0);
  });

  it('skips non-paragraph blocks', () => {
    const blocks: FlowBlock[] = [
      {
        kind: 'image',
        id: 'image-1',
        altText: 'Test',
        width: 100,
        height: 100,
      } as unknown as FlowBlock,
      {
        kind: 'list',
        id: 'list-1',
        listType: 'bullet',
        items: [],
      } as unknown as FlowBlock,
    ];

    const affectedBlockIds = new Set(['image-1', 'list-1']);

    const tocBlocks = getTocBlocksForRemeasurement(blocks, affectedBlockIds);

    expect(tocBlocks).toHaveLength(0);
  });
});
