import { describe, it, expect } from 'vitest';
import {
  isCommentAnchorKey,
  isTrackedChangeAnchorKey,
  makeCommentAnchorKey,
  makeTrackedChangeAnchorKey,
  parseTrackedChangeAnchorKey,
} from './tracked-change-runtime-ref.js';

describe('anchor key helpers', () => {
  it('makeTrackedChangeAnchorKey formats tc::<storyKey>::<rawId>', () => {
    expect(makeTrackedChangeAnchorKey({ storyKey: 'body', rawId: 'rev-1' })).toBe('tc::body::rev-1');
    expect(makeTrackedChangeAnchorKey({ storyKey: 'hf:part:rId4', rawId: 'r7' })).toBe('tc::hf:part:rId4::r7');
    expect(makeTrackedChangeAnchorKey({ storyKey: 'fn:5', rawId: 'rev-123' })).toBe('tc::fn:5::rev-123');
  });

  it('makeCommentAnchorKey formats comment::<id>', () => {
    expect(makeCommentAnchorKey('c-1')).toBe('comment::c-1');
  });

  it('isTrackedChangeAnchorKey classifies keys', () => {
    expect(isTrackedChangeAnchorKey('tc::body::r1')).toBe(true);
    expect(isTrackedChangeAnchorKey('comment::c-1')).toBe(false);
    expect(isTrackedChangeAnchorKey('r1')).toBe(false);
  });

  it('isCommentAnchorKey classifies keys', () => {
    expect(isCommentAnchorKey('comment::c-1')).toBe(true);
    expect(isCommentAnchorKey('tc::body::r1')).toBe(false);
  });

  it('parseTrackedChangeAnchorKey round-trips body and non-body', () => {
    expect(parseTrackedChangeAnchorKey('tc::body::rev-1')).toEqual({ storyKey: 'body', rawId: 'rev-1' });
    expect(parseTrackedChangeAnchorKey('tc::hf:part:rId4::r7')).toEqual({
      storyKey: 'hf:part:rId4',
      rawId: 'r7',
    });
    expect(parseTrackedChangeAnchorKey('tc::fn:12::rev-abc')).toEqual({ storyKey: 'fn:12', rawId: 'rev-abc' });
  });

  it('parseTrackedChangeAnchorKey rejects malformed keys', () => {
    expect(parseTrackedChangeAnchorKey('not-an-anchor')).toBeNull();
    expect(parseTrackedChangeAnchorKey('tc::')).toBeNull();
    expect(parseTrackedChangeAnchorKey('comment::c1')).toBeNull();
  });
});
