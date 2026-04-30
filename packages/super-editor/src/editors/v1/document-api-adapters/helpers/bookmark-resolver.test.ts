import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { registerLiveStorySessionRuntime } from '../story-runtime/live-story-session-runtime-registry.js';
import {
  findAllBookmarksInDocument,
  findAllBookmarkMarkersInDocument,
  findAllBookmarks,
  resolveBookmarkTarget,
  extractBookmarkInfo,
  buildBookmarkAddress,
  buildBookmarkDiscoveryItem,
  normalizeStory,
} from './bookmark-resolver.js';

type BookmarkSeed = {
  type?: 'bookmarkStart' | 'bookmarkEnd';
  name?: string;
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
            type: { name: bookmark.type ?? 'bookmarkStart' },
            attrs: { ...(bookmark.name !== undefined ? { name: bookmark.name } : {}), id: bookmark.id },
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

  it('prefers a live header session editor over stale converter header data for the same part', () => {
    const hostEditor = makeEditor([], {
      headerEditors: [{ id: 'rIdHeader', editor: makeEditor([{ name: 'stale-editor-bm', id: '11' }]) }],
      headers: {
        rIdHeader: {
          type: 'doc',
          content: [{ type: 'bookmarkStart', attrs: { name: 'stale-cache-bm', id: '12' } }],
        },
      },
    });
    const liveHeaderEditor = makeEditor([{ name: 'live-header-session-bm', id: '13' }]);
    const unregister = registerLiveStorySessionRuntime(
      hostEditor,
      {
        locator: { kind: 'story', storyType: 'headerFooterPart', refId: 'rIdHeader' },
        storyKey: 'hf:part:rIdHeader',
        editor: hostEditor,
        kind: 'headerFooter',
      },
      liveHeaderEditor,
    );

    try {
      const bookmarks = findAllBookmarksInDocument(hostEditor).filter(
        (bookmark) => bookmark.storyKey === 'hf:part:rIdHeader',
      );

      expect(bookmarks).toEqual([{ name: 'live-header-session-bm', bookmarkId: '13', storyKey: 'hf:part:rIdHeader' }]);
    } finally {
      unregister();
    }
  });

  it('prefers a live footer session editor over stale converter footer data for the same part', () => {
    const hostEditor = makeEditor([], {
      footerEditors: [{ id: 'rIdFooter', editor: makeEditor([{ name: 'stale-editor-bm', id: '21' }]) }],
      footers: {
        rIdFooter: {
          type: 'doc',
          content: [{ type: 'bookmarkStart', attrs: { name: 'stale-cache-bm', id: '22' } }],
        },
      },
    });
    const liveFooterEditor = makeEditor([{ name: 'live-footer-session-bm', id: '23' }]);
    const unregister = registerLiveStorySessionRuntime(
      hostEditor,
      {
        locator: { kind: 'story', storyType: 'headerFooterPart', refId: 'rIdFooter' },
        storyKey: 'hf:part:rIdFooter',
        editor: hostEditor,
        kind: 'headerFooter',
      },
      liveFooterEditor,
    );

    try {
      const bookmarks = findAllBookmarksInDocument(hostEditor).filter(
        (bookmark) => bookmark.storyKey === 'hf:part:rIdFooter',
      );

      expect(bookmarks).toEqual([{ name: 'live-footer-session-bm', bookmarkId: '23', storyKey: 'hf:part:rIdFooter' }]);
    } finally {
      unregister();
    }
  });

  it('does not double-count the same concrete header part referenced by multiple slots', () => {
    const editor = makeEditor([], {
      headers: {
        rIdShared: {
          type: 'doc',
          content: [{ type: 'bookmarkStart', attrs: { name: 'shared-header-bm', id: '20' } }],
        },
      },
      footers: {
        rIdShared: {
          type: 'doc',
          content: [{ type: 'bookmarkStart', attrs: { name: 'ignored-footer-bm', id: '21' } }],
        },
      },
    });

    const bookmarks = findAllBookmarksInDocument(editor).filter(
      (bookmark) => bookmark.storyKey === 'hf:part:rIdShared',
    );

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]).toEqual({ name: 'shared-header-bm', bookmarkId: '20', storyKey: 'hf:part:rIdShared' });
  });

  it('prefers a real note 0 entry over a continuationSeparator note 0 entry', () => {
    const editor = makeEditor([], {
      footnotes: [
        { id: '0', type: 'continuationSeparator', content: [] },
        { id: '0', type: null, content: [{ type: 'bookmarkStart', attrs: { name: 'real-note-zero-bm', id: '30' } }] },
      ],
    });

    expect(findAllBookmarksInDocument(editor)).toEqual(
      expect.arrayContaining([{ name: 'real-note-zero-bm', bookmarkId: '30', storyKey: 'fn:0' }]),
    );
  });

  it('prefers a live footnote session editor over cached note data for the same note', () => {
    const hostEditor = makeEditor([], {
      footnotes: [{ id: 'fn-1', content: [{ type: 'bookmarkStart', attrs: { name: 'stale-footnote-bm', id: '31' } }] }],
    });
    const liveFootnoteEditor = makeEditor([{ name: 'live-footnote-bm', id: '32' }]);
    const unregister = registerLiveStorySessionRuntime(
      hostEditor,
      {
        locator: { kind: 'story', storyType: 'footnote', noteId: 'fn-1' },
        storyKey: 'fn:fn-1',
        editor: hostEditor,
        kind: 'note',
      },
      liveFootnoteEditor,
    );

    try {
      const bookmarks = findAllBookmarksInDocument(hostEditor).filter((bookmark) => bookmark.storyKey === 'fn:fn-1');
      expect(bookmarks).toEqual([{ name: 'live-footnote-bm', bookmarkId: '32', storyKey: 'fn:fn-1' }]);
    } finally {
      unregister();
    }
  });

  it('prefers a live endnote session editor over cached note data for the same note', () => {
    const hostEditor = makeEditor([], {
      endnotes: [{ id: 'en-1', content: [{ type: 'bookmarkStart', attrs: { name: 'stale-endnote-bm', id: '41' } }] }],
    });
    const liveEndnoteEditor = makeEditor([{ name: 'live-endnote-bm', id: '42' }]);
    const unregister = registerLiveStorySessionRuntime(
      hostEditor,
      {
        locator: { kind: 'story', storyType: 'endnote', noteId: 'en-1' },
        storyKey: 'en:en-1',
        editor: hostEditor,
        kind: 'note',
      },
      liveEndnoteEditor,
    );

    try {
      const bookmarks = findAllBookmarksInDocument(hostEditor).filter((bookmark) => bookmark.storyKey === 'en:en-1');
      expect(bookmarks).toEqual([{ name: 'live-endnote-bm', bookmarkId: '42', storyKey: 'en:en-1' }]);
    } finally {
      unregister();
    }
  });

  it('collects bookmarkEnd marker ids for document-wide id allocation', () => {
    const editor = makeEditor(
      [
        { name: 'body-start', id: '1' },
        { type: 'bookmarkEnd', id: '9' },
      ],
      {
        headers: {
          rIdHeader: {
            type: 'doc',
            content: [{ type: 'bookmarkEnd', attrs: { id: '10' } }],
          },
        },
        footnotes: [{ id: 'fn-1', content: [{ type: 'bookmarkEnd', attrs: { id: '11' } }] }],
      },
    );

    expect(findAllBookmarkMarkersInDocument(editor)).toEqual(
      expect.arrayContaining([
        { bookmarkId: '1', storyKey: 'body', markerType: 'bookmarkStart' },
        { bookmarkId: '9', storyKey: 'body', markerType: 'bookmarkEnd' },
        { bookmarkId: '10', storyKey: 'hf:part:rIdHeader', markerType: 'bookmarkEnd' },
        { bookmarkId: '11', storyKey: 'fn:fn-1', markerType: 'bookmarkEnd' },
      ]),
    );
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

describe('buildBookmarkDiscoveryItem', () => {
  it('includes story in address for non-body bookmarks', () => {
    const doc = makePmDoc([]);
    const resolved = {
      node: { type: { name: 'bookmarkStart' }, attrs: { name: 'hdr-bm', id: '3' } },
      pos: 1,
      name: 'hdr-bm',
      bookmarkId: '3',
      endPos: 2,
    } as any;
    const story = { kind: 'story' as const, storyType: 'headerFooterPart' as const, refId: 'rId7' };

    const item = buildBookmarkDiscoveryItem(doc, resolved, 'rev-1', story);

    expect(item.address).toEqual({
      kind: 'entity',
      entityType: 'bookmark',
      name: 'hdr-bm',
      story,
    });
  });

  it('includes an encoded story scope in discovery IDs when provided', () => {
    const doc = makePmDoc([]);
    const resolved = {
      node: { type: { name: 'bookmarkStart' }, attrs: { name: 'shared bm', id: '3' } },
      pos: 1,
      name: 'shared bm',
      bookmarkId: '3',
      endPos: 2,
    } as any;
    const story = { kind: 'story' as const, storyType: 'headerFooterPart' as const, refId: 'rId7' };

    const item = buildBookmarkDiscoveryItem(doc, resolved, 'rev:1', story, 'hf:part:rId7');

    expect(item.id).toBe('bookmark:hf%3Apart%3ArId7:shared%20bm:rev%3A1');
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
