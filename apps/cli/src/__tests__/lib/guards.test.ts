import { describe, expect, test } from 'bun:test';
import { asRecord, isRecord } from '../../lib/guards';

describe('isRecord', () => {
  test('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  test('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });

  test('returns false for arrays', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  test('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(Symbol())).toBe(false);
  });
});

describe('asRecord', () => {
  test('returns the object for plain objects', () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  test('returns null for non-objects', () => {
    expect(asRecord(null)).toBeNull();
    expect(asRecord(undefined)).toBeNull();
    expect(asRecord([])).toBeNull();
    expect(asRecord('string')).toBeNull();
    expect(asRecord(42)).toBeNull();
  });
});
