import { describe, it, expect } from 'vitest';
import { ensureFallbackComment, resolveCommentMeta } from './comment-import-helpers.js';

describe('comment-import-helpers', () => {
  describe('resolveCommentMeta', () => {
    it('returns existing comment metadata when converter has match', () => {
      const converter = {
        comments: [
          {
            importedId: '123',
            commentId: 'c-1',
            internal: true,
          },
        ],
      };

      const meta = resolveCommentMeta({ converter, importedId: '123' });

      expect(meta.resolvedCommentId).toBe('c-1');
      expect(meta.internal).toBe(true);
      expect(meta.matchingImportedComment).toBe(converter.comments[0]);
    });

    it('creates fallback ids and defaults when metadata is missing', () => {
      const converter = { comments: [] };

      const meta = resolveCommentMeta({ converter, importedId: 5 });

      expect(meta.resolvedCommentId).toBe('5');
      expect(meta.internal).toBe(false);
      expect(meta.matchingImportedComment).toBeUndefined();
    });
  });

  describe('ensureFallbackComment', () => {
    it('does nothing when a matching comment already exists', () => {
      const existing = { commentId: 'c-1', importedId: '1' };
      const converter = { comments: [existing] };

      ensureFallbackComment({
        converter,
        matchingImportedComment: existing,
        commentId: 'c-1',
        importedId: '1',
      });

      expect(converter.comments).toHaveLength(1);
    });

    it('adds a minimal fallback comment when missing', () => {
      const converter = { comments: [] };

      ensureFallbackComment({
        converter,
        matchingImportedComment: undefined,
        commentId: 'generated-id',
        importedId: 'import-1',
      });

      expect(converter.comments).toHaveLength(1);
      expect(converter.comments[0]).toMatchObject({
        commentId: 'generated-id',
        importedId: 'import-1',
        isDone: false,
      });
    });

    it('skips adding duplicates when fallback already present', () => {
      const converter = {
        comments: [
          {
            commentId: 'generated-id',
            importedId: 'import-1',
          },
        ],
      };

      ensureFallbackComment({
        converter,
        matchingImportedComment: undefined,
        commentId: 'generated-id',
        importedId: 'import-1',
      });

      expect(converter.comments).toHaveLength(1);
    });
  });
});
