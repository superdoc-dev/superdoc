// @ts-check
import { describe, expect, it } from 'vitest';

import { planCommentEffects } from './comment-effects.js';

const node = (name, id) => ({
  type: { name },
  attrs: { 'w:id': id },
});

const fakeDoc = (entries) => ({
  descendants: (fn) => {
    for (const entry of entries) {
      fn(node(entry.name, entry.id), entry.pos);
    }
  },
});

describe('planCommentEffects', () => {
  it('deletes a comment thread when removed coverage wholly contains its anchor', () => {
    const doc = fakeDoc([
      { name: 'commentRangeStart', id: 'c1', pos: 3 },
      { name: 'commentRangeEnd', id: 'c1', pos: 7 },
      { name: 'commentReference', id: 'c1', pos: 8 },
    ]);

    const result = planCommentEffects({
      doc,
      removedRanges: [{ from: 3, to: 9, cause: 'reject-insertion:ins-1' }],
    });

    expect(result.entityDeletes).toEqual([{ id: 'c1', cause: 'reject-insertion:ins-1' }]);
    expect(result.entityShrinks).toEqual([]);
    expect(result.nodeDeletes.map(({ kind, from, to, commentId }) => ({ kind, from, to, commentId }))).toEqual([
      { kind: 'commentRangeStart', from: 3, to: 4, commentId: 'c1' },
      { kind: 'commentRangeEnd', from: 7, to: 8, commentId: 'c1' },
      { kind: 'commentReference', from: 8, to: 9, commentId: 'c1' },
    ]);
  });

  it('deletes a comment thread when removed coverage spans the end boundary', () => {
    const doc = fakeDoc([
      { name: 'commentRangeStart', id: 'c2', pos: 3 },
      { name: 'commentRangeEnd', id: 'c2', pos: 7 },
    ]);

    const result = planCommentEffects({
      doc,
      removedRanges: [{ from: 6, to: 8, cause: 'accept-deletion:del-1' }],
    });

    expect(result.entityDeletes).toEqual([{ id: 'c2', cause: 'accept-deletion:del-1' }]);
    expect(result.entityShrinks).toEqual([]);
  });

  it('shrinks a comment thread when removed coverage is inside the anchor and preserves boundaries', () => {
    const doc = fakeDoc([
      { name: 'commentRangeStart', id: 'c3', pos: 3 },
      { name: 'commentRangeEnd', id: 'c3', pos: 8 },
    ]);

    const result = planCommentEffects({
      doc,
      removedRanges: [{ from: 5, to: 7, cause: 'partial-accept-deletion:del-2' }],
    });

    expect(result.entityDeletes).toEqual([]);
    expect(result.nodeDeletes).toEqual([]);
    expect(result.entityShrinks).toEqual([
      { id: 'c3', cause: 'partial-accept-deletion:del-2', anchor: { from: 3, to: 9 } },
    ]);
  });
});
