import { describe, it, expect } from 'vitest';
import { prioritizeByVisibility } from './visibility-priority.js';
import type { ProofingSegment } from './types.js';
import type { VisibilitySource } from './visibility-source.js';

function makeSeg(id: string, pageIndex?: number): ProofingSegment {
  return {
    id,
    text: 'test',
    metadata: { surface: 'body', pageIndex },
  };
}

describe('prioritizeByVisibility', () => {
  it('returns original order when no visibility data', () => {
    const source: VisibilitySource = { getVisiblePageIndices: () => null };
    const segs = [makeSeg('a', 0), makeSeg('b', 1), makeSeg('c', 2)];
    expect(prioritizeByVisibility(segs, source)).toEqual(segs);
  });

  it('returns original order when visible pages is empty', () => {
    const source: VisibilitySource = { getVisiblePageIndices: () => [] };
    const segs = [makeSeg('a', 0), makeSeg('b', 1)];
    expect(prioritizeByVisibility(segs, source)).toEqual(segs);
  });

  it('puts visible-page segments first', () => {
    const source: VisibilitySource = { getVisiblePageIndices: () => [2] };
    const segs = [makeSeg('a', 0), makeSeg('b', 1), makeSeg('c', 2)];
    const result = prioritizeByVisibility(segs, source);
    expect(result[0].id).toBe('c');
    expect(result[1].id).toBe('a');
    expect(result[2].id).toBe('b');
  });

  it('handles segments without pageIndex metadata', () => {
    const source: VisibilitySource = { getVisiblePageIndices: () => [0] };
    const segs = [makeSeg('no-page'), makeSeg('page-0', 0)];
    const result = prioritizeByVisibility(segs, source);
    expect(result[0].id).toBe('page-0');
    expect(result[1].id).toBe('no-page');
  });

  it('preserves relative order within visible and non-visible groups', () => {
    const source: VisibilitySource = { getVisiblePageIndices: () => [1] };
    const segs = [makeSeg('a', 0), makeSeg('b', 1), makeSeg('c', 0), makeSeg('d', 1)];
    const result = prioritizeByVisibility(segs, source);
    expect(result.map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});
