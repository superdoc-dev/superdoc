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
  getInlineIndex: vi.fn(() => ({ byType: new Map() })),
  clearIndexCache: vi.fn(),
}));

vi.mock('./revision-tracker.js', () => ({
  getRevision: vi.fn(() => 'rev-1'),
}));

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn(),
}));

import { listCommentAnchors } from '../helpers/comment-target-resolver.js';

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

describe('comments-wrappers: anchoredText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates anchoredText for a root comment with an anchor', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }], 'selected text');
    vi.mocked(listCommentAnchors).mockReturnValue([makeAnchor({ commentId: 'c1', pos: 10, end: 23 })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.anchoredText).toBe('selected text');
  });

  it('returns anchoredText as undefined when comment has no anchor', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }]);
    vi.mocked(listCommentAnchors).mockReturnValue([]);

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
    vi.mocked(listCommentAnchors).mockReturnValue([makeAnchor({ commentId: 'c1', pos: 5, end: 20 })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();

    const root = result.items.find((item) => item.id === 'c1');
    const reply = result.items.find((item) => item.id === 'c2');
    expect(root!.anchoredText).toBe('anchored excerpt');
    expect(reply!.anchoredText).toBe('anchored excerpt');
  });

  it('returns anchoredText on comments.get as well', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }], 'get excerpt');
    vi.mocked(listCommentAnchors).mockReturnValue([makeAnchor({ commentId: 'c1', pos: 0, end: 11 })]);

    const wrapper = createCommentsWrapper(editor);
    const info = wrapper.get({ commentId: 'c1' });
    expect(info.anchoredText).toBe('get excerpt');
  });

  it('handles textBetween throwing gracefully', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'My comment' }]);
    (editor.state!.doc as { textBetween: ReturnType<typeof vi.fn> }).textBetween = vi.fn(() => {
      throw new Error('out of range');
    });
    vi.mocked(listCommentAnchors).mockReturnValue([makeAnchor({ commentId: 'c1', pos: 999, end: 1000 })]);

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
    vi.mocked(listCommentAnchors).mockReturnValue([makeAnchor({ commentId: 'c1', pos: 0, end: 12 })]);

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
    vi.mocked(listCommentAnchors).mockReturnValue([makeAnchor({ commentId: 'c1', pos: 0, end: 15 })]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items[0]!.anchoredText).toBe('hello world');
  });

  it('populates anchoredText for resolved comments', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Resolved note', isDone: true }], 'resolved text');
    vi.mocked(listCommentAnchors).mockReturnValue([
      makeAnchor({ commentId: 'c1', pos: 0, end: 13, status: 'resolved' }),
    ]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list({ includeResolved: true });
    expect(result.items[0]!.anchoredText).toBe('resolved text');
  });
});

describe('comments-wrappers: multi-segment TextTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a single-segment target for a comment with one anchor', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }], 'abc');
    vi.mocked(listCommentAnchors).mockReturnValue([
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

    vi.mocked(listCommentAnchors).mockReturnValue([
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
    vi.mocked(listCommentAnchors).mockReturnValue([
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
    vi.mocked(listCommentAnchors).mockReturnValue([]);

    const wrapper = createCommentsWrapper(editor);
    const result = wrapper.list();
    expect(result.items[0]!.target).toBeUndefined();
  });

  it('comments.get returns multi-segment target', () => {
    const editor = makeEditor([{ commentId: 'c1', commentText: 'Comment' }]);
    mockTextBetweenSequence(editor, 'hello', 'world');

    vi.mocked(listCommentAnchors).mockReturnValue([
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

    vi.mocked(listCommentAnchors).mockReturnValue([
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

    vi.mocked(listCommentAnchors).mockReturnValue([
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

    vi.mocked(listCommentAnchors).mockReturnValue([
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
    vi.mocked(listCommentAnchors).mockReturnValue([
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
    vi.mocked(listCommentAnchors).mockReturnValue([
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

    vi.mocked(listCommentAnchors).mockReturnValue([
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

    vi.mocked(listCommentAnchors).mockReturnValue([
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
