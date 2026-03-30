import { describe, it, expect } from 'vitest';
import { computeDirtySegmentIds } from './dirty-ranges.js';
import type { ProofingSegment } from './types.js';

function makeSegment(id: string, paraPos: number, text = 'hello'): ProofingSegment {
  return { id, text, metadata: { surface: 'body' } };
}

/** Build segments and their position map together for convenience. */
function makeSegmentsWithPositions(...entries: Array<[string, number]>) {
  const segments = entries.map(([id, pos]) => makeSegment(id, pos));
  const positions = new Map(entries.map(([id, pos]) => [id, pos]));
  return { segments, positions };
}

describe('computeDirtySegmentIds', () => {
  it('returns empty set for no changed ranges', () => {
    const { segments, positions } = makeSegmentsWithPositions(['blk-a', 0], ['blk-b', 100]);
    const dirty = computeDirtySegmentIds(segments, positions, []);
    expect(dirty.size).toBe(0);
  });

  it('marks segment containing changed range', () => {
    const { segments, positions } = makeSegmentsWithPositions(['blk-a', 0], ['blk-b', 100], ['blk-c', 200]);
    const dirty = computeDirtySegmentIds(segments, positions, [{ from: 110, to: 120 }]);
    expect(dirty.has('blk-b')).toBe(true);
  });

  it('marks multiple segments for multi-paragraph edit', () => {
    const { segments, positions } = makeSegmentsWithPositions(['blk-a', 0], ['blk-b', 100], ['blk-c', 200]);
    const dirty = computeDirtySegmentIds(segments, positions, [{ from: 50, to: 150 }]);
    expect(dirty.has('blk-a')).toBe(true);
    expect(dirty.has('blk-b')).toBe(true);
  });

  it('marks adjacent segment for boundary edits', () => {
    const { segments, positions } = makeSegmentsWithPositions(['blk-a', 0], ['blk-b', 100], ['blk-c', 200]);
    const dirty = computeDirtySegmentIds(segments, positions, [{ from: 100, to: 100 }]);
    expect(dirty.has('blk-a')).toBe(true);
  });

  it('handles change at document start', () => {
    const { segments, positions } = makeSegmentsWithPositions(['blk-a', 0], ['blk-b', 100]);
    const dirty = computeDirtySegmentIds(segments, positions, [{ from: 0, to: 5 }]);
    expect(dirty.has('blk-a')).toBe(true);
  });

  it('handles change at document end', () => {
    const { segments, positions } = makeSegmentsWithPositions(['blk-a', 0], ['blk-b', 100]);
    const dirty = computeDirtySegmentIds(segments, positions, [{ from: 150, to: 200 }]);
    expect(dirty.has('blk-b')).toBe(true);
  });

  it('handles empty segments list', () => {
    const dirty = computeDirtySegmentIds([], new Map(), [{ from: 0, to: 10 }]);
    expect(dirty.size).toBe(0);
  });

  it('works with UUID-based segment IDs', () => {
    const { segments, positions } = makeSegmentsWithPositions(['blk-abc-123', 0], ['blk-def-456', 100]);
    const dirty = computeDirtySegmentIds(segments, positions, [{ from: 50, to: 60 }]);
    expect(dirty.has('blk-abc-123')).toBe(true);
    expect(dirty.has('blk-def-456')).toBe(false);
  });
});
