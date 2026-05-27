import { describe, it, expect, vi } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import type { InlineConverterParams } from './common.js';

vi.mock('./text-run.js', () => ({
  textNodeToRun: vi.fn(
    (params: InlineConverterParams): TextRun => ({
      text: params.node.text || '',
      fontFamily: params.defaultFont,
      fontSize: params.defaultSize,
    }),
  ),
}));

import { bookmarkStartNodeToBlocks } from './bookmark-start.js';
import { bookmarkEndNodeToRun } from './bookmark-end.js';

function makeParams(
  node: PMNode,
  opts: { showBookmarks?: boolean; bookmarks?: Map<string, number>; renderedBookmarkIds?: Set<string> } = {},
): InlineConverterParams {
  return {
    node,
    positions: new WeakMap(),
    defaultFont: 'Calibri',
    defaultSize: 16,
    inheritedMarks: [],
    sdtMetadata: undefined,
    hyperlinkConfig: { enableRichHyperlinks: false },
    themeColors: undefined,
    runProperties: undefined,
    paragraphProperties: undefined,
    converterContext: {
      translatedNumbering: {},
      translatedLinkedStyles: { docDefaults: {}, latentStyles: {}, styles: {} },
      showBookmarks: opts.showBookmarks ?? false,
      renderedBookmarkIds: opts.renderedBookmarkIds,
    } as unknown as InlineConverterParams['converterContext'],
    enableComments: false,
    visitNode: vi.fn(),
    bookmarks: opts.bookmarks,
    tabOrdinal: 0,
    paragraphAttrs: {},
    nextBlockId: vi.fn(),
  } as InlineConverterParams;
}

describe('bookmarkStartNodeToBlocks (SD-2454)', () => {
  it('emits no visible run when showBookmarks is off (default)', () => {
    const node: PMNode = { type: 'bookmarkStart', attrs: { name: 'chapter1', id: '1' } };
    const result = bookmarkStartNodeToBlocks(makeParams(node, { showBookmarks: false }));
    expect(result).toBeUndefined();
  });

  it('emits a `[` TextRun with bookmark-name data attr when showBookmarks is on', () => {
    const node: PMNode = { type: 'bookmarkStart', attrs: { name: 'chapter1', id: '1' } };
    const result = bookmarkStartNodeToBlocks(makeParams(node, { showBookmarks: true }));
    expect(result).toBeDefined();
    expect(result!.text).toBe('[');
    expect(result!.dataAttrs).toEqual({
      'data-bookmark-name': 'chapter1',
      'data-bookmark-marker': 'start',
    });
  });

  // Matches Word behavior: `_Toc…`, `_Ref…`, `_GoBack` etc. are hidden from
  // Show Bookmarks because they are internally generated for headings,
  // fields, or navigation — showing them would clutter the document.
  it.each(['_Toc1234', '_Ref506192326', '_GoBack'])('suppresses marker for auto-generated bookmark "%s"', (name) => {
    const node: PMNode = { type: 'bookmarkStart', attrs: { name, id: '1' } };
    const result = bookmarkStartNodeToBlocks(makeParams(node, { showBookmarks: true }));
    expect(result).toBeUndefined();
  });

  it('still records bookmark position for cross-reference resolution regardless of showBookmarks', () => {
    const bookmarks = new Map<string, number>();
    const node: PMNode = { type: 'bookmarkStart', attrs: { name: 'chapter1', id: '1' } };
    const params = makeParams(node, { showBookmarks: false, bookmarks });
    // Seed the position map
    params.positions.set(node, { start: 42, end: 42 });
    bookmarkStartNodeToBlocks(params);
    expect(bookmarks.get('chapter1')).toBe(42);
  });
});

describe('bookmarkEndNodeToRun (SD-2454)', () => {
  it('emits no run when showBookmarks is off (default)', () => {
    const node: PMNode = { type: 'bookmarkEnd', attrs: { id: '1' } };
    const result = bookmarkEndNodeToRun(makeParams(node, { showBookmarks: false }));
    expect(result).toBeUndefined();
  });

  it('emits a `]` TextRun when the matching start was rendered', () => {
    const node: PMNode = { type: 'bookmarkEnd', attrs: { id: '1' } };
    const result = bookmarkEndNodeToRun(makeParams(node, { showBookmarks: true, renderedBookmarkIds: new Set(['1']) }));
    expect(result).toBeDefined();
    expect(result!.text).toBe(']');
    expect(result!.dataAttrs).toEqual({
      'data-bookmark-marker': 'end',
      'data-bookmark-id': '1',
    });
  });

  it('suppresses `]` when the matching start was also suppressed (no orphan brackets)', () => {
    const node: PMNode = { type: 'bookmarkEnd', attrs: { id: '42' } };
    // Start with id 42 was suppressed — renderedBookmarkIds does not include it
    const result = bookmarkEndNodeToRun(
      makeParams(node, { showBookmarks: true, renderedBookmarkIds: new Set(['99']) }),
    );
    expect(result).toBeUndefined();
  });
});
