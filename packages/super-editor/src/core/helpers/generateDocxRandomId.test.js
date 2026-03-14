import { describe, expect, it } from 'vitest';
import { generateDocxRandomId, generateRandomSigned32BitIntStrId } from './generateDocxRandomId.js';

describe('generateDocxRandomId', () => {
  it('returns an 8-character string by default', () => {
    const id = generateDocxRandomId();
    expect(id).toHaveLength(8);
  });

  it('returns uppercase hex matching the OOXML spec', () => {
    // Run multiple times to reduce chance of false-passing on an all-digit result.
    const ids = Array.from({ length: 50 }, () => generateDocxRandomId());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9A-F]{8}$/);
    }
    // At least one ID should contain a letter A-F to confirm uppercasing.
    const hasLetter = ids.some((id) => /[A-F]/.test(id));
    expect(hasLetter).toBe(true);
  });

  it('respects a custom length parameter', () => {
    const id = generateDocxRandomId(4);
    expect(id).toHaveLength(4);
    expect(id).toMatch(/^[0-9A-F]{4}$/);
  });

  it('pads short values with leading zeros', () => {
    // With length 8 and a max of 0x7fffffff, values below 0x10000000 need padding.
    // We can't control Math.random, but we verify the contract holds across many calls.
    const ids = Array.from({ length: 100 }, () => generateDocxRandomId());
    for (const id of ids) {
      expect(id).toHaveLength(8);
    }
  });
});

describe('generateRandomSigned32BitIntStrId', () => {
  it('returns a numeric string', () => {
    const id = generateRandomSigned32BitIntStrId();
    expect(id).toMatch(/^\d+$/);
  });

  it('returns a value within 31-bit range', () => {
    const ids = Array.from({ length: 50 }, () => Number(generateRandomSigned32BitIntStrId()));
    for (const val of ids) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(0x7fffffff);
    }
  });
});
