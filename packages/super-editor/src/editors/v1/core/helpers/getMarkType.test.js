import { describe, it, expect } from 'vitest';
import { getMarkType } from './getMarkType.js';

describe('getMarkType', () => {
  const schema = {
    marks: {
      bold: { name: 'bold' },
    },
  };

  it('returns mark instance when provided directly', () => {
    const mark = { name: 'custom' };
    expect(getMarkType(mark, schema)).toBe(mark);
  });

  it('looks up mark by name and throws when missing', () => {
    expect(getMarkType('bold', schema).name).toBe('bold');
    expect(() => getMarkType('italic', schema)).toThrow(/There is no mark type named 'italic'/);
  });
});
