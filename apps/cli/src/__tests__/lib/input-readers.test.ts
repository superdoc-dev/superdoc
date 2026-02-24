import { describe, expect, test } from 'bun:test';
import {
  hasNonEmptyString,
  normalizeJsonValue,
  readBoolean,
  readChangeMode,
  readOptionalNumber,
  readOptionalString,
  readRequiredString,
} from '../../lib/input-readers';
import { CliError } from '../../lib/errors';

describe('input-readers', () => {
  describe('hasNonEmptyString', () => {
    test('returns true for non-empty strings', () => {
      expect(hasNonEmptyString('hello')).toBe(true);
      expect(hasNonEmptyString('a')).toBe(true);
    });

    test('returns false for empty string', () => {
      expect(hasNonEmptyString('')).toBe(false);
    });

    test('returns false for non-string values', () => {
      expect(hasNonEmptyString(null)).toBe(false);
      expect(hasNonEmptyString(undefined)).toBe(false);
      expect(hasNonEmptyString(42)).toBe(false);
      expect(hasNonEmptyString(true)).toBe(false);
      expect(hasNonEmptyString({})).toBe(false);
    });
  });

  describe('readRequiredString', () => {
    test('returns string value when present', () => {
      expect(readRequiredString({ name: 'test' }, 'name', 'op')).toBe('test');
    });

    test('throws MISSING_REQUIRED for missing field', () => {
      try {
        readRequiredString({}, 'name', 'op');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe('MISSING_REQUIRED');
        expect((error as CliError).message).toContain('input.name');
      }
    });

    test('throws MISSING_REQUIRED for empty string', () => {
      expect(() => readRequiredString({ name: '' }, 'name', 'op')).toThrow();
    });

    test('throws MISSING_REQUIRED for non-string value', () => {
      expect(() => readRequiredString({ name: 42 }, 'name', 'op')).toThrow();
    });
  });

  describe('readOptionalString', () => {
    test('returns string value when present', () => {
      expect(readOptionalString({ name: 'test' }, 'name')).toBe('test');
    });

    test('returns undefined for missing field', () => {
      expect(readOptionalString({}, 'name')).toBeUndefined();
    });

    test('returns undefined for empty string', () => {
      expect(readOptionalString({ name: '' }, 'name')).toBeUndefined();
    });

    test('returns undefined for non-string value', () => {
      expect(readOptionalString({ name: 42 }, 'name')).toBeUndefined();
    });
  });

  describe('readOptionalNumber', () => {
    test('returns number value when present', () => {
      expect(readOptionalNumber({ count: 5 }, 'count')).toBe(5);
    });

    test('returns zero for zero', () => {
      expect(readOptionalNumber({ count: 0 }, 'count')).toBe(0);
    });

    test('returns undefined for missing field', () => {
      expect(readOptionalNumber({}, 'count')).toBeUndefined();
    });

    test('returns undefined for NaN', () => {
      expect(readOptionalNumber({ count: NaN }, 'count')).toBeUndefined();
    });

    test('returns undefined for Infinity', () => {
      expect(readOptionalNumber({ count: Infinity }, 'count')).toBeUndefined();
    });

    test('returns undefined for non-number value', () => {
      expect(readOptionalNumber({ count: '5' }, 'count')).toBeUndefined();
    });
  });

  describe('readBoolean', () => {
    test('returns true when field is true', () => {
      expect(readBoolean({ flag: true }, 'flag')).toBe(true);
    });

    test('returns false when field is false', () => {
      expect(readBoolean({ flag: false }, 'flag')).toBe(false);
    });

    test('returns false for missing field', () => {
      expect(readBoolean({}, 'flag')).toBe(false);
    });

    test('returns false for truthy non-boolean values', () => {
      expect(readBoolean({ flag: 1 }, 'flag')).toBe(false);
      expect(readBoolean({ flag: 'true' }, 'flag')).toBe(false);
    });
  });

  describe('readChangeMode', () => {
    test('returns tracked when explicitly set', () => {
      expect(readChangeMode({ changeMode: 'tracked' })).toBe('tracked');
    });

    test('returns direct by default', () => {
      expect(readChangeMode({})).toBe('direct');
      expect(readChangeMode({ changeMode: 'direct' })).toBe('direct');
    });

    test('returns direct for unknown values', () => {
      expect(readChangeMode({ changeMode: 'unknown' })).toBe('direct');
    });
  });

  describe('normalizeJsonValue', () => {
    test('round-trips JSON-serializable values', () => {
      expect(normalizeJsonValue({ a: 1 }, 'test')).toEqual({ a: 1 });
      expect(normalizeJsonValue([1, 2, 3], 'test')).toEqual([1, 2, 3]);
      expect(normalizeJsonValue('hello', 'test')).toBe('hello');
    });

    test('strips undefined values from objects', () => {
      const result = normalizeJsonValue({ a: 1, b: undefined }, 'test');
      expect(result).toEqual({ a: 1 });
    });

    test('throws for non-serializable values', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      try {
        normalizeJsonValue(circular, 'test');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        expect((error as CliError).code).toBe('VALIDATION_ERROR');
        expect((error as CliError).message).toContain('JSON-serializable');
      }
    });
  });
});
