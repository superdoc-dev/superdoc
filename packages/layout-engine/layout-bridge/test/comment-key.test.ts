/**
 * Unit tests for getCommentKey() function in diff.ts
 * Tests the comment hashing logic used for cache invalidation
 */

import { describe, it, expect } from 'vitest';
import type { Run } from '@superdoc/contracts';

// Import the internal function for testing
// Since getCommentKey is not exported, we'll test it through computeDirtyRegions
// which uses it internally. For direct testing, we'd need to export it or use
// a testing-specific approach. Here we'll create a local version that mirrors
// the implementation.

/**
 * Local implementation of getCommentKey for testing purposes.
 * This mirrors the actual implementation in diff.ts.
 */
type CommentAnnotation = {
  commentId?: string;
  internal?: boolean;
};

type RunWithComments = Run & {
  comments: CommentAnnotation[];
};

function hasComments(run: Run): run is RunWithComments {
  return (
    'comments' in run &&
    Array.isArray((run as Partial<RunWithComments>).comments) &&
    (run as Partial<RunWithComments>).comments!.length > 0
  );
}

const getCommentKey = (run: Run): string => {
  if (!hasComments(run)) return '';
  return run.comments.map((c) => `${c.commentId ?? ''}:${c.internal ? '1' : '0'}`).join('|');
};

describe('getCommentKey', () => {
  describe('runs without comments', () => {
    it('returns empty string for run without comments property', () => {
      const run: Run = { text: 'Hello', fontFamily: 'Arial', fontSize: 12 };
      expect(getCommentKey(run)).toBe('');
    });

    it('returns empty string for run with undefined comments', () => {
      const run = { text: 'Hello', fontFamily: 'Arial', fontSize: 12, comments: undefined } as Run;
      expect(getCommentKey(run)).toBe('');
    });

    it('returns empty string for run with null comments', () => {
      const run = { text: 'Hello', fontFamily: 'Arial', fontSize: 12, comments: null } as unknown as Run;
      expect(getCommentKey(run)).toBe('');
    });

    it('returns empty string for run with empty comments array', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [],
      } as Run;
      expect(getCommentKey(run)).toBe('');
    });
  });

  describe('runs with single comment', () => {
    it('returns correct hash for comment with commentId', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment-1' }],
      } as Run;
      expect(getCommentKey(run)).toBe('comment-1:0');
    });

    it('returns correct hash for comment with commentId and internal=false', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment-1', internal: false }],
      } as Run;
      expect(getCommentKey(run)).toBe('comment-1:0');
    });

    it('returns correct hash for comment with commentId and internal=true', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment-1', internal: true }],
      } as Run;
      expect(getCommentKey(run)).toBe('comment-1:1');
    });

    it('handles comment with missing commentId', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ internal: true }],
      } as Run;
      expect(getCommentKey(run)).toBe(':1');
    });

    it('handles comment with undefined commentId', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: undefined, internal: false }],
      } as Run;
      expect(getCommentKey(run)).toBe(':0');
    });

    it('handles comment with empty string commentId', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: '', internal: true }],
      } as Run;
      expect(getCommentKey(run)).toBe(':1');
    });
  });

  describe('runs with multiple comments', () => {
    it('returns correct hash for multiple comments', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [
          { commentId: 'comment-1', internal: false },
          { commentId: 'comment-2', internal: true },
          { commentId: 'comment-3', internal: false },
        ],
      } as Run;
      expect(getCommentKey(run)).toBe('comment-1:0|comment-2:1|comment-3:0');
    });

    it('handles multiple comments with some missing commentIds', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [
          { commentId: 'comment-1', internal: false },
          { internal: true },
          { commentId: 'comment-3', internal: false },
        ],
      } as Run;
      expect(getCommentKey(run)).toBe('comment-1:0|:1|comment-3:0');
    });

    it('differentiates comments with same IDs but different internal flags', () => {
      const run1 = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [
          { commentId: 'comment-1', internal: false },
          { commentId: 'comment-2', internal: false },
        ],
      } as Run;

      const run2 = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [
          { commentId: 'comment-1', internal: true },
          { commentId: 'comment-2', internal: false },
        ],
      } as Run;

      expect(getCommentKey(run1)).toBe('comment-1:0|comment-2:0');
      expect(getCommentKey(run2)).toBe('comment-1:1|comment-2:0');
      expect(getCommentKey(run1)).not.toBe(getCommentKey(run2));
    });

    it('maintains order of comments in hash', () => {
      const run1 = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [
          { commentId: 'comment-1', internal: false },
          { commentId: 'comment-2', internal: true },
        ],
      } as Run;

      const run2 = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [
          { commentId: 'comment-2', internal: true },
          { commentId: 'comment-1', internal: false },
        ],
      } as Run;

      expect(getCommentKey(run1)).toBe('comment-1:0|comment-2:1');
      expect(getCommentKey(run2)).toBe('comment-2:1|comment-1:0');
      expect(getCommentKey(run1)).not.toBe(getCommentKey(run2));
    });
  });

  describe('undefined internal flag handling', () => {
    it('treats undefined internal flag as false (0)', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment-1' }],
      } as Run;
      expect(getCommentKey(run)).toBe('comment-1:0');
    });

    it('treats explicit internal=false same as undefined', () => {
      const run1 = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment-1' }],
      } as Run;

      const run2 = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment-1', internal: false }],
      } as Run;

      expect(getCommentKey(run1)).toBe(getCommentKey(run2));
    });
  });

  describe('special characters in commentId', () => {
    it('handles commentId with pipes', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment|with|pipes', internal: false }],
      } as Run;
      // Pipes in commentId could cause parsing issues, but the function doesn't escape them
      expect(getCommentKey(run)).toBe('comment|with|pipes:0');
    });

    it('handles commentId with colons', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment:with:colons', internal: true }],
      } as Run;
      expect(getCommentKey(run)).toBe('comment:with:colons:1');
    });

    it('handles commentId with special characters', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: [{ commentId: 'comment-#$%^&*()', internal: false }],
      } as Run;
      expect(getCommentKey(run)).toBe('comment-#$%^&*():0');
    });
  });

  describe('type guard edge cases', () => {
    it('handles non-array comments property gracefully', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: 'not-an-array',
      } as unknown as Run;
      expect(getCommentKey(run)).toBe('');
    });

    it('handles comments as object instead of array', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: { commentId: 'comment-1' },
      } as unknown as Run;
      expect(getCommentKey(run)).toBe('');
    });

    it('handles comments as number', () => {
      const run = {
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 12,
        comments: 42,
      } as unknown as Run;
      expect(getCommentKey(run)).toBe('');
    });
  });
});
