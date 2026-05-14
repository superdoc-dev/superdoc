import { describe, it, expect } from 'bun:test';
import { applyParamRenames } from '../tools/param-renames.js';

describe('applyParamRenames', () => {
  it('renames id → commentId for comments.delete', () => {
    expect(applyParamRenames('comments.delete', { id: 'c1' })).toEqual({ commentId: 'c1' });
  });

  it('renames id → commentId for comments.get', () => {
    expect(applyParamRenames('comments.get', { id: 'c1' })).toEqual({ commentId: 'c1' });
  });

  it('renames id → commentId for comments.patch and preserves other fields', () => {
    expect(applyParamRenames('comments.patch', { id: 'c1', text: 'updated', isInternal: true })).toEqual({
      commentId: 'c1',
      text: 'updated',
      isInternal: true,
    });
  });

  it('renames parentId → parentCommentId for comments.create', () => {
    expect(applyParamRenames('comments.create', { text: 'reply', parentId: 'c1' })).toEqual({
      text: 'reply',
      parentCommentId: 'c1',
    });
  });

  it('renames id → nodeId for getNodeById', () => {
    expect(applyParamRenames('getNodeById', { id: 'n1' })).toEqual({ nodeId: 'n1' });
  });

  it('passes through unchanged for operations with no renames', () => {
    expect(applyParamRenames('comments.list', { limit: 10 })).toEqual({ limit: 10 });
    expect(applyParamRenames('getText', {})).toEqual({});
  });

  it('does not strip non-renamed keys when a rename map exists', () => {
    expect(applyParamRenames('comments.create', { text: 'top-level' })).toEqual({ text: 'top-level' });
  });
});
