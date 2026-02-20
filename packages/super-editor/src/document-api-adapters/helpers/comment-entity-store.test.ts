import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import {
  buildCommentJsonFromText,
  extractCommentText,
  findCommentEntity,
  getCommentEntityStore,
  isCommentResolved,
  removeCommentEntityTree,
  toCommentInfo,
  upsertCommentEntity,
  type CommentEntityRecord,
} from './comment-entity-store.js';

function makeEditorWithConverter(comments: CommentEntityRecord[] = []): Editor {
  return { converter: { comments } } as unknown as Editor;
}

function makeEditorWithoutConverter(): Editor {
  return {} as unknown as Editor;
}

describe('getCommentEntityStore', () => {
  it('returns converter.comments when converter exists', () => {
    const comments: CommentEntityRecord[] = [{ commentId: 'c1' }];
    const editor = makeEditorWithConverter(comments);
    expect(getCommentEntityStore(editor)).toBe(comments);
  });

  it('initializes converter.comments as empty array when undefined', () => {
    const editor = { converter: {} } as unknown as Editor;
    const store = getCommentEntityStore(editor);
    expect(store).toEqual([]);
    expect(Array.isArray(store)).toBe(true);
  });

  it('uses fallback storage when converter is missing', () => {
    const editor = makeEditorWithoutConverter();
    const store = getCommentEntityStore(editor);
    expect(store).toEqual([]);
    // Subsequent calls return the same array
    expect(getCommentEntityStore(editor)).toBe(store);
  });
});

describe('findCommentEntity', () => {
  it('finds by commentId', () => {
    const store: CommentEntityRecord[] = [{ commentId: 'c1', commentText: 'Hello' }];
    expect(findCommentEntity(store, 'c1')?.commentText).toBe('Hello');
  });

  it('finds by importedId', () => {
    const store: CommentEntityRecord[] = [{ commentId: 'c1', importedId: 'imp-1' }];
    expect(findCommentEntity(store, 'imp-1')?.commentId).toBe('c1');
  });

  it('returns undefined when not found', () => {
    const store: CommentEntityRecord[] = [{ commentId: 'c1' }];
    expect(findCommentEntity(store, 'missing')).toBeUndefined();
  });
});

describe('upsertCommentEntity', () => {
  it('creates a new entry when none exists', () => {
    const store: CommentEntityRecord[] = [];
    const result = upsertCommentEntity(store, 'c1', { commentText: 'New' });
    expect(result.commentId).toBe('c1');
    expect(result.commentText).toBe('New');
    expect(store).toHaveLength(1);
  });

  it('updates an existing entry preserving its commentId', () => {
    const store: CommentEntityRecord[] = [{ commentId: 'c1', commentText: 'Old' }];
    const result = upsertCommentEntity(store, 'c1', { commentText: 'Updated' });
    expect(result.commentText).toBe('Updated');
    expect(result.commentId).toBe('c1');
    expect(store).toHaveLength(1);
  });

  it('resolves to the provided commentId when existing entry has no commentId', () => {
    const store: CommentEntityRecord[] = [{ importedId: 'imp-1', commentText: 'Old' }];
    const result = upsertCommentEntity(store, 'imp-1', { commentText: 'Updated' });
    expect(result.commentId).toBe('imp-1');
  });
});

describe('removeCommentEntityTree', () => {
  it('removes a root comment and its children', () => {
    const store: CommentEntityRecord[] = [
      { commentId: 'c1', commentText: 'Root' },
      { commentId: 'c2', parentCommentId: 'c1', commentText: 'Reply' },
      { commentId: 'c3', parentCommentId: 'c2', commentText: 'Nested reply' },
    ];

    const removed = removeCommentEntityTree(store, 'c1');
    expect(removed.map((r) => r.commentId).sort()).toEqual(['c1', 'c2', 'c3']);
    expect(store).toHaveLength(0);
  });

  it('returns empty array when comment is not found', () => {
    const store: CommentEntityRecord[] = [{ commentId: 'c1' }];
    const removed = removeCommentEntityTree(store, 'missing');
    expect(removed).toEqual([]);
    expect(store).toHaveLength(1);
  });

  it('preserves unrelated comments', () => {
    const store: CommentEntityRecord[] = [
      { commentId: 'c1', commentText: 'Root' },
      { commentId: 'c2', parentCommentId: 'c1', commentText: 'Reply' },
      { commentId: 'c3', commentText: 'Unrelated' },
    ];

    removeCommentEntityTree(store, 'c1');
    expect(store).toHaveLength(1);
    expect(store[0]?.commentId).toBe('c3');
  });

  it('returns empty array when root has empty commentId', () => {
    const store: CommentEntityRecord[] = [{ commentId: '', importedId: 'imp-1' }];
    const removed = removeCommentEntityTree(store, 'imp-1');
    expect(removed).toEqual([]);
  });
});

describe('extractCommentText', () => {
  it('returns commentText when available', () => {
    expect(extractCommentText({ commentText: 'Hello' })).toBe('Hello');
  });

  it('extracts text from commentJSON structure', () => {
    const entry: CommentEntityRecord = {
      commentJSON: [{ type: 'paragraph', content: [{ type: 'text', text: 'From JSON' }] }],
    };
    expect(extractCommentText(entry)).toBe('From JSON');
  });

  it('extracts text from elements structure', () => {
    const entry: CommentEntityRecord = {
      elements: [{ text: 'From elements' }],
    };
    expect(extractCommentText(entry)).toBe('From elements');
  });

  it('returns undefined when no text source exists', () => {
    expect(extractCommentText({})).toBeUndefined();
  });

  it('returns undefined for empty commentJSON', () => {
    expect(extractCommentText({ commentJSON: [] })).toBeUndefined();
  });
});

describe('buildCommentJsonFromText', () => {
  it('creates paragraph/run/text structure from plain text', () => {
    const result = buildCommentJsonFromText('Hello world');
    expect(result).toEqual([
      {
        type: 'paragraph',
        content: [
          {
            type: 'run',
            content: [{ type: 'text', text: 'Hello world' }],
          },
        ],
      },
    ]);
  });

  it('strips HTML tags from input', () => {
    const result = buildCommentJsonFromText('<b>Bold</b> text');
    expect(result[0]).toMatchObject({
      content: [{ content: [{ text: 'Bold text' }] }],
    });
  });

  it('replaces &nbsp; with spaces', () => {
    const result = buildCommentJsonFromText('Hello&nbsp;world');
    expect(result[0]).toMatchObject({
      content: [{ content: [{ text: 'Hello world' }] }],
    });
  });
});

describe('isCommentResolved', () => {
  it('returns true when isDone is true', () => {
    expect(isCommentResolved({ isDone: true })).toBe(true);
  });

  it('returns true when resolvedTime is set', () => {
    expect(isCommentResolved({ resolvedTime: Date.now() })).toBe(true);
  });

  it('returns false when neither isDone nor resolvedTime is set', () => {
    expect(isCommentResolved({})).toBe(false);
  });

  it('returns false when resolvedTime is null', () => {
    expect(isCommentResolved({ resolvedTime: null })).toBe(false);
  });
});

describe('toCommentInfo', () => {
  it('builds CommentInfo from a record', () => {
    const info = toCommentInfo({
      commentId: 'c1',
      importedId: 'imp-1',
      commentText: 'Hello',
      isInternal: true,
      createdTime: 1000,
      creatorName: 'Ada',
      creatorEmail: 'ada@example.com',
    });

    expect(info.commentId).toBe('c1');
    expect(info.importedId).toBe('imp-1');
    expect(info.text).toBe('Hello');
    expect(info.isInternal).toBe(true);
    expect(info.status).toBe('open');
    expect(info.createdTime).toBe(1000);
  });

  it('respects explicit status override', () => {
    const info = toCommentInfo({ commentId: 'c1' }, { status: 'resolved' });
    expect(info.status).toBe('resolved');
  });

  it('derives resolved status from isDone', () => {
    const info = toCommentInfo({ commentId: 'c1', isDone: true });
    expect(info.status).toBe('resolved');
  });

  it('falls back to importedId when commentId is missing', () => {
    const info = toCommentInfo({ importedId: 'imp-1' });
    expect(info.commentId).toBe('imp-1');
  });

  it('includes target when provided', () => {
    const target = { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 5 } };
    const info = toCommentInfo({ commentId: 'c1' }, { target });
    expect(info.target).toBe(target);
  });
});
