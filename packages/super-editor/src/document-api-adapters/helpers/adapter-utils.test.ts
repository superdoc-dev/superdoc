import type { UnknownNodeDiagnostic } from '@superdoc/document-api';
import { addDiagnostic, dedupeDiagnostics, findCandidateByPos, paginate, scopeByRange } from './adapter-utils.js';

// ---------------------------------------------------------------------------
// paginate
// ---------------------------------------------------------------------------

describe('paginate', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('returns all items when no offset or limit is provided', () => {
    const result = paginate(items);
    expect(result).toEqual({ total: 5, items: ['a', 'b', 'c', 'd', 'e'] });
  });

  it('applies offset', () => {
    const result = paginate(items, 2);
    expect(result).toEqual({ total: 5, items: ['c', 'd', 'e'] });
  });

  it('applies limit', () => {
    const result = paginate(items, 0, 3);
    expect(result).toEqual({ total: 5, items: ['a', 'b', 'c'] });
  });

  it('combines offset and limit', () => {
    const result = paginate(items, 1, 2);
    expect(result).toEqual({ total: 5, items: ['b', 'c'] });
  });

  it('returns empty when offset exceeds length', () => {
    const result = paginate(items, 10);
    expect(result).toEqual({ total: 5, items: [] });
  });

  it('returns empty for limit 0', () => {
    const result = paginate(items, 0, 0);
    expect(result).toEqual({ total: 5, items: [] });
  });

  it('clamps negative offset to 0', () => {
    const result = paginate(items, -5, 2);
    expect(result).toEqual({ total: 5, items: ['a', 'b'] });
  });

  it('clamps negative limit to 0', () => {
    const result = paginate(items, 0, -1);
    expect(result).toEqual({ total: 5, items: [] });
  });

  it('handles empty array', () => {
    const result = paginate([]);
    expect(result).toEqual({ total: 0, items: [] });
  });
});

// ---------------------------------------------------------------------------
// dedupeDiagnostics
// ---------------------------------------------------------------------------

describe('dedupeDiagnostics', () => {
  it('removes duplicate diagnostics by message', () => {
    const diagnostics: UnknownNodeDiagnostic[] = [
      { message: 'error A' },
      { message: 'error A' },
      { message: 'error B' },
    ];

    const result = dedupeDiagnostics(diagnostics);

    expect(result).toEqual([{ message: 'error A' }, { message: 'error B' }]);
  });

  it('considers hint in deduplication key', () => {
    const diagnostics: UnknownNodeDiagnostic[] = [
      { message: 'same', hint: 'hint1' },
      { message: 'same', hint: 'hint2' },
    ];

    const result = dedupeDiagnostics(diagnostics);

    expect(result).toHaveLength(2);
  });

  it('considers address in deduplication key', () => {
    const diagnostics: UnknownNodeDiagnostic[] = [
      { message: 'same', address: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
      { message: 'same', address: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' } },
    ];

    const result = dedupeDiagnostics(diagnostics);

    expect(result).toHaveLength(2);
  });

  it('preserves insertion order', () => {
    const diagnostics: UnknownNodeDiagnostic[] = [{ message: 'first' }, { message: 'second' }, { message: 'first' }];

    const result = dedupeDiagnostics(diagnostics);

    expect(result[0].message).toBe('first');
    expect(result[1].message).toBe('second');
  });

  it('returns empty array for empty input', () => {
    expect(dedupeDiagnostics([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addDiagnostic
// ---------------------------------------------------------------------------

describe('addDiagnostic', () => {
  it('pushes a diagnostic with the given message', () => {
    const diagnostics: UnknownNodeDiagnostic[] = [];
    addDiagnostic(diagnostics, 'Something went wrong.');

    expect(diagnostics).toEqual([{ message: 'Something went wrong.' }]);
  });
});

// ---------------------------------------------------------------------------
// scopeByRange
// ---------------------------------------------------------------------------

describe('scopeByRange', () => {
  const candidates = [
    { pos: 0, end: 10 },
    { pos: 15, end: 25 },
    { pos: 30, end: 40 },
  ];

  it('returns all candidates when range is undefined', () => {
    const result = scopeByRange(candidates, undefined);
    expect(result).toHaveLength(3);
  });

  it('filters to candidates fully within the range', () => {
    const result = scopeByRange(candidates, { start: 0, end: 30 });
    expect(result).toHaveLength(2);
    expect(result[0].pos).toBe(0);
    expect(result[1].pos).toBe(15);
  });

  it('excludes candidates partially outside the range', () => {
    const result = scopeByRange(candidates, { start: 5, end: 40 });
    expect(result).toHaveLength(2);
    expect(result[0].pos).toBe(15);
    expect(result[1].pos).toBe(30);
  });

  it('returns empty when no candidates fit', () => {
    const result = scopeByRange(candidates, { start: 11, end: 14 });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findCandidateByPos
// ---------------------------------------------------------------------------

describe('findCandidateByPos', () => {
  // Candidates: [0, 10), [15, 25), [30, 40)
  const candidates = [
    { pos: 0, end: 10, id: 'a' },
    { pos: 15, end: 25, id: 'b' },
    { pos: 30, end: 40, id: 'c' },
  ];

  it('finds a candidate at start of range', () => {
    expect(findCandidateByPos(candidates, 0)?.id).toBe('a');
  });

  it('finds a candidate in the middle of range', () => {
    expect(findCandidateByPos(candidates, 5)?.id).toBe('a');
  });

  it('treats end as exclusive (pos at end returns undefined for gap)', () => {
    // pos 10 is at candidate.end, which is exclusive — should not match 'a'
    expect(findCandidateByPos(candidates, 10)).toBeUndefined();
  });

  it('finds the middle candidate', () => {
    expect(findCandidateByPos(candidates, 20)?.id).toBe('b');
  });

  it('finds the last candidate', () => {
    expect(findCandidateByPos(candidates, 35)?.id).toBe('c');
  });

  it('returns undefined for position in a gap', () => {
    expect(findCandidateByPos(candidates, 12)).toBeUndefined();
  });

  it('returns undefined for position beyond all candidates', () => {
    expect(findCandidateByPos(candidates, 50)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(findCandidateByPos([], 5)).toBeUndefined();
  });

  it('finds the only candidate in a single-element array', () => {
    const single = [{ pos: 5, end: 15, id: 'only' }];
    expect(findCandidateByPos(single, 5)?.id).toBe('only');
    expect(findCandidateByPos(single, 10)?.id).toBe('only');
    expect(findCandidateByPos(single, 4)).toBeUndefined();
    expect(findCandidateByPos(single, 15)).toBeUndefined();
  });
});
