import { describe, expect, it } from 'vitest';
import type { Layout, ListBlock, ParagraphBlock, TableBlock } from './index.js';
import { buildPageRefAnchorMap } from './page-ref-anchor.js';

describe('buildPageRefAnchorMap', () => {
  it('returns display page information for fragment PM ranges', () => {
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        {
          number: 4,
          displayNumber: 2,
          numberText: 'ii',
          pageNumberFormat: 'lowerRoman',
          pageNumberChapterText: 'A',
          pageNumberChapterSeparator: 'colon',
          sectionIndex: 1,
          fragments: [
            { kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 0, y: 0, width: 100, pmStart: 10, pmEnd: 20 },
          ],
        },
      ],
    };

    const result = buildPageRefAnchorMap(new Map([['target', 12]]), layout);

    expect(result.get('target')).toMatchObject({
      physicalPage: 4,
      displayNumber: 2,
      displayText: 'ii',
      pageFormat: 'lowerRoman',
      chapterNumberText: 'A',
      chapterSeparator: 'colon',
      sectionIndex: 1,
      pmPosition: 12,
    });
  });

  it('resolves targets inside table fragments with PM ranges', () => {
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        {
          number: 2,
          fragments: [
            {
              kind: 'table',
              blockId: 't1',
              fromRow: 0,
              toRow: 1,
              x: 0,
              y: 0,
              width: 100,
              height: 20,
              pmStart: 30,
              pmEnd: 60,
            } as any,
          ],
        },
      ],
    };

    expect(buildPageRefAnchorMap(new Map([['inTable', 45]]), layout).get('inTable')?.physicalPage).toBe(2);
  });

  it('falls back to paragraph block run ranges when fragment PM data is missing', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'p1',
      runs: [{ text: 'Target', fontFamily: 'Arial', fontSize: 12, pmStart: 100, pmEnd: 106 }],
    };
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        {
          number: 3,
          fragments: [{ kind: 'para', blockId: 'p1', fromLine: 0, toLine: 1, x: 0, y: 0, width: 100 }],
        },
      ],
    };

    expect(buildPageRefAnchorMap(new Map([['target', 103]]), layout, [block]).get('target')?.physicalPage).toBe(3);
  });

  it('maps leading bookmark markers to the next visible fragment', () => {
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        {
          number: 2,
          displayNumber: 2,
          numberText: '2',
          fragments: [
            {
              kind: 'para',
              blockId: 'target',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 100,
              pmStart: 1377,
              pmEnd: 1400,
            },
          ],
        },
      ],
    };

    expect(buildPageRefAnchorMap(new Map([['target', 1374]]), layout).get('target')).toMatchObject({
      physicalPage: 2,
      displayNumber: 2,
      displayText: '2',
      pmPosition: 1374,
    });
  });

  it('falls back to visible paragraph ranges inside table blocks', () => {
    const table: TableBlock = {
      kind: 'table',
      id: 't1',
      rows: [
        {
          id: 'r1',
          cells: [
            {
              id: 'c1',
              paragraph: {
                kind: 'paragraph',
                id: 'p1',
                runs: [{ text: 'Cell', fontFamily: 'Arial', fontSize: 12, pmStart: 200, pmEnd: 204 }],
              },
            },
          ],
        },
      ],
    };
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        {
          number: 5,
          fragments: [{ kind: 'table', blockId: 't1', fromRow: 0, toRow: 1, x: 0, y: 0, width: 100, height: 20 }],
        },
      ],
    };

    expect(buildPageRefAnchorMap(new Map([['cellTarget', 202]]), layout, [table]).get('cellTarget')?.physicalPage).toBe(
      5,
    );
  });

  it('falls back to list item paragraph ranges when fragment PM data is missing', () => {
    const list: ListBlock = {
      kind: 'list',
      id: 'list1',
      listType: 'number',
      items: [
        {
          id: 'li1',
          marker: { kind: 'number', text: '1.', level: 0 },
          paragraph: {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Heading', fontFamily: 'Arial', fontSize: 12, pmStart: 300, pmEnd: 307 }],
          },
        },
      ],
    };
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [
        {
          number: 6,
          fragments: [
            {
              kind: 'list-item',
              blockId: 'list1',
              itemId: 'li1',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 100,
              markerWidth: 20,
            },
          ],
        },
      ],
    };

    expect(buildPageRefAnchorMap(new Map([['listTarget', 303]]), layout, [list]).get('listTarget')?.physicalPage).toBe(
      6,
    );
  });

  it('omits bookmarks not found in any fragment', () => {
    const layout: Layout = {
      pageSize: { w: 800, h: 1000 },
      pages: [{ number: 1, fragments: [] }],
    };

    expect(buildPageRefAnchorMap(new Map([['missing', 1]]), layout).has('missing')).toBe(false);
  });
});
