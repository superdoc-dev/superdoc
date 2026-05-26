import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { CommentAnchor } from '../helpers/comment-target-resolver.js';
import type { CommentEntityRecord } from '../helpers/comment-entity-store.js';
import { createCommentsWrapper } from './comments-wrappers.js';

vi.mock('../helpers/comment-target-resolver.js', () => ({
  listCommentAnchors: vi.fn(() => []),
  resolveCommentAnchorsById: vi.fn(() => []),
}));

vi.mock('../helpers/index-cache.js', () => ({
  getBlockIndex: vi.fn(() => ({ candidates: [] })),
  getInlineIndex: vi.fn(() => ({ byType: new Map() })),
  clearIndexCache: vi.fn(),
}));

vi.mock('./revision-tracker.js', () => ({
  getRevision: vi.fn(() => 'rev-1'),
}));

vi.mock('../tracked-changes/tracked-change-index.js', () => ({
  getTrackedChangeIndex: vi.fn(() => ({ getAll: () => [] })),
}));

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn(),
}));

vi.mock('../helpers/adapter-utils.js', () => ({
  resolveTextTarget: vi.fn(),
  validatePaginationInput: vi.fn(),
  paginate: vi.fn(<T>(items: T[], offset = 0, limit?: number) => {
    const total = items.length;
    const effectiveLimit = limit ?? total;
    return { total, items: items.slice(offset, offset + effectiveLimit) };
  }),
}));

import { listCommentAnchors } from '../helpers/comment-target-resolver.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import { resolveTextTarget } from '../helpers/adapter-utils.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { getTrackedChangeIndex } from '../tracked-changes/tracked-change-index.js';

const listCommentAnchorsMock = listCommentAnchors as unknown as ReturnType<typeof vi.fn>;
const getBlockIndexMock = getBlockIndex as unknown as ReturnType<typeof vi.fn>;
const resolveTextTargetMock = resolveTextTarget as unknown as ReturnType<typeof vi.fn>;
const executeDomainCommandMock = executeDomainCommand as unknown as ReturnType<typeof vi.fn>;
const getTrackedChangeIndexMock = getTrackedChangeIndex as unknown as ReturnType<typeof vi.fn>;

function makeAnchor(
  overrides: Partial<CommentAnchor> & { commentId: string; pos: number; end: number },
): CommentAnchor {
  return {
    importedId: undefined,
    status: 'open',
    target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
    isInternal: undefined,
    attrs: {},
    ...overrides,
  };
}

function makeEditor(comments: CommentEntityRecord[] = [], textContent = 'hello world'): Editor {
  return {
    state: {
      doc: {
        content: { size: 100 },
        textBetween: vi.fn(() => textContent),
      },
    },
    converter: { comments },
    options: {},
  } as unknown as Editor;
}

/**
 * Replaces the editor's `textBetween` mock so successive calls return the
 * given values in order. After all values are exhausted, returns `''`.
 */
function mockTextBetweenSequence(editor: Editor, ...values: string[]): void {
  let i = 0;
  (editor.state!.doc as { textBetween: ReturnType<typeof vi.fn> }).textBetween = vi.fn(() => values[i++] ?? '');
}

beforeEach(() => {
  listCommentAnchorsMock.mockReturnValue([]);
  getBlockIndexMock.mockReturnValue({ candidates: [] });
  getTrackedChangeIndexMock.mockReturnValue({ getAll: () => [] } as never);
});

describe('comments-wrappers: anchoredText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates anchoredText for a root comment with an anchor', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }], 'selected text');
    listCommentAnchorsMock.mockReturnValue([makeAnchor({ commentId: 'c1', pos: 10, end: 23 })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.anchoredText).toBe('selected text');
  });

  it('returns anchoredText as undefined when comment has no anchor', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }]);
    listCommentAnchorsMock.mockReturnValue([]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.anchoredText).toBeUndefined();
  });

  it('inherits anchoredText for reply comments from their parent', () => {
    const editor = makeEditor(
      [
        { commentId: 'c1', commentText: 'Root comment' },
        { commentId: 'c2', parentCommentId: 'c1', commentText: 'Reply' },
      ],
      'anchored excerpt',
    );
    listCommentAnchorsMock.mockReturnValue([makeAnchor({ commentId: 'c1', pos: 5, end: 20 })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    const root = result.items.find((item) => item.id === 'c1');
    const reply = result.items.find((item) => item.id === 'c2');
    expect(root!.anchoredText).toBe('anchored excerpt');
    expect(reply!.anchoredText).toBe('anchored excerpt');
  });

  it('returns anchoredText on comments.get as well', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }], 'get excerpt');
    listCommentAnchorsMock.mockReturnValue([makeAnchor({ commentId: 'c1', pos: 0, end: 11 })]);

    const wrapper = createCommentsWrapper(editor);
    const info = wrapper.get({ commentId: 'c1' });
    expect(info.anchoredText).toBe('get excerpt');
  });

  it('handles textBetween throwing gracefully', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }]);
    (editor.state!.doc as { textBetween: ReturnType<typeof vi.fn> }).textBetween = vi.fn(() => {
      throw new Error('out of range');
    });
    listCommentAnchorsMock.mockReturnValue([makeAnchor({ commentId: 'c1', pos: 999, end: 1000 })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items[0]!.anchoredText).toBeUndefined();
  });

  it('inherits anchoredText through deep thread chains (grandchild)', () => {
    const editor = makeEditor(
      [
        { commentId: 'c3', parentCommentId: 'c2', commentText: 'Grandchild' },
        { commentId: 'c2', parentCommentId: 'c1', commentText: 'Child' },
        { commentId: 'c1', commentText: 'Root' },
      ],
      'deep excerpt',
    );
    listCommentAnchorsMock.mockReturnValue([makeAnchor({ commentId: 'c1', pos: 0, end: 12 })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    const grandchild = result.items.find((item) => item.id === 'c3');
    const child = result.items.find((item) => item.id === 'c2');
    const root = result.items.find((item) => item.id === 'c1');
    expect(root!.anchoredText).toBe('deep excerpt');
    expect(child!.anchoredText).toBe('deep excerpt');
    expect(grandchild!.anchoredText).toBe('deep excerpt');
  });

  it('strips object-replacement characters from range-node atoms', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }], '\ufffchello world\ufffc');
    listCommentAnchorsMock.mockReturnValue([makeAnchor({ commentId: 'c1', pos: 0, end: 15 })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items[0]!.anchoredText).toBe('hello world');
  });

  it('populates anchoredText for resolved comments', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Resolved note', isDone: true }], 'resolved text');
    listCommentAnchorsMock.mockReturnValue([makeAnchor({ commentId: 'c1', pos: 0, end: 13, status: 'resolved' })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list({ includeResolved: true });
    expect(result.items[0]!.anchoredText).toBe('resolved text');
  });

  it('projects live tracked changes as tracked-change comments', () => {
    const editor = makeEditor([]);
    getTrackedChangeIndexMock.mockReturnValue({
      getAll: () => [
        {
          address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-live' },
          runtimeRef: { storyKey: 'body', rawId: 'tc-live' },
          story: { kind: 'story', storyType: 'body' },
          type: 'insert',
          author: 'Alice',
          authorEmail: 'alice@example.com',
          date: '2026-05-22T04:00:00.000Z',
          excerpt: 'live-review-comment',
          storyLabel: 'Body',
          storyKind: 'body',
          anchorKey: 'tc::body::tc-live',
          range: { from: 1, to: 20 },
        },
      ],
    } as never);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'tc-live',
        trackedChange: true,
        trackedChangeType: 'insert',
        trackedChangeText: 'live-review-comment',
        trackedChangeAnchorKey: 'tc::body::tc-live',
        creatorName: 'Alice',
        creatorEmail: 'alice@example.com',
      }),
    );
  });

  it('does not add synthetic comments for imported Word tracked changes', () => {
    const editor = makeEditor([]);
    getTrackedChangeIndexMock.mockReturnValue({
      getAll: () => [
        {
          address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-imported' },
          runtimeRef: { storyKey: 'body', rawId: 'word:trackInsert:1' },
          story: { kind: 'story', storyType: 'body' },
          type: 'insert',
          author: 'Alice',
          date: '2026-05-22T04:00:00.000Z',
          excerpt: 'imported',
          wordRevisionIds: { insert: '1' },
          storyLabel: 'Body',
          storyKind: 'body',
          anchorKey: 'tc::body::word:trackInsert:1',
          range: { from: 1, to: 9 },
        },
      ],
    } as never);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    expect(result.items).toHaveLength(0);
  });
});

describe('comments-wrappers: multi-segment TextTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a single-segment target for a comment with one anchor', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }], 'abc');
    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 0,
        end: 3,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items[0]!.target).toEqual({
      kind: 'text',
      segments: [{ blockId: 'p1', range: { start: 0, end: 3 } }],
    });
  });

  it('aggregates multiple anchors for the same commentId into a multi-segment target', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    mockTextBetweenSequence(editor, 'abc', 'def');

    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 0,
        end: 3,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 20,
        end: 23,
        target: { kind: 'text', blockId: 'p2', range: { start: 0, end: 3 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.target).toEqual({
      kind: 'text',
      segments: [
        { blockId: 'p1', range: { start: 0, end: 3 } },
        { blockId: 'p2', range: { start: 0, end: 3 } },
      ],
    });
    expect(result.items[0]!.anchoredText).toBe('abc def');
  });

  it('preserves segment order by document position', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    mockTextBetweenSequence(editor, 'first', 'second');

    // Anchors provided out of document order — sorted internally by pos
    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 50,
        end: 56,
        target: { kind: 'text', blockId: 'p3', range: { start: 0, end: 6 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 10,
        end: 15,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    // Segments should be ordered p1 first (pos=10), then p3 (pos=50)
    const segments = result.items[0]!.target!.segments;
    expect(segments[0]!.blockId).toBe('p1');
    expect(segments[1]!.blockId).toBe('p3');
  });

  it('returns target as undefined when comment has no anchors', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    listCommentAnchorsMock.mockReturnValue([]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items[0]!.target).toBeUndefined();
  });

  it('comments.get returns multi-segment target', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    mockTextBetweenSequence(editor, 'hello', 'world');

    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 0,
        end: 5,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 20,
        end: 25,
        target: { kind: 'text', blockId: 'p2', range: { start: 0, end: 5 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const info = wrapper.get({ commentId: 'c1' });
    expect(info.target?.segments).toHaveLength(2);
    expect(info.anchoredText).toBe('hello world');
  });

  it('reply inherits full multi-segment target from parent', () => {
    const editor = makeEditor([
      { commentId: 'c1', commentText: 'Root' },
      { commentId: 'c2', parentCommentId: 'c1', commentText: 'Reply' },
    ]);
    mockTextBetweenSequence(editor, 'abc', 'def');

    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 0,
        end: 3,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 20,
        end: 23,
        target: { kind: 'text', blockId: 'p2', range: { start: 0, end: 3 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    const reply = result.items.find((item) => item.id === 'c2');
    expect(reply!.target).toEqual({
      kind: 'text',
      segments: [
        { blockId: 'p1', range: { start: 0, end: 3 } },
        { blockId: 'p2', range: { start: 0, end: 3 } },
      ],
    });
    expect(reply!.anchoredText).toBe('abc def');
  });

  it('handles multi-segment with one failing textBetween gracefully', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    let callCount = 0;
    (editor.state!.doc as { textBetween: ReturnType<typeof vi.fn> }).textBetween = vi.fn(() => {
      callCount++;
      if (callCount === 1) throw new Error('bad range');
      return 'second segment';
    });

    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 999,
        end: 1000,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 1 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 20,
        end: 34,
        target: { kind: 'text', blockId: 'p2', range: { start: 0, end: 14 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    // Target includes both segments (structural), anchoredText skips the failed one
    expect(result.items[0]!.target?.segments).toHaveLength(2);
    expect(result.items[0]!.anchoredText).toBe('second segment');
  });

  it('strips \\ufffc from all segments in multi-segment anchoredText', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    mockTextBetweenSequence(editor, '\ufffcabc\ufffc', '\ufffcdef\ufffc');

    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 0,
        end: 5,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 20,
        end: 25,
        target: { kind: 'text', blockId: 'p2', range: { start: 0, end: 5 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items[0]!.anchoredText).toBe('abc def');
  });
});

describe('comments-wrappers: same-block segment canonicalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges adjacent same-block anchors into one segment', () => {
    // Two adjacent ranges in block p1: [0,5] and [5,10] → merged [0,10]
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }], 'abcdefghij');
    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 1,
        end: 6,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 6,
        end: 11,
        target: { kind: 'text', blockId: 'p1', range: { start: 5, end: 10 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    expect(result.items[0]!.target).toEqual({
      kind: 'text',
      segments: [{ blockId: 'p1', range: { start: 0, end: 10 } }],
    });
    // Text extracted once for the merged range — no synthetic space
    expect(result.items[0]!.anchoredText).toBe('abcdefghij');
  });

  it('merges overlapping same-block anchors into one segment', () => {
    // Two overlapping ranges in block p1: [0,5] and [3,8] → merged [0,8]
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }], 'abcdefgh');
    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 1,
        end: 6,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 4,
        end: 9,
        target: { kind: 'text', blockId: 'p1', range: { start: 3, end: 8 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    expect(result.items[0]!.target).toEqual({
      kind: 'text',
      segments: [{ blockId: 'p1', range: { start: 0, end: 8 } }],
    });
    expect(result.items[0]!.anchoredText).toBe('abcdefgh');
  });

  it('does not merge non-adjacent same-block anchors', () => {
    // Two disjoint ranges in block p1: [0,3] and [6,10] → kept separate
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    mockTextBetweenSequence(editor, 'abc', 'ghij');

    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 1,
        end: 4,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 7,
        end: 11,
        target: { kind: 'text', blockId: 'p1', range: { start: 6, end: 10 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    expect(result.items[0]!.target).toEqual({
      kind: 'text',
      segments: [
        { blockId: 'p1', range: { start: 0, end: 3 } },
        { blockId: 'p1', range: { start: 6, end: 10 } },
      ],
    });
    expect(result.items[0]!.anchoredText).toBe('abc ghij');
  });

  it('merges same-block adjacent while keeping cross-block segments separate', () => {
    // p1: [0,5] + [5,10] (adjacent, merge) → p1:[0,10]
    // p2: [0,3] (separate block, keep)
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    mockTextBetweenSequence(editor, 'abcdefghij', 'xyz');

    listCommentAnchorsMock.mockReturnValue([
      makeAnchor({
        commentId: 'c1',
        pos: 1,
        end: 6,
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 6,
        end: 11,
        target: { kind: 'text', blockId: 'p1', range: { start: 5, end: 10 } },
      }),
      makeAnchor({
        commentId: 'c1',
        pos: 30,
        end: 33,
        target: { kind: 'text', blockId: 'p2', range: { start: 0, end: 3 } },
      }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    expect(result.items[0]!.target).toEqual({
      kind: 'text',
      segments: [
        { blockId: 'p1', range: { start: 0, end: 10 } },
        { blockId: 'p2', range: { start: 0, end: 3 } },
      ],
    });
    expect(result.items[0]!.anchoredText).toBe('abcdefghij xyz');
  });
});

describe('comments-wrappers: addCommentHandler multi-segment targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeWriteEditor(): Editor {
    return {
      state: {
        doc: {
          content: { size: 200 },
          textBetween: vi.fn(() => ''),
          nodesBetween: vi.fn(),
        },
      },
      commands: {
        addComment: vi.fn(() => true),
        setTextSelection: vi.fn(() => true),
      },
      converter: { comments: [] },
      options: {},
    } as unknown as Editor;
  }

  function mockBlockOrder(...blockIds: string[]): void {
    getBlockIndexMock.mockReturnValue({
      candidates: blockIds.map((nodeId, index) => ({ nodeId, pos: index * 10 })),
    });
  }

  it('rejects a multi-segment target with segments out of document order', () => {
    const editor = makeWriteEditor();
    mockBlockOrder('pB', 'pA');
    // segments[0] resolves to a later PM range than segments[1] — the
    // caller built an out-of-order TextTarget (e.g. stitched two
    // selections together backwards).
    resolveTextTargetMock.mockImplementation((_editor, target) => {
      if (target.blockId === 'pA') return { from: 50, to: 60 };
      if (target.blockId === 'pB') return { from: 10, to: 20 };
      return null;
    });

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        segments: [
          { blockId: 'pA', range: { start: 0, end: 10 } },
          { blockId: 'pB', range: { start: 0, end: 10 } },
        ],
      },
    });

    expect(receipt.success).toBe(false);
    expect(receipt.failure?.code).toBe('INVALID_TARGET');
    expect(receipt.failure?.message).toContain('document order');
    // Early return must prevent the addComment command from firing.
    expect(editor.commands!.addComment).not.toHaveBeenCalled();
  });

  it('rejects a multi-segment target when it skips blocks in document order', () => {
    const editor = makeWriteEditor();
    mockBlockOrder('p1', 'p2', 'p3');
    resolveTextTargetMock.mockImplementation((_editor, target) => {
      if (target.blockId === 'p1') return { from: 10, to: 20 };
      if (target.blockId === 'p3') return { from: 30, to: 40 };
      return null;
    });

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        segments: [
          { blockId: 'p1', range: { start: 0, end: 10 } },
          { blockId: 'p3', range: { start: 0, end: 10 } },
        ],
      },
    });

    expect(receipt.success).toBe(false);
    expect(receipt.failure?.code).toBe('INVALID_TARGET');
    expect(receipt.failure?.message).toContain('contiguous');
    expect(editor.commands!.addComment).not.toHaveBeenCalled();
  });

  it('accepts a contiguous multi-segment target and spans the full PM range', () => {
    const editor = makeWriteEditor();
    mockBlockOrder('pA', 'pB');
    resolveTextTargetMock.mockImplementation((_editor, target) => {
      if (target.blockId === 'pA') return { from: 10, to: 20 };
      if (target.blockId === 'pB') return { from: 22, to: 30 };
      return null;
    });
    // Simulate a successful plan execution so the handler reaches the
    // success branch after validation + applyTextSelection.
    executeDomainCommandMock.mockReturnValue({
      steps: [{ effect: 'changed' }],
    } as unknown as ReturnType<typeof executeDomainCommand>);

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        segments: [
          { blockId: 'pA', range: { start: 0, end: 10 } },
          { blockId: 'pB', range: { start: 0, end: 8 } },
        ],
      },
    });

    // Validation passes and the selection is applied over the spanned
    // PM range [first.from, last.to].
    expect(editor.commands!.setTextSelection).toHaveBeenCalledWith({ from: 10, to: 30 });
    expect(receipt.success).toBe(true);
  });

  it('accepts a multi-paragraph target when the gap contains only ignorable anchor atoms', () => {
    const editor = makeWriteEditor();
    mockBlockOrder('pA', 'pB');
    resolveTextTargetMock.mockImplementation((_editor, target) => {
      if (target.blockId === 'pA') return { from: 10, to: 20 };
      if (target.blockId === 'pB') return { from: 22, to: 30 };
      return null;
    });
    executeDomainCommandMock.mockReturnValue({
      steps: [{ effect: 'changed' }],
    } as unknown as ReturnType<typeof executeDomainCommand>);

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        segments: [
          { blockId: 'pA', range: { start: 0, end: 10 } },
          { blockId: 'pB', range: { start: 0, end: 8 } },
        ],
      },
    });

    expect(receipt.success).toBe(true);
    expect(editor.commands!.setTextSelection).toHaveBeenCalledWith({ from: 10, to: 30 });
  });

  it('accepts contiguous block segments even when boundary blocks leave text between them', () => {
    const editor = makeWriteEditor();
    mockBlockOrder('pA', 'pB');
    resolveTextTargetMock.mockImplementation((_editor, target) => {
      if (target.blockId === 'pA') return { from: 10, to: 18 };
      if (target.blockId === 'pB') return { from: 31, to: 45 };
      return null;
    });
    executeDomainCommandMock.mockReturnValue({
      steps: [{ effect: 'changed' }],
    } as unknown as ReturnType<typeof executeDomainCommand>);

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        segments: [
          { blockId: 'pA', range: { start: 10, end: 18 } },
          { blockId: 'pB', range: { start: 12, end: 26 } },
        ],
      },
    });

    expect(receipt.success).toBe(true);
    expect(editor.commands!.setTextSelection).toHaveBeenCalledWith({ from: 10, to: 45 });
  });

  it('accepts trackedChangeId targets from the tracked-change index when live resolution misses a body deletion', () => {
    const editor = makeWriteEditor();
    const bodyDeletionSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-del-1' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-del-1' },
      story: { kind: 'story', storyType: 'body' },
      type: 'delete',
      excerpt: 'deleted text',
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-del-1',
      hasInsert: false,
      hasDelete: true,
      hasFormat: false,
      range: { from: 19, to: 27 },
    };
    getTrackedChangeIndexMock.mockReturnValue({
      get: () => [bodyDeletionSnapshot],
      getAll: () => [],
    } as never);
    executeDomainCommandMock.mockReturnValue({
      steps: [{ effect: 'changed' }],
    } as unknown as ReturnType<typeof executeDomainCommand>);

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment on deletion',
      target: {
        trackedChangeId: 'tc-del-1',
      } as Parameters<typeof wrapper.add>[0]['target'],
    });

    expect(receipt.success).toBe(true);
    expect(editor.commands!.setTextSelection).toHaveBeenCalledWith({ from: 19, to: 27 });
  });

  it('fails closed when a tracked-change target cannot be resolved live', () => {
    const editor = {
      ...makeWriteEditor(),
      emit: vi.fn(),
      options: {
        documentId: 'doc-1',
        user: {
          name: 'Actor B',
          email: 'actor-b@labs.requirements',
        },
      },
    } as unknown as Editor;

    (editor.commands!.addComment as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('addComment should not run for detached tracked deletions');
    });

    const wrapper = createCommentsWrapper(editor);
    expect(() =>
      wrapper.add({
        text: 'comment on deletion',
        target: {
          trackedChangeId: 'tc-del-1#deleted',
        } as Parameters<typeof wrapper.add>[0]['target'],
      }),
    ).toThrowError(/Comment target could not be resolved/);
    expect(editor.commands!.setTextSelection as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(editor.commands!.addComment as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(editor.converter!.comments).toEqual([]);
    expect((editor as { emit: ReturnType<typeof vi.fn> }).emit).not.toHaveBeenCalled();
  });

  it('treats a TextAddress with an undefined `segments` field as TextAddress, not TextTarget', () => {
    // Regression: a plain structural `'segments' in target` check misclassifies
    // a TextAddress carrying an extra undefined `segments` field (e.g. from
    // object spread) as a TextTarget, then crashes on `segments[0]`. The
    // runtime guard must reject a non-array `segments` before the spread.
    const editor = makeWriteEditor();
    resolveTextTargetMock.mockReturnValue({ from: 5, to: 12 });
    executeDomainCommandMock.mockReturnValue({
      steps: [{ effect: 'changed' }],
    } as unknown as ReturnType<typeof executeDomainCommand>);

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        blockId: 'pA',
        range: { start: 0, end: 5 },
        // A TextAddress with a stray `segments` property (from spreading) —
        // must fall through to the single-block branch.
        segments: undefined as unknown as never,
      } as unknown as Parameters<typeof wrapper.add>[0]['target'],
    });

    expect(receipt.success).toBe(true);
    expect(editor.commands!.setTextSelection).toHaveBeenCalledWith({ from: 5, to: 12 });
    // Single resolve call, using the TextAddress blockId + range.
    expect(resolveTextTarget).toHaveBeenCalledTimes(1);
    expect(resolveTextTarget).toHaveBeenCalledWith(editor, {
      kind: 'text',
      blockId: 'pA',
      range: { start: 0, end: 5 },
    });
  });

  it('routes a hybrid TextAddress+segments payload through the TextAddress branch', () => {
    // Regression: the document-api validator accepts a payload that
    // satisfies *either* isTextAddress or isTextTarget; neither rejects
    // extra fields, so a payload carrying both blockId/range AND
    // segments[] passes validation. The earlier `'segments' in target`
    // routing then silently dropped blockId/range. The hardened guard
    // requires the absence of TextAddress fields, so a hybrid falls
    // through to the explicit-block branch.
    const editor = makeWriteEditor();
    resolveTextTargetMock.mockReturnValue({ from: 11, to: 17 });
    executeDomainCommandMock.mockReturnValue({
      steps: [{ effect: 'changed' }],
    } as unknown as ReturnType<typeof executeDomainCommand>);

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        blockId: 'pA',
        range: { start: 1, end: 7 },
        // A non-empty segments array carrying DIFFERENT block coordinates.
        // The hybrid must NOT be routed through this segments path; the
        // explicit blockId/range take precedence.
        segments: [{ blockId: 'pZ', range: { start: 99, end: 100 } }],
      } as unknown as Parameters<typeof wrapper.add>[0]['target'],
    });

    expect(receipt.success).toBe(true);
    // resolveTextTarget called once, with pA (not pZ).
    expect(resolveTextTarget).toHaveBeenCalledTimes(1);
    expect(resolveTextTarget).toHaveBeenCalledWith(editor, {
      kind: 'text',
      blockId: 'pA',
      range: { start: 1, end: 7 },
    });
  });

  it('treats a TextTarget with a stray blockId but no range as TextTarget, not TextAddress', () => {
    // The public validator accepts this as a TextTarget because the
    // segments array is valid. A stray blockId alone is not enough to form
    // a TextAddress, so the adapter must not fall through to the
    // single-block path and dereference target.range.
    const editor = makeWriteEditor();
    resolveTextTargetMock.mockReturnValue({ from: 11, to: 17 });
    executeDomainCommandMock.mockReturnValue({
      steps: [{ effect: 'changed' }],
    } as unknown as ReturnType<typeof executeDomainCommand>);

    const wrapper = createCommentsWrapper(editor);
    const target = {
      kind: 'text',
      blockId: 'partial-address-only',
      segments: [{ blockId: 'pZ', range: { start: 2, end: 8 } }],
    } as unknown as Parameters<typeof wrapper.add>[0]['target'];

    expect(() => wrapper.add({ text: 'comment', target })).not.toThrow();
    expect(resolveTextTarget).toHaveBeenCalledTimes(1);
    expect(resolveTextTarget).toHaveBeenCalledWith(editor, {
      kind: 'text',
      blockId: 'pZ',
      range: { start: 2, end: 8 },
    });
  });

  it('treats a TextTarget with a stray range but no blockId as TextTarget, not TextAddress', () => {
    // Same partial-hybrid class as above: this is valid as a TextTarget,
    // but not as a TextAddress. The adapter should resolve the real
    // segment instead of manufacturing a segment from the stray range.
    const editor = makeWriteEditor();
    resolveTextTargetMock.mockReturnValue({ from: 11, to: 17 });
    executeDomainCommandMock.mockReturnValue({
      steps: [{ effect: 'changed' }],
    } as unknown as ReturnType<typeof executeDomainCommand>);

    const wrapper = createCommentsWrapper(editor);
    const target = {
      kind: 'text',
      range: { start: 99, end: 100 },
      segments: [{ blockId: 'pZ', range: { start: 2, end: 8 } }],
    } as unknown as Parameters<typeof wrapper.add>[0]['target'];

    const receipt = wrapper.add({ text: 'comment', target });

    expect(receipt.success).toBe(true);
    expect(resolveTextTarget).toHaveBeenCalledTimes(1);
    expect(resolveTextTarget).toHaveBeenCalledWith(editor, {
      kind: 'text',
      blockId: 'pZ',
      range: { start: 2, end: 8 },
    });
  });

  it('rejects a TextTarget with collapsed segments in different blocks', () => {
    // Regression: two collapsed segments in different blocks would slip
    // both the gap check and the spanning-range collapse check (because
    // firstResolved.from < lastResolved.to across the block boundary),
    // silently anchoring a comment over content the caller never selected.
    const editor = makeWriteEditor();
    resolveTextTargetMock.mockImplementation((_editor, target) => {
      if (target.blockId === 'pA') return { from: 10, to: 10 };
      if (target.blockId === 'pB') return { from: 20, to: 20 };
      return null;
    });

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        segments: [
          { blockId: 'pA', range: { start: 5, end: 5 } }, // collapsed
          { blockId: 'pB', range: { start: 0, end: 0 } }, // collapsed
        ],
      },
    });

    expect(receipt.success).toBe(false);
    expect(receipt.failure?.code).toBe('INVALID_TARGET');
    expect(receipt.failure?.message).toContain('non-collapsed');
    expect(editor.commands!.addComment).not.toHaveBeenCalled();
  });

  it('rejects a multi-segment TextTarget that repeats the same block', () => {
    // Split same-block segments would silently anchor a larger range than
    // the caller explicitly passed. Callers should collapse them into one
    // TextAddress/TextSegment before invoking comments.create.
    const editor = makeWriteEditor();
    mockBlockOrder('p1');
    resolveTextTargetMock.mockReturnValueOnce({ from: 5, to: 10 }).mockReturnValueOnce({ from: 12, to: 17 });

    const wrapper = createCommentsWrapper(editor);
    const receipt = wrapper.add({
      text: 'comment',
      target: {
        kind: 'text',
        segments: [
          { blockId: 'p1', range: { start: 0, end: 5 } },
          { blockId: 'p1', range: { start: 7, end: 12 } },
        ],
      },
    });

    expect(receipt.success).toBe(false);
    expect(receipt.failure?.code).toBe('INVALID_TARGET');
    expect(receipt.failure?.message).toContain('document order');
    expect(editor.commands!.addComment).not.toHaveBeenCalled();
  });
});
