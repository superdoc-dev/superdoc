import { describe, expect, it } from 'vitest';
import useComment from './use-comment.js';

describe('use-comment', () => {
  it('exposes threading metadata in getValues()', () => {
    const comment = useComment({
      commentId: 'comment-1',
      threadingParentCommentId: 'parent-1',
      origin: 'word',
      threadingMethod: 'commentsExtended',
      threadingStyleOverride: 'commentsExtended',
      originalXmlStructure: {
        hasCommentsExtended: true,
        hasCommentsExtensible: true,
        hasCommentsIds: true,
      },
    });

    const values = comment.getValues();
    expect(values.threadingParentCommentId).toBe('parent-1');
    expect(values.threadingMethod).toBe('commentsExtended');
    expect(values.threadingStyleOverride).toBe('commentsExtended');
    expect(values.origin).toBe('word');
    expect(values.originalXmlStructure).toEqual({
      hasCommentsExtended: true,
      hasCommentsExtensible: true,
      hasCommentsIds: true,
    });
  });
});
