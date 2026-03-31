import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { findAllBookmarksInDocument } from './bookmark-resolver.js';

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
