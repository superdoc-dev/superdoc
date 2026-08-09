import { describe, expect, it, vi } from 'vite-plus/test';

import { resolveV2ReviewTargetCommentId } from './v2-review-target.js';

describe('v2 review target activation', () => {
  it('uses the canonical target id while its sidebar row is still hydrating', () => {
    const getComment = vi.fn(() => null);

    expect(resolveV2ReviewTargetCommentId({ entityType: 'trackedChange', entityId: 'tc-canonical' }, getComment)).toBe(
      'tc-canonical',
    );
    expect(getComment).toHaveBeenCalledWith('tc-canonical');
  });

  it('prefers the hydrated row identity and imported alias', () => {
    expect(
      resolveV2ReviewTargetCommentId({ entityType: 'comment', entityId: 'comment-carrier' }, () => ({
        commentId: 'comment-row',
        importedId: 'imported-row',
      })),
    ).toBe('comment-row');
    expect(
      resolveV2ReviewTargetCommentId({ entityType: 'trackedChange', entityId: 'tracked-carrier' }, () => ({
        importedId: 'tracked-imported-row',
      })),
    ).toBe('tracked-imported-row');
  });

  it('rejects unsupported or malformed targets', () => {
    expect(resolveV2ReviewTargetCommentId(null, () => null)).toBeNull();
    expect(resolveV2ReviewTargetCommentId({ entityType: 'bookmark', entityId: 'b1' }, () => null)).toBeNull();
    expect(resolveV2ReviewTargetCommentId({ entityType: 'comment' }, () => null)).toBeNull();
  });
});
