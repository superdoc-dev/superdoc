import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import {
  findAllBookmarksInDocument,
  findAllBookmarks,
  resolveBookmarkTarget,
  extractBookmarkInfo,
  buildBookmarkAddress,
  normalizeStory,
} from './bookmark-resolver.js';

type BookmarkSeed = {
  name: string;
  id: string;
};

function makeDoc(bookmarks: BookmarkSeed[]) {
  return {
    descendants: (
      cb: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => boolean | void,
    ) => {
      for (const [index, bookmark] of bookmarks.entries()) {
        cb(
          {
            type: { name: 'bookmarkStart' },
            attrs: { name: bookmark.name, id: bookmark.id },
          },
          index + 1,
        );
      }
      return true;
    },
  };
}

function makeEditor(bookmarks: BookmarkSeed[], converter: Record<string, unknown> = {}): Editor {
  return {
    state: {
      doc: makeDoc(bookmarks),
    },
    converter,
  } as unknown as Editor;
}

describe('findAllBookmarksInDocument', () => {
  it('collects bookmarks from the body, concrete header/footer parts, and notes', () => {
    const editor = makeEditor([{ name: 'body-bm', id: '1' }], {
      headers: {
        rIdHeader: {
          type: 'doc',
          content: [{ type: 'bookmarkStart', attrs: { name: 'header-bm', id: '2' } }],
        },
      },
      footers: {
        rIdFooter: {
          type: 'doc',
          content: [{ type: 'bookmarkStart', attrs: { name: 'footer-bm', id: '3' } }],
        },
      },
      footnotes: [{ id: 'fn-1', content: [{ type: 'bookmarkStart', attrs: { name: 'footnote-bm', id: '4' } }] }],
      endnotes: [{ id: 'en-1', content: [{ type: 'bookmarkStart', attrs: { name: 'endnote-bm', id: '5' } }] }],
    });

    expect(findAllBookmarksInDocument(editor)).toEqual(
      expect.arrayContaining([
        { name: 'body-bm', bookmarkId: '1', storyKey: 'body' },
        { name: 'header-bm', bookmarkId: '2', storyKey: 'hf:part:rIdHeader' },
        { name: 'footer-bm', bookmarkId: '3', storyKey: 'hf:part:rIdFooter' },
        { name: 'footnote-bm', bookmarkId: '4', storyKey: 'fn:fn-1' },
        { name: 'endnote-bm', bookmarkId: '5', storyKey: 'en:en-1' },
      ]),
    );
  });

  it('prefers a live header/footer editor over cached PM JSON for the same part', () => {
    const liveHeaderEditor = makeEditor([{ name: 'live-header-bm', id: '10' }]);
    const editor = makeEditor([], {
      headerEditors: [{ id: 'rIdHeader', editor: liveHeaderEditor }],
      headers: {
        rIdHeader: {
          type: 'doc',
          content: [{ type: 'bookmarkStart', attrs: { name: 'stale-header-bm', id: '11' } }],
        },
      },
    });

    const bookmarks = findAllBookmarksInDocument(editor).filter(
      (bookmark) => bookmark.storyKey === 'hf:part:rIdHeader',
    );

    expect(bookmarks).toEqual([{ name: 'live-header-bm', bookmarkId: '10', storyKey: 'hf:part:rIdHeader' }]);
  });

  it('does not double-count the same concrete header part referenced by multiple slots', () => {
    const editor = makeEditor([], {
      headers: {
        rIdShared: {
          type: 'doc',
          content: [{ type: 'bookmarkStart', attrs: { name: 'shared-header-bm', id: '20' } }],
        },
      },
    });

    const bookmarks = findAllBookmarksInDocument(editor).filter(
      (bookmark) => bookmark.storyKey === 'hf:part:rIdShared',
    );

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]).toEqual({ name: 'shared-header-bm', bookmarkId: '20', storyKey: 'hf:part:rIdShared' });
  });
});

function makePmDoc(nodes: Array<{ type: string; attrs?: Record<string, unknown>; nodeSize?: number }>) {
  return {
    descendants: (cb: (node: any, pos: number) => boolean | void) => {
      let pos = 1;
      for (const node of nodes) {
        const result = cb({ type: { name: node.type }, attrs: node.attrs ?? {}, isInline: true }, pos);
        if (result === false) return;
        pos += node.nodeSize ?? 1;
      }
    },
    resolve: (position: number) => ({
      depth: 1,
      node: (depth: number) => (depth === 1 ? { attrs: { sdBlockId: 'block-1' } } : { attrs: {} }),
      start: () => 0,
    }),
    textBetween: () => '',
  } as any;
}

describe('findAllBookmarks', () => {
  it('finds all bookmarkStart nodes with their paired ends', () => {
    const doc = makePmDoc([
      { type: 'bookmarkStart', attrs: { name: 'bm1', id: '0' } },
      { type: 'paragraph' },
      { type: 'bookmarkEnd', attrs: { id: '0' } },
      { type: 'bookmarkStart', attrs: { name: 'bm2', id: '1' } },
      { type: 'bookmarkEnd', attrs: { id: '1' } },
    ]);

    const results = findAllBookmarks(doc);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: 'bm1', bookmarkId: '0', pos: 1 });
    expect(results[0].endPos).toBe(3);
    expect(results[1]).toMatchObject({ name: 'bm2', bookmarkId: '1', pos: 4 });
    expect(results[1].endPos).toBe(5);
  });

  it('returns null endPos for orphaned bookmarkStart', () => {
    const doc = makePmDoc([{ type: 'bookmarkStart', attrs: { name: 'orphan', id: '99' } }]);

    const results = findAllBookmarks(doc);

    expect(results).toHaveLength(1);
    expect(results[0].endPos).toBeNull();
  });
});

describe('resolveBookmarkTarget', () => {
  it('resolves an existing bookmark by name', () => {
    const doc = makePmDoc([
      { type: 'bookmarkStart', attrs: { name: 'target', id: '5' } },
      { type: 'bookmarkEnd', attrs: { id: '5' } },
    ]);

    const result = resolveBookmarkTarget(doc, {
      kind: 'entity',
      entityType: 'bookmark',
      name: 'target',
    });

    expect(result.name).toBe('target');
    expect(result.bookmarkId).toBe('5');
    expect(result.pos).toBe(1);
  });

  it('throws TARGET_NOT_FOUND for a non-existent bookmark', () => {
    const doc = makePmDoc([{ type: 'bookmarkStart', attrs: { name: 'exists', id: '0' } }]);

    expect(() =>
      resolveBookmarkTarget(doc, {
        kind: 'entity',
        entityType: 'bookmark',
        name: 'does-not-exist',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'TARGET_NOT_FOUND',
      }),
    );
  });
});

describe('extractBookmarkInfo', () => {
  it('returns bookmark info with range positions', () => {
    const doc = makePmDoc([
      { type: 'bookmarkStart', attrs: { name: 'bm1', id: '0' } },
      { type: 'bookmarkEnd', attrs: { id: '0' } },
    ]);

    const resolved = {
      node: { type: { name: 'bookmarkStart' }, attrs: { name: 'bm1', id: '0' } },
      pos: 1,
      name: 'bm1',
      bookmarkId: '0',
      endPos: 2,
    } as any;

    const info = extractBookmarkInfo(doc, resolved);

    expect(info.name).toBe('bm1');
    expect(info.bookmarkId).toBe('0');
    expect(info.address).toEqual({ kind: 'entity', entityType: 'bookmark', name: 'bm1' });
    expect(info.range.from).toBeDefined();
    expect(info.range.to).toBeDefined();
    expect(info.tableColumn).toBeUndefined();
  });

  it('includes tableColumn when colFirst and colLast are set', () => {
    const doc = makePmDoc([]);
    const resolved = {
      node: { type: { name: 'bookmarkStart' }, attrs: { name: 'tbl-bm', id: '1', colFirst: 0, colLast: 2 } },
      pos: 1,
      name: 'tbl-bm',
      bookmarkId: '1',
      endPos: 5,
    } as any;

    const info = extractBookmarkInfo(doc, resolved);

    expect(info.tableColumn).toEqual({ colFirst: 0, colLast: 2 });
  });

  it('includes story in address for non-body stories', () => {
    const doc = makePmDoc([]);
    const resolved = {
      node: { type: { name: 'bookmarkStart' }, attrs: { name: 'hdr-bm', id: '3' } },
      pos: 1,
      name: 'hdr-bm',
      bookmarkId: '3',
      endPos: 2,
    } as any;
    const story = { kind: 'story' as const, storyType: 'headerFooterPart' as const, refId: 'rId7' };

    const info = extractBookmarkInfo(doc, resolved, story);

    expect(info.address.story).toEqual(story);
  });
});

describe('normalizeStory', () => {
  it('returns undefined for body story', () => {
    expect(normalizeStory({ kind: 'story', storyType: 'body' })).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeStory(undefined)).toBeUndefined();
  });

  it('passes through non-body stories', () => {
    const story = { kind: 'story' as const, storyType: 'footnote' as const, noteId: 'fn-1' };
    expect(normalizeStory(story)).toEqual(story);
  });
});

describe('buildBookmarkAddress', () => {
  it('builds a plain address for body bookmarks', () => {
    expect(buildBookmarkAddress('bm1')).toEqual({
      kind: 'entity',
      entityType: 'bookmark',
      name: 'bm1',
    });
  });

  it('omits story for body locator', () => {
    const result = buildBookmarkAddress('bm1', { kind: 'story', storyType: 'body' });
    expect('story' in result).toBe(false);
  });

  it('includes story for non-body locator', () => {
    const story = { kind: 'story' as const, storyType: 'footnote' as const, noteId: 'fn-1' };
    const result = buildBookmarkAddress('bm1', story);
    expect(result.story).toEqual(story);
  });
});
