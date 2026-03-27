import { describe, it, expect } from 'vitest';
import { buildPaintSlices, findSliceAtPosition } from './proofing-ranges.js';
import type { StoredIssue } from './types.js';

function makeIssue(pmFrom: number, pmTo: number, overrides: Partial<StoredIssue> = {}): StoredIssue {
  return {
    segmentId: 'seg-0',
    start: 0,
    end: pmTo - pmFrom,
    kind: 'spelling',
    message: 'test',
    replacements: [],
    pmFrom,
    pmTo,
    state: 'confirmed',
    recheckId: null,
    ...overrides,
  };
}

describe('buildPaintSlices', () => {
  it('returns empty for no issues', () => {
    expect(buildPaintSlices([])).toEqual([]);
  });

  it('returns single slice for single issue', () => {
    const slices = buildPaintSlices([makeIssue(10, 15)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].pmFrom).toBe(10);
    expect(slices[0].pmTo).toBe(15);
    expect(slices[0].kind).toBe('spelling');
  });

  it('merges overlapping issues', () => {
    const slices = buildPaintSlices([makeIssue(10, 15), makeIssue(13, 20)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].pmFrom).toBe(10);
    expect(slices[0].pmTo).toBe(20);
  });

  it('merges adjacent issues (touching at boundary)', () => {
    const slices = buildPaintSlices([makeIssue(10, 15), makeIssue(15, 20)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].pmFrom).toBe(10);
    expect(slices[0].pmTo).toBe(20);
  });

  it('keeps non-overlapping issues separate', () => {
    const slices = buildPaintSlices([makeIssue(10, 15), makeIssue(20, 25)]);
    expect(slices).toHaveLength(2);
    expect(slices[0].pmFrom).toBe(10);
    expect(slices[1].pmFrom).toBe(20);
  });

  it('primary issue is the first by position', () => {
    const issue1 = makeIssue(10, 15, { message: 'first' });
    const issue2 = makeIssue(12, 18, { message: 'second' });
    const slices = buildPaintSlices([issue2, issue1]); // Out of order
    expect(slices[0].issue.message).toBe('first');
  });

  it('filters out non-spelling issues', () => {
    const slices = buildPaintSlices([makeIssue(10, 15, { kind: 'grammar' }), makeIssue(20, 25, { kind: 'spelling' })]);
    expect(slices).toHaveLength(1);
    expect(slices[0].pmFrom).toBe(20);
  });

  it('handles multiple overlapping ranges', () => {
    const slices = buildPaintSlices([makeIssue(10, 20), makeIssue(15, 25), makeIssue(22, 30)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].pmFrom).toBe(10);
    expect(slices[0].pmTo).toBe(30);
  });
});

describe('findSliceAtPosition', () => {
  it('returns null for empty slices', () => {
    expect(findSliceAtPosition([], 10)).toBeNull();
  });

  it('finds slice containing position', () => {
    const slices = buildPaintSlices([makeIssue(10, 15), makeIssue(20, 25)]);
    const found = findSliceAtPosition(slices, 12);
    expect(found).not.toBeNull();
    expect(found!.pmFrom).toBe(10);
  });

  it('returns null for position outside any slice', () => {
    const slices = buildPaintSlices([makeIssue(10, 15)]);
    expect(findSliceAtPosition(slices, 5)).toBeNull();
    expect(findSliceAtPosition(slices, 15)).toBeNull(); // Exclusive end
    expect(findSliceAtPosition(slices, 20)).toBeNull();
  });

  it('finds slice at exact start boundary', () => {
    const slices = buildPaintSlices([makeIssue(10, 15)]);
    expect(findSliceAtPosition(slices, 10)).not.toBeNull();
  });
});
