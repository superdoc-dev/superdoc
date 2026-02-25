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

describe('comments-wrappers anchoredText', () => {
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
    // Records deliberately listed grandchild-first to exercise order-independence.
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
