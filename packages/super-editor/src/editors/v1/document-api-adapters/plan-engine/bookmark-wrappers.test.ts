import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { BookmarkInsertInput } from '@superdoc/document-api';

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn((_editor: Editor, handler: () => boolean) => ({
    steps: [{ effect: handler() ? 'changed' : 'noop' }],
  })),
  resolveWriteStoryRuntime: vi.fn((editor: Editor) => ({
    locator: { kind: 'story', storyType: 'body' },
    storyKey: 'story:body',
    editor,
    kind: 'body',
  })),
  disposeEphemeralWriteRuntime: vi.fn(),
}));

vi.mock('./revision-tracker.js', () => ({
  getRevision: vi.fn(() => 'rev-1'),
  checkRevision: vi.fn(),
}));

vi.mock('../helpers/adapter-utils.js', () => ({
  paginate: vi.fn((items: unknown[], offset = 0, limit?: number) => {
    const total = items.length;
    const sliced = items.slice(offset, limit ? offset + limit : undefined);
    return { total, items: sliced };
  }),
  resolveInlineInsertPosition: vi.fn(() => ({ from: 5, to: 8 })),
}));

vi.mock('../helpers/mutation-helpers.js', () => ({
  rejectTrackedMode: vi.fn(),
}));

vi.mock('../helpers/index-cache.js', () => ({
  clearIndexCache: vi.fn(),
}));

vi.mock('../helpers/bookmark-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../helpers/bookmark-resolver.js')>();
  return {
    ...actual,
    findAllBookmarks: vi.fn(() => []),
    findAllBookmarksInDocument: vi.fn(() => []),
    resolveBookmarkTarget: vi.fn(),
    extractBookmarkInfo: vi.fn(),
    buildBookmarkDiscoveryItem: vi.fn(),
  };
});

vi.mock('../story-runtime/resolve-story-runtime.js', () => ({
  resolveStoryRuntime: vi.fn((editor: Editor) => ({
    locator: { kind: 'story', storyType: 'body' },
    storyKey: 'story:body',
    editor,
    kind: 'body',
  })),
}));

import {
  bookmarksListWrapper,
  bookmarksGetWrapper,
  bookmarksInsertWrapper,
  bookmarksRenameWrapper,
  bookmarksRemoveWrapper,
} from './bookmark-wrappers.js';
import { resolveInlineInsertPosition, paginate } from '../helpers/adapter-utils.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import {
  findAllBookmarks,
  findAllBookmarksInDocument,
  resolveBookmarkTarget,
  extractBookmarkInfo,
  buildBookmarkDiscoveryItem,
} from '../helpers/bookmark-resolver.js';
import { executeDomainCommand, resolveWriteStoryRuntime, disposeEphemeralWriteRuntime } from './plan-wrappers.js';
import { resolveStoryRuntime } from '../story-runtime/resolve-story-runtime.js';
import { getRevision, checkRevision } from './revision-tracker.js';

type BookmarkNode = {
  type: { name: string };
  attrs?: Record<string, unknown>;
};

function makeEditor(existingNodes: BookmarkNode[] = []): {
  editor: Editor;
  tr: {
    insert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    setNodeMarkup: ReturnType<typeof vi.fn>;
    doc: { nodeAt: ReturnType<typeof vi.fn> };
  };
  startCreate: ReturnType<typeof vi.fn>;
  endCreate: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
  insertBookmark: ReturnType<typeof vi.fn>;
} {
  const stateDoc = {
    descendants: (cb: (node: BookmarkNode, pos: number) => boolean | void) => {
      existingNodes.forEach((node, index) => cb(node, index + 1));
      return true;
    },
  };

  const tr = {
    insert: vi.fn((_pos: number, _node: unknown) => tr),
    delete: vi.fn((_from: number, _to: number) => tr),
    setNodeMarkup: vi.fn(() => tr),
    doc: { nodeAt: vi.fn(() => ({ nodeSize: 1 })) },
  };

  const startCreate = vi.fn((attrs: Record<string, unknown>) => ({ type: 'bookmarkStart', attrs, nodeSize: 1 }));
  const endCreate = vi.fn((attrs: Record<string, unknown>) => ({ type: 'bookmarkEnd', attrs, nodeSize: 1 }));
  const dispatch = vi.fn();
  const insertBookmark = vi.fn(() => true);

  const editor = {
    state: {
      doc: stateDoc,
      tr,
    },
    schema: {
      nodes: {
        bookmarkStart: { create: startCreate },
        bookmarkEnd: { create: endCreate },
      },
    },
    commands: {
      insertBookmark,
    },
    dispatch,
  } as unknown as Editor;

  return { editor, tr, startCreate, endCreate, dispatch, insertBookmark };
}

function makeInput(name = 'bm1'): BookmarkInsertInput {
  return {
    name,
    at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 3 } }] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bookmarksInsertWrapper', () => {
  it('inserts bookmarkEnd then bookmarkStart with a shared next numeric id', () => {
    const { editor, tr, dispatch, insertBookmark } = makeEditor([
      { type: { name: 'bookmarkStart' }, attrs: { id: '2' } },
      { type: { name: 'bookmarkEnd' }, attrs: { id: '9' } },
      { type: { name: 'bookmarkStart' }, attrs: { id: 'not-a-number' } },
    ]);
    const existingEntries = [
      { name: 'a', bookmarkId: '2', storyKey: 'body' },
      { name: 'b', bookmarkId: '9', storyKey: 'body' },
      { name: 'c', bookmarkId: 'not-a-number', storyKey: 'body' },
    ];
    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce(existingEntries).mockReturnValueOnce(existingEntries);

    const result = bookmarksInsertWrapper(editor, makeInput());

    expect(result).toEqual({
      success: true,
      bookmark: { kind: 'entity', entityType: 'bookmark', name: 'bm1' },
    });

    expect(tr.insert).toHaveBeenCalledTimes(2);
    expect(tr.insert).toHaveBeenNthCalledWith(1, 8, { type: 'bookmarkEnd', attrs: { id: '10' }, nodeSize: 1 });
    expect(tr.insert).toHaveBeenNthCalledWith(2, 5, {
      type: 'bookmarkStart',
      attrs: { name: 'bm1', id: '10' },
      nodeSize: 1,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(clearIndexCache).toHaveBeenCalledTimes(1);
    expect(insertBookmark).not.toHaveBeenCalled();
    expect(tr.delete).not.toHaveBeenCalled();
  });

  it('supports collapsed targets and carries table-column attrs on bookmarkStart', () => {
    vi.mocked(resolveInlineInsertPosition).mockReturnValueOnce({ from: 7, to: 7 });
    const { editor, tr } = makeEditor();

    const result = bookmarksInsertWrapper(editor, {
      ...makeInput('bm-table'),
      tableColumn: { colFirst: 1, colLast: 3 },
    });

    expect(result.success).toBe(true);
    expect(tr.insert).toHaveBeenNthCalledWith(1, 7, { type: 'bookmarkEnd', attrs: { id: '0' }, nodeSize: 1 });
    expect(tr.insert).toHaveBeenNthCalledWith(2, 7, {
      type: 'bookmarkStart',
      attrs: { name: 'bm-table', id: '0', colFirst: 1, colLast: 3 },
      nodeSize: 1,
    });
  });

  it('returns a story-qualified bookmark address and commits non-body story inserts', () => {
    const { editor } = makeEditor();
    const commit = vi.fn();
    vi.mocked(resolveWriteStoryRuntime).mockReturnValueOnce({
      locator: { kind: 'story', storyType: 'footnote', noteId: 'fn-1' },
      storyKey: 'story:footnote:fn-1',
      editor,
      kind: 'note',
      commit,
    } as any);

    const result = bookmarksInsertWrapper(editor, {
      name: 'bm-footnote',
      at: {
        kind: 'text',
        story: { kind: 'story', storyType: 'footnote', noteId: 'fn-1' },
        segments: [{ blockId: 'p1', range: { start: 0, end: 3 } }],
      },
    });

    expect(result).toEqual({
      success: true,
      bookmark: {
        kind: 'entity',
        entityType: 'bookmark',
        name: 'bm-footnote',
        story: { kind: 'story', storyType: 'footnote', noteId: 'fn-1' },
      },
    });
    expect(commit).toHaveBeenCalledWith(editor);
  });

  it('checks expectedRevision on the host editor before a non-body insert', () => {
    const { editor: hostEditor } = makeEditor();
    const { editor: storyEditor } = makeEditor();
    const footnoteLocator = { kind: 'story' as const, storyType: 'footnote' as const, noteId: 'fn-1' };

    vi.mocked(resolveWriteStoryRuntime).mockReturnValueOnce({
      locator: footnoteLocator,
      storyKey: 'story:footnote:fn-1',
      editor: storyEditor,
      kind: 'note',
      commit: vi.fn(),
    } as any);

    bookmarksInsertWrapper(
      hostEditor,
      {
        name: 'bm-footnote',
        at: {
          kind: 'text',
          story: footnoteLocator,
          segments: [{ blockId: 'p1', range: { start: 0, end: 3 } }],
        },
      },
      { expectedRevision: 'rev-host' },
    );

    expect(checkRevision).toHaveBeenCalledWith(hostEditor, 'rev-host');
    expect(executeDomainCommand).toHaveBeenCalledWith(storyEditor, expect.any(Function));
  });

  it('returns NO_OP when a bookmark with the same name already exists', () => {
    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([{ name: 'bm1', bookmarkId: '0', storyKey: 'body' }]);
    const { editor, tr, dispatch } = makeEditor();

    const result = bookmarksInsertWrapper(editor, makeInput('bm1'));

    expect(result).toEqual({
      success: false,
      failure: { code: 'NO_OP', message: 'Bookmark with name "bm1" already exists.' },
    });
    expect(resolveInlineInsertPosition).not.toHaveBeenCalled();
    expect(tr.insert).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns NO_OP when the same bookmark name already exists in another story', () => {
    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([
      { name: 'bm1', bookmarkId: '55', storyKey: 'hf:part:rId7' },
    ]);
    const { editor, tr, dispatch } = makeEditor();

    const result = bookmarksInsertWrapper(editor, makeInput('bm1'));

    expect(result).toEqual({
      success: false,
      failure: { code: 'NO_OP', message: 'Bookmark with name "bm1" already exists.' },
    });
    expect(resolveInlineInsertPosition).not.toHaveBeenCalled();
    expect(tr.insert).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('throws CAPABILITY_UNAVAILABLE when bookmark nodes are missing from schema', () => {
    const { editor } = makeEditor();
    (editor as unknown as { schema: { nodes: Record<string, unknown> } }).schema.nodes = {};

    expect(() => bookmarksInsertWrapper(editor, makeInput())).toThrowError(
      expect.objectContaining({
        name: 'DocumentApiAdapterError',
        code: 'CAPABILITY_UNAVAILABLE',
      }),
    );
  });
});

describe('bookmarksRenameWrapper', () => {
  it('renames a body bookmark and returns a plain address without commit', () => {
    const { editor, tr } = makeEditor();

    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce({
      pos: 5,
      name: 'old-name',
      bookmarkId: '1',
      endPos: 8,
      node: { attrs: { name: 'old-name', id: '1' } } as never,
    });

    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([]);

    const result = bookmarksRenameWrapper(editor, {
      target: { kind: 'entity', entityType: 'bookmark', name: 'old-name' },
      newName: 'new-name',
    });

    expect(result).toEqual({
      success: true,
      bookmark: { kind: 'entity', entityType: 'bookmark', name: 'new-name' },
    });
    expect(result.success && !('story' in result.bookmark)).toBe(true);
    expect(tr.setNodeMarkup).toHaveBeenCalledWith(5, undefined, { name: 'new-name', id: '1' });
    expect(disposeEphemeralWriteRuntime).toHaveBeenCalled();
  });

  it('returns a story-qualified address and commits non-body story renames', () => {
    const { editor } = makeEditor();
    const commit = vi.fn();
    const footnoteLocator = { kind: 'story' as const, storyType: 'footnote' as const, noteId: 'fn-1' };

    vi.mocked(resolveWriteStoryRuntime).mockReturnValueOnce({
      locator: footnoteLocator,
      storyKey: 'story:footnote:fn-1',
      editor,
      kind: 'note',
      commit,
    } as any);

    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce({
      pos: 5,
      name: 'old-name',
      bookmarkId: '1',
      endPos: 8,
      node: { attrs: { name: 'old-name', id: '1' } } as never,
    });

    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([]);

    const result = bookmarksRenameWrapper(editor, {
      target: { kind: 'entity', entityType: 'bookmark', name: 'old-name', story: footnoteLocator },
      newName: 'new-name',
    });

    expect(result).toEqual({
      success: true,
      bookmark: {
        kind: 'entity',
        entityType: 'bookmark',
        name: 'new-name',
        story: footnoteLocator,
      },
    });
    expect(commit).toHaveBeenCalledWith(editor);
    expect(disposeEphemeralWriteRuntime).toHaveBeenCalled();
  });

  it('checks expectedRevision on the host editor before a non-body rename', () => {
    const { editor: hostEditor } = makeEditor();
    const { editor: storyEditor } = makeEditor();
    const footnoteLocator = { kind: 'story' as const, storyType: 'footnote' as const, noteId: 'fn-1' };

    vi.mocked(resolveWriteStoryRuntime).mockReturnValueOnce({
      locator: footnoteLocator,
      storyKey: 'story:footnote:fn-1',
      editor: storyEditor,
      kind: 'note',
      commit: vi.fn(),
    } as any);
    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce({
      pos: 5,
      name: 'old-name',
      bookmarkId: '1',
      endPos: 8,
      node: { attrs: { name: 'old-name', id: '1' } } as never,
    });
    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([]);

    bookmarksRenameWrapper(
      hostEditor,
      {
        target: { kind: 'entity', entityType: 'bookmark', name: 'old-name', story: footnoteLocator },
        newName: 'new-name',
      },
      { expectedRevision: 'rev-host' },
    );

    expect(checkRevision).toHaveBeenCalledWith(hostEditor, 'rev-host');
    expect(executeDomainCommand).toHaveBeenCalledWith(storyEditor, expect.any(Function));
  });

  it('throws INVALID_INPUT when the new name exists in another story', () => {
    const { editor, tr } = makeEditor();

    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce({
      pos: 5,
      name: 'old-name',
      bookmarkId: '1',
      endPos: 8,
      node: { attrs: { name: 'old-name', id: '1' } } as never,
    });

    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([
      { name: 'taken-name', bookmarkId: '77', storyKey: 'hf:part:rId7' },
    ]);

    expect(() =>
      bookmarksRenameWrapper(editor, {
        target: { kind: 'entity', entityType: 'bookmark', name: 'old-name' },
        newName: 'taken-name',
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'DocumentApiAdapterError',
        code: 'INVALID_INPUT',
      }),
    );
    expect(tr.setNodeMarkup).not.toHaveBeenCalled();
  });
});

describe('bookmarksRemoveWrapper', () => {
  it('removes a body bookmark and returns a plain address without commit', () => {
    const { editor, tr } = makeEditor();

    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce({
      pos: 5,
      name: 'bm-remove',
      bookmarkId: '1',
      endPos: 8,
      node: { attrs: { name: 'bm-remove', id: '1' }, nodeSize: 1 } as never,
    });

    const result = bookmarksRemoveWrapper(editor, {
      target: { kind: 'entity', entityType: 'bookmark', name: 'bm-remove' },
    });

    expect(result).toEqual({
      success: true,
      bookmark: { kind: 'entity', entityType: 'bookmark', name: 'bm-remove' },
    });
    expect(result.success && !('story' in result.bookmark)).toBe(true);
    expect(tr.delete).toHaveBeenCalled();
    expect(disposeEphemeralWriteRuntime).toHaveBeenCalled();
  });

  it('returns a story-qualified address and commits non-body story removals', () => {
    const { editor } = makeEditor();
    const commit = vi.fn();
    const footnoteLocator = { kind: 'story' as const, storyType: 'footnote' as const, noteId: 'fn-1' };

    vi.mocked(resolveWriteStoryRuntime).mockReturnValueOnce({
      locator: footnoteLocator,
      storyKey: 'story:footnote:fn-1',
      editor,
      kind: 'note',
      commit,
    } as any);

    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce({
      pos: 5,
      name: 'bm-remove',
      bookmarkId: '1',
      endPos: 8,
      node: { attrs: { name: 'bm-remove', id: '1' }, nodeSize: 1 } as never,
    });

    const result = bookmarksRemoveWrapper(editor, {
      target: { kind: 'entity', entityType: 'bookmark', name: 'bm-remove', story: footnoteLocator },
    });

    expect(result).toEqual({
      success: true,
      bookmark: {
        kind: 'entity',
        entityType: 'bookmark',
        name: 'bm-remove',
        story: footnoteLocator,
      },
    });
    expect(commit).toHaveBeenCalledWith(editor);
    expect(disposeEphemeralWriteRuntime).toHaveBeenCalled();
  });

  it('checks expectedRevision on the host editor before a non-body removal', () => {
    const { editor: hostEditor } = makeEditor();
    const { editor: storyEditor } = makeEditor();
    const footnoteLocator = { kind: 'story' as const, storyType: 'footnote' as const, noteId: 'fn-1' };

    vi.mocked(resolveWriteStoryRuntime).mockReturnValueOnce({
      locator: footnoteLocator,
      storyKey: 'story:footnote:fn-1',
      editor: storyEditor,
      kind: 'note',
      commit: vi.fn(),
    } as any);
    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce({
      pos: 5,
      name: 'bm-remove',
      bookmarkId: '1',
      endPos: 8,
      node: { attrs: { name: 'bm-remove', id: '1' }, nodeSize: 1 } as never,
    });

    bookmarksRemoveWrapper(
      hostEditor,
      {
        target: { kind: 'entity', entityType: 'bookmark', name: 'bm-remove', story: footnoteLocator },
      },
      { expectedRevision: 'rev-host' },
    );

    expect(checkRevision).toHaveBeenCalledWith(hostEditor, 'rev-host');
    expect(executeDomainCommand).toHaveBeenCalledWith(storyEditor, expect.any(Function));
  });
});

describe('bookmarksListWrapper', () => {
  it('lists all bookmarks in the body story', () => {
    const { editor } = makeEditor();
    const mockBookmarks = [
      { node: {}, pos: 5, name: 'bm1', bookmarkId: '0', endPos: 10 },
      { node: {}, pos: 20, name: 'bm2', bookmarkId: '1', endPos: 25 },
    ];
    const mockDiscoveryItem = { id: 'mock', handle: {}, domain: {} };

    vi.mocked(resolveStoryRuntime).mockReturnValueOnce({
      locator: { kind: 'story', storyType: 'body' },
      storyKey: 'body',
      editor,
      kind: 'body',
    } as any);
    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([
      { name: 'bm1', bookmarkId: '0', storyKey: 'body' },
      { name: 'bm2', bookmarkId: '1', storyKey: 'body' },
    ]);
    vi.mocked(findAllBookmarks).mockReturnValueOnce(mockBookmarks as never);
    vi.mocked(buildBookmarkDiscoveryItem).mockReturnValue(mockDiscoveryItem as never);
    vi.mocked(getRevision).mockReturnValueOnce('rev-list').mockReturnValueOnce('rev-story');

    const result = bookmarksListWrapper(editor);

    expect(findAllBookmarks).toHaveBeenCalledWith(editor.state.doc);
    expect(buildBookmarkDiscoveryItem).toHaveBeenCalledTimes(2);
    expect(buildBookmarkDiscoveryItem).toHaveBeenCalledWith(editor.state.doc, mockBookmarks[0], 'rev-story', {
      kind: 'story',
      storyType: 'body',
    });
    expect(result.total).toBe(2);
    expect(result.evaluatedRevision).toBe('rev-list');
  });

  it('lists bookmarks across multiple stories when query.in is omitted', () => {
    const { editor: bodyEditor } = makeEditor();
    const { editor: headerEditor } = makeEditor();
    const headerLocator = { kind: 'story' as const, storyType: 'headerFooterPart' as const, refId: 'rId7' };

    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([
      { name: 'body-bm', bookmarkId: '0', storyKey: 'body' },
      { name: 'header-bm', bookmarkId: '1', storyKey: 'hf:part:rId7' },
    ]);
    vi.mocked(resolveStoryRuntime)
      .mockReturnValueOnce({
        locator: { kind: 'story', storyType: 'body' },
        storyKey: 'body',
        editor: bodyEditor,
        kind: 'body',
      } as any)
      .mockReturnValueOnce({
        locator: headerLocator,
        storyKey: 'hf:part:rId7',
        editor: headerEditor,
        kind: 'headerFooter',
      } as any);
    vi.mocked(findAllBookmarks)
      .mockReturnValueOnce([{ node: {}, pos: 5, name: 'body-bm', bookmarkId: '0', endPos: 10 }] as never)
      .mockReturnValueOnce([{ node: {}, pos: 3, name: 'header-bm', bookmarkId: '1', endPos: 8 }] as never);
    vi.mocked(buildBookmarkDiscoveryItem)
      .mockReturnValueOnce({ id: 'body-item', handle: {}, domain: {} } as never)
      .mockReturnValueOnce({ id: 'header-item', handle: {}, domain: {} } as never);
    vi.mocked(getRevision)
      .mockReturnValueOnce('rev-list')
      .mockReturnValueOnce('rev-body')
      .mockReturnValueOnce('rev-header');

    const result = bookmarksListWrapper(bodyEditor);

    expect(resolveStoryRuntime).toHaveBeenNthCalledWith(1, bodyEditor, undefined);
    expect(resolveStoryRuntime).toHaveBeenNthCalledWith(2, bodyEditor, headerLocator);
    expect(buildBookmarkDiscoveryItem).toHaveBeenNthCalledWith(
      1,
      bodyEditor.state.doc,
      { node: {}, pos: 5, name: 'body-bm', bookmarkId: '0', endPos: 10 },
      'rev-body',
      { kind: 'story', storyType: 'body' },
    );
    expect(buildBookmarkDiscoveryItem).toHaveBeenNthCalledWith(
      2,
      headerEditor.state.doc,
      { node: {}, pos: 3, name: 'header-bm', bookmarkId: '1', endPos: 8 },
      'rev-header',
      headerLocator,
    );
    expect(result.total).toBe(2);
  });

  it('resolves a non-body story runtime when query.in is provided', () => {
    const { editor } = makeEditor();
    const headerLocator = { kind: 'story' as const, storyType: 'headerFooterPart' as const, refId: 'rId7' };

    vi.mocked(resolveStoryRuntime).mockReturnValueOnce({
      locator: headerLocator,
      storyKey: 'hf:part:rId7',
      editor,
      kind: 'headerFooter',
    } as any);
    vi.mocked(findAllBookmarks).mockReturnValueOnce([]);
    vi.mocked(getRevision).mockReturnValueOnce('rev-story').mockReturnValueOnce('rev-host');

    const result = bookmarksListWrapper(editor, { in: headerLocator });

    expect(resolveStoryRuntime).toHaveBeenCalledWith(editor, headerLocator);
    expect(result.evaluatedRevision).toBe('rev-host');
  });

  it('applies pagination via offset and limit', () => {
    const { editor } = makeEditor();
    const mockBookmarks = [
      { node: {}, pos: 5, name: 'bm1', bookmarkId: '0', endPos: 10 },
      { node: {}, pos: 20, name: 'bm2', bookmarkId: '1', endPos: 25 },
      { node: {}, pos: 40, name: 'bm3', bookmarkId: '2', endPos: 45 },
    ];

    vi.mocked(resolveStoryRuntime).mockReturnValueOnce({
      locator: { kind: 'story', storyType: 'body' },
      storyKey: 'body',
      editor,
      kind: 'body',
    } as any);
    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([
      { name: 'bm1', bookmarkId: '0', storyKey: 'body' },
      { name: 'bm2', bookmarkId: '1', storyKey: 'body' },
      { name: 'bm3', bookmarkId: '2', storyKey: 'body' },
    ]);
    vi.mocked(findAllBookmarks).mockReturnValueOnce(mockBookmarks as never);
    vi.mocked(buildBookmarkDiscoveryItem).mockReturnValue({ id: 'mock', handle: {}, domain: {} } as never);
    vi.mocked(getRevision).mockReturnValueOnce('rev-3');

    const result = bookmarksListWrapper(editor, { offset: 1, limit: 1 });

    expect(paginate).toHaveBeenCalledWith(expect.any(Array), 1, 1);
    expect(result.total).toBe(3);
  });
});

describe('bookmarksGetWrapper', () => {
  it('resolves a bookmark by name and returns its info', () => {
    const { editor } = makeEditor();
    const target = { kind: 'entity' as const, entityType: 'bookmark' as const, name: 'bm1' };
    const mockResolved = { node: {}, pos: 5, name: 'bm1', bookmarkId: '0', endPos: 10 };
    const mockInfo = {
      address: { kind: 'entity', entityType: 'bookmark', name: 'bm1' },
      name: 'bm1',
      bookmarkId: '0',
      range: { from: { blockId: 'p1', offset: 5 }, to: { blockId: 'p1', offset: 10 } },
    };

    vi.mocked(resolveStoryRuntime).mockReturnValueOnce({
      locator: { kind: 'story', storyType: 'body' },
      storyKey: 'body',
      editor,
      kind: 'body',
    } as any);
    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([{ name: 'bm1', bookmarkId: '0', storyKey: 'body' }]);
    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce(mockResolved as never);
    vi.mocked(extractBookmarkInfo).mockReturnValueOnce(mockInfo as never);

    const result = bookmarksGetWrapper(editor, { target });

    expect(resolveBookmarkTarget).toHaveBeenCalledWith(editor.state.doc, target);
    expect(extractBookmarkInfo).toHaveBeenCalledWith(editor.state.doc, mockResolved, {
      kind: 'story',
      storyType: 'body',
    });
    expect(result).toEqual(mockInfo);
  });

  it('resolves a story-qualified bookmark in a header', () => {
    const { editor } = makeEditor();
    const headerLocator = { kind: 'story' as const, storyType: 'headerFooterPart' as const, refId: 'rId7' };
    const target = { kind: 'entity' as const, entityType: 'bookmark' as const, name: 'hdr-bm', story: headerLocator };
    const mockResolved = { node: {}, pos: 3, name: 'hdr-bm', bookmarkId: '5', endPos: 8 };
    const mockInfo = {
      address: { kind: 'entity', entityType: 'bookmark', name: 'hdr-bm', story: headerLocator },
      name: 'hdr-bm',
      bookmarkId: '5',
      range: { from: { blockId: 'h1', offset: 3 }, to: { blockId: 'h1', offset: 8 } },
    };

    vi.mocked(resolveStoryRuntime).mockReturnValueOnce({
      locator: headerLocator,
      storyKey: 'hf:part:rId7',
      editor,
      kind: 'headerFooter',
    } as any);
    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce(mockResolved as never);
    vi.mocked(extractBookmarkInfo).mockReturnValueOnce(mockInfo as never);

    const result = bookmarksGetWrapper(editor, { target });

    expect(resolveStoryRuntime).toHaveBeenCalledWith(editor, headerLocator);
    expect(extractBookmarkInfo).toHaveBeenCalledWith(editor.state.doc, mockResolved, headerLocator);
    expect(result).toEqual(mockInfo);
  });

  it('finds a header bookmark document-wide when story is omitted', () => {
    const { editor: bodyEditor } = makeEditor();
    const { editor: headerEditor } = makeEditor();
    const headerLocator = { kind: 'story' as const, storyType: 'headerFooterPart' as const, refId: 'rId7' };
    const target = { kind: 'entity' as const, entityType: 'bookmark' as const, name: 'hdr-bm' };
    const mockResolved = { node: {}, pos: 3, name: 'hdr-bm', bookmarkId: '5', endPos: 8 };
    const mockInfo = {
      address: { kind: 'entity', entityType: 'bookmark', name: 'hdr-bm', story: headerLocator },
      name: 'hdr-bm',
      bookmarkId: '5',
      range: { from: { blockId: 'h1', offset: 3 }, to: { blockId: 'h1', offset: 8 } },
    };

    vi.mocked(findAllBookmarksInDocument).mockReturnValueOnce([
      { name: 'hdr-bm', bookmarkId: '5', storyKey: 'hf:part:rId7' },
    ]);
    vi.mocked(resolveStoryRuntime).mockReturnValueOnce({
      locator: headerLocator,
      storyKey: 'hf:part:rId7',
      editor: headerEditor,
      kind: 'headerFooter',
    } as any);
    vi.mocked(resolveBookmarkTarget).mockReturnValueOnce(mockResolved as never);
    vi.mocked(extractBookmarkInfo).mockReturnValueOnce(mockInfo as never);

    const result = bookmarksGetWrapper(bodyEditor, { target });

    expect(resolveStoryRuntime).toHaveBeenCalledWith(bodyEditor, headerLocator);
    expect(resolveBookmarkTarget).toHaveBeenCalledWith(headerEditor.state.doc, target);
    expect(extractBookmarkInfo).toHaveBeenCalledWith(headerEditor.state.doc, mockResolved, headerLocator);
    expect(result).toEqual(mockInfo);
  });
});
