import { describe, expect, it } from 'bun:test';
import { isRecord, isInteger, isTextAddress, isTextTarget, assertNoUnknownFields } from './validation-primitives.js';
import { DocumentApiValidationError } from './errors.js';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord('string')).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});

describe('isInteger', () => {
  it('returns true for integers', () => {
    expect(isInteger(0)).toBe(true);
    expect(isInteger(1)).toBe(true);
    expect(isInteger(-5)).toBe(true);
  });

  it('returns false for non-integer numbers', () => {
    expect(isInteger(1.5)).toBe(false);
    expect(isInteger(NaN)).toBe(false);
    expect(isInteger(Infinity)).toBe(false);
  });

  it('returns false for non-numbers', () => {
    expect(isInteger('1')).toBe(false);
    expect(isInteger(null)).toBe(false);
    expect(isInteger(undefined)).toBe(false);
  });
});

describe('isTextAddress', () => {
  it('returns true for valid text addresses', () => {
    expect(isTextAddress({ kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } })).toBe(true);
    expect(isTextAddress({ kind: 'text', blockId: 'p1', range: { start: 3, end: 3 } })).toBe(true);
  });

  it('returns false for wrong kind', () => {
    expect(isTextAddress({ kind: 'block', blockId: 'p1', range: { start: 0, end: 5 } })).toBe(false);
  });

  it('returns false for missing blockId', () => {
    expect(isTextAddress({ kind: 'text', range: { start: 0, end: 5 } })).toBe(false);
  });

  it('returns false for missing range', () => {
    expect(isTextAddress({ kind: 'text', blockId: 'p1' })).toBe(false);
  });

  it('returns false when start > end', () => {
    expect(isTextAddress({ kind: 'text', blockId: 'p1', range: { start: 5, end: 3 } })).toBe(false);
  });

  it('returns false for non-integer range values', () => {
    expect(isTextAddress({ kind: 'text', blockId: 'p1', range: { start: 0, end: 1.5 } })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isTextAddress(null)).toBe(false);
    expect(isTextAddress('text')).toBe(false);
    expect(isTextAddress(42)).toBe(false);
  });
});

describe('isTextTarget', () => {
  it('accepts single-segment targets', () => {
    expect(isTextTarget({ kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }] })).toBe(true);
  });

  it('accepts multi-segment targets', () => {
    expect(
      isTextTarget({
        kind: 'text',
        segments: [
          { blockId: 'p1', range: { start: 3, end: 10 } },
          { blockId: 'p2', range: { start: 0, end: 7 } },
        ],
      }),
    ).toBe(true);
  });

  it('rejects wrong kind', () => {
    expect(isTextTarget({ kind: 'block', segments: [{ blockId: 'p1', range: { start: 0, end: 5 } }] })).toBe(false);
  });

  it('rejects empty segments array', () => {
    expect(isTextTarget({ kind: 'text', segments: [] })).toBe(false);
  });

  it('rejects missing segments', () => {
    expect(isTextTarget({ kind: 'text' })).toBe(false);
  });

  it('rejects malformed segments', () => {
    expect(
      isTextTarget({
        kind: 'text',
        segments: [
          { blockId: 'p1', range: { start: 0, end: 5 } },
          { blockId: 'p2' }, // missing range
        ],
      }),
    ).toBe(false);
  });

  it('rejects range with start > end', () => {
    expect(isTextTarget({ kind: 'text', segments: [{ blockId: 'p1', range: { start: 7, end: 3 } }] })).toBe(false);
  });

  it('rejects non-integer range values', () => {
    expect(isTextTarget({ kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 1.5 } }] })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isTextTarget(null)).toBe(false);
    expect(isTextTarget('text')).toBe(false);
    expect(isTextTarget(42)).toBe(false);
  });
});

describe('assertNoUnknownFields', () => {
  it('does not throw for known fields', () => {
    const allowlist = new Set(['a', 'b']);
    expect(() => assertNoUnknownFields({ a: 1, b: 2 }, allowlist, 'test')).not.toThrow();
  });

  it('does not throw for empty input', () => {
    const allowlist = new Set(['a']);
    expect(() => assertNoUnknownFields({}, allowlist, 'test')).not.toThrow();
  });

  it('throws INVALID_INPUT for unknown fields', () => {
    const allowlist = new Set(['a']);
    try {
      assertNoUnknownFields({ a: 1, unknown: 2 }, allowlist, 'test');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentApiValidationError);
      const e = err as DocumentApiValidationError;
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.message).toContain('Unknown field "unknown"');
      expect(e.message).toContain('test');
    }
  });
});
