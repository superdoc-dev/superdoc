import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrepare = vi.hoisted(() => vi.fn());
const mockSync = vi.hoisted(() => vi.fn());
const mockGetBlockIndex = vi.hoisted(() => vi.fn());
vi.mock('../../document-api-adapters/plan-engine/toc-wrappers.js', () => ({
  prepareTableOfContentsInsertion: (...args) => mockPrepare(...args),
}));

vi.mock('../../document-api-adapters/helpers/toc-bookmark-sync.js', () => ({
  syncTocBookmarks: (...args) => mockSync(...args),
}));

vi.mock('../../document-api-adapters/helpers/index-cache.js', () => ({
  getBlockIndex: (...args) => mockGetBlockIndex(...args),
}));

vi.mock('../../document-api-adapters/helpers/node-address-resolver.js', () => ({
  toBlockAddress: vi.fn((candidate) => ({
    kind: 'block',
    nodeType: candidate.nodeType,
    nodeId: candidate.nodeId,
  })),
}));

import {
  insertTableOfContentsAtSelection,
  resolveTableOfContentsCreateLocation,
} from './table-of-contents-insertion.js';

describe('resolveTableOfContentsCreateLocation', () => {
  beforeEach(() => {
    mockGetBlockIndex.mockReset();
  });

  it('inserts before the first top-level block when the selection is at document start', () => {
    const tocType = { name: 'tableOfContents' };
    const doc = {
      childCount: 1,
      child: () => ({ nodeSize: 12 }),
      resolve: vi.fn((pos) => ({
        index: () => 0,
        parent: { canReplaceWith: vi.fn((_from, _to, type) => pos === 1 && type === tocType) },
      })),
    };
    const editor = {
      schema: { nodes: { tableOfContents: tocType } },
      state: { selection: { from: 0 }, doc },
    };
    mockGetBlockIndex.mockReturnValue({
      candidates: [{ pos: 1, end: 13, node: { nodeSize: 12 }, nodeType: 'paragraph', nodeId: 'p1' }],
    });

    expect(resolveTableOfContentsCreateLocation(editor)).toEqual({
      kind: 'before',
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
    });
    expect(doc.resolve).toHaveBeenCalledWith(1);
  });

  it('inserts before the first top-level block when the caret is at the start of the first paragraph', () => {
    const tocType = { name: 'tableOfContents' };
    const doc = {
      childCount: 1,
      child: () => ({ nodeSize: 12 }),
      resolve: vi.fn((pos) => ({
        index: () => 0,
        parent: { canReplaceWith: vi.fn((_from, _to, type) => pos === 1 && type === tocType) },
      })),
    };
    const editor = {
      schema: { nodes: { tableOfContents: tocType } },
      state: { selection: { from: 1 }, doc },
    };
    mockGetBlockIndex.mockReturnValue({
      candidates: [{ pos: 1, end: 13, node: { nodeSize: 12 }, nodeType: 'paragraph', nodeId: 'p1' }],
    });

    expect(resolveTableOfContentsCreateLocation(editor)).toEqual({
      kind: 'before',
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
    });
  });

  it('keeps after-inner placement when the selection is not at document start', () => {
    const tocType = { name: 'tableOfContents' };
    const doc = {
      childCount: 2,
      child: (index) => ({ nodeSize: index === 0 ? 12 : 10 }),
      resolve: vi.fn((pos) => ({
        index: () => 0,
        parent: { canReplaceWith: vi.fn(() => true) },
      })),
    };
    const editor = {
      schema: { nodes: { tableOfContents: tocType } },
      state: { selection: { from: 20 }, doc },
    };
    mockGetBlockIndex.mockReturnValue({
      candidates: [
        { pos: 1, end: 13, node: { nodeSize: 12 }, nodeType: 'paragraph', nodeId: 'p1' },
        { pos: 14, end: 24, node: { nodeSize: 10 }, nodeType: 'paragraph', nodeId: 'p2' },
      ],
    });

    expect(resolveTableOfContentsCreateLocation(editor)).toEqual({
      kind: 'after',
      target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
    });
  });
});

describe('insertTableOfContentsAtSelection', () => {
  beforeEach(() => {
    mockPrepare.mockReset();
    mockSync.mockReset();
    mockGetBlockIndex.mockReset();
  });

  it('dispatches insert then syncs bookmarks synchronously', () => {
    mockGetBlockIndex.mockReturnValue({
      candidates: [{ pos: 10, node: { nodeSize: 10 }, nodeType: 'paragraph', nodeId: 'inner' }],
    });
    mockPrepare.mockReturnValue({
      pos: 7,
      instruction: 'TOC',
      sdBlockId: 'new-toc',
      content: [],
      sources: [{ sdBlockId: 'heading-1' }],
    });

    const insertTableOfContentsAt = vi.fn(() => true);
    const editor = {
      state: {
        selection: { from: 15 },
        doc: { childCount: 1, child: () => ({ nodeSize: 20 }) },
      },
      schema: { nodes: { tableOfContents: {} } },
      commands: { insertTableOfContentsAt },
    };

    expect(insertTableOfContentsAtSelection(editor)).toBe(true);
    expect(insertTableOfContentsAt).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith(editor, [{ sdBlockId: 'heading-1' }]);
  });

  it('returns false without syncing when insert command fails', () => {
    mockGetBlockIndex.mockReturnValue({ candidates: [] });
    mockPrepare.mockReturnValue({
      pos: 99,
      instruction: 'TOC',
      sdBlockId: 'x',
      content: [],
      sources: [],
    });

    const editor = {
      state: { selection: { from: 1 } },
      commands: { insertTableOfContentsAt: vi.fn(() => false) },
    };

    expect(insertTableOfContentsAtSelection(editor)).toBe(false);
    expect(mockSync).not.toHaveBeenCalled();
  });
});
