import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { BookmarkInsertInput } from '@superdoc/document-api';

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn((_editor: Editor, handler: () => boolean) => ({
    steps: [{ effect: handler() ? 'changed' : 'noop' }],
  })),
}));

vi.mock('./revision-tracker.js', () => ({
  getRevision: vi.fn(() => 'rev-1'),
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

vi.mock('../helpers/bookmark-resolver.js', () => ({
  findAllBookmarks: vi.fn(() => []),
  resolveBookmarkTarget: vi.fn(),
  extractBookmarkInfo: vi.fn(),
  buildBookmarkDiscoveryItem: vi.fn(),
}));

import { bookmarksInsertWrapper } from './bookmark-wrappers.js';
import { resolveInlineInsertPosition } from '../helpers/adapter-utils.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { findAllBookmarks } from '../helpers/bookmark-resolver.js';

type BookmarkNode = {
  type: { name: string };
  attrs?: Record<string, unknown>;
};

function makeEditor(existingNodes: BookmarkNode[] = []): {
  editor: Editor;
  tr: { insert: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
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

  it('returns NO_OP when a bookmark with the same name already exists', () => {
    vi.mocked(findAllBookmarks).mockReturnValueOnce([
      { name: 'bm1', pos: 1, bookmarkId: '0', endPos: 2, node: {} as never },
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
