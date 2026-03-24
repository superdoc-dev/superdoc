import { describe, it, expect } from 'vitest';
import { computeDirtySegmentIds } from './dirty-ranges.js';
import type { ProofingSegment } from './types.js';

function makeSegment(paraPos: number, text = 'hello'): ProofingSegment {
  return {
    id: `seg-${paraPos}`,
    text,
    metadata: { surface: 'body' },
  };
}

describe('computeDirtySegmentIds', () => {
  it('returns empty set for no changed ranges', () => {
    const segments = [makeSegment(0), makeSegment(100)];
    const dirty = computeDirtySegmentIds(segments, []);
    expect(dirty.size).toBe(0);
  });

  it('marks segment containing changed range', () => {
    const segments = [makeSegment(0), makeSegment(100), makeSegment(200)];
    const dirty = computeDirtySegmentIds(segments, [{ from: 110, to: 120 }]);
    expect(dirty.has('seg-100')).toBe(true);
  });

  it('marks multiple segments for multi-paragraph edit', () => {
    const segments = [makeSegment(0), makeSegment(100), makeSegment(200)];
    const dirty = computeDirtySegmentIds(segments, [{ from: 50, to: 150 }]);
    expect(dirty.has('seg-0')).toBe(true);
    expect(dirty.has('seg-100')).toBe(true);
  });

  it('marks adjacent segment for boundary edits', () => {
    const segments = [makeSegment(0), makeSegment(100), makeSegment(200)];
    // Edit at the exact start of seg-100
    const dirty = computeDirtySegmentIds(segments, [{ from: 100, to: 100 }]);
    expect(dirty.has('seg-0')).toBe(true); // Adjacent segment
  });

  it('handles change at document start', () => {
    const segments = [makeSegment(0), makeSegment(100)];
    const dirty = computeDirtySegmentIds(segments, [{ from: 0, to: 5 }]);
    expect(dirty.has('seg-0')).toBe(true);
  });

  it('handles change at document end', () => {
    const segments = [makeSegment(0), makeSegment(100)];
    const dirty = computeDirtySegmentIds(segments, [{ from: 150, to: 200 }]);
    expect(dirty.has('seg-100')).toBe(true);
  });

  it('handles empty segments list', () => {
    const dirty = computeDirtySegmentIds([], [{ from: 0, to: 10 }]);
    expect(dirty.size).toBe(0);
  });
});
