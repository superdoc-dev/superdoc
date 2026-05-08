import { describe, expect, it } from 'bun:test';
import { generateOrderedListIndex, intToJapaneseCounting, normalizeLvlTextChar } from './index';

describe('generateOrderedListIndex', () => {
  it('formats decimal markers with multi-digit replacements', () => {
    const result = generateOrderedListIndex({
      listLevel: [12, 4],
      lvlText: '0.%1.%2)',
      listNumberingType: 'decimal',
    });
    expect(result).toBe('.12.4)');
  });

  it('formats decimalZero markers with leading zeros for single digits', () => {
    const singleDigit = generateOrderedListIndex({
      listLevel: [1, 1],
      lvlText: '%1.%2',
      listNumberingType: 'decimalZero',
    });
    expect(singleDigit).toBe('1.01');

    const doubleDigit = generateOrderedListIndex({
      listLevel: [1, 10],
      lvlText: '%1.%2',
      listNumberingType: 'decimalZero',
    });
    expect(doubleDigit).toBe('1.10');
  });

  it('formats lower roman numerals', () => {
    const result = generateOrderedListIndex({
      listLevel: [4],
      lvlText: '%1.',
      listNumberingType: 'lowerRoman',
    });
    expect(result).toBe('iv.');
  });

  it('formats ordinal values', () => {
    const result = generateOrderedListIndex({
      listLevel: [21],
      lvlText: '%1',
      listNumberingType: 'ordinal',
    });
    expect(result).toBe('21st');
  });

  it('pads custom formats that match the Word pattern', () => {
    const result = generateOrderedListIndex({
      listLevel: [7],
      lvlText: '%1.',
      listNumberingType: 'custom',
      customFormat: '001, 002, 003, ...',
    });
    expect(result).toBe('007.');
  });

  it('falls back to plain numbers when custom format does not match the pattern', () => {
    const result = generateOrderedListIndex({
      listLevel: [5],
      lvlText: '%1)',
      listNumberingType: 'custom',
      customFormat: '1, 2, 3, ...',
    });
    expect(result).toBe('5)');
  });

  it('returns null for unknown numbering types', () => {
    const result = generateOrderedListIndex({
      listLevel: [1],
      lvlText: '%1',
      listNumberingType: 'non-existent',
    });
    expect(result).toBeNull();
  });

  // Word's `upperLetter` / `lowerLetter` use repeated-letter notation (AA, BB,
  // CC, ..., AAA, BBB, ...) rather than Excel-style base-26 (AA, AB, AC, ...).
  // OOXML spec: at value n, repeat the letter at index (n-1)%26 floor((n-1)/26)+1 times.
  it('formats upperLetter markers with Word-compatible repeated letters', () => {
    const at = (n: number) =>
      generateOrderedListIndex({ listLevel: [n], lvlText: '%1.', listNumberingType: 'upperLetter' });
    expect(at(1)).toBe('A.');
    expect(at(26)).toBe('Z.');
    expect(at(27)).toBe('AA.');
    expect(at(28)).toBe('BB.');
    expect(at(52)).toBe('ZZ.');
    expect(at(53)).toBe('AAA.');
    expect(at(78)).toBe('ZZZ.');
    expect(at(79)).toBe('AAAA.');
  });

  it('formats lowerLetter markers with Word-compatible repeated letters', () => {
    const at = (n: number) =>
      generateOrderedListIndex({ listLevel: [n], lvlText: '%1)', listNumberingType: 'lowerLetter' });
    expect(at(1)).toBe('a)');
    expect(at(26)).toBe('z)');
    expect(at(27)).toBe('aa)');
    expect(at(28)).toBe('bb)');
    expect(at(52)).toBe('zz)');
    expect(at(53)).toBe('aaa)');
  });

  describe('malformed lvlText', () => {
    it('returns null when lvlText is null', () => {
      const result = generateOrderedListIndex({
        listLevel: [1],
        lvlText: null,
        listNumberingType: 'decimal',
      });
      expect(result).toBeNull();
    });

    it('returns null when lvlText is undefined', () => {
      const result = generateOrderedListIndex({
        listLevel: [1],
        lvlText: undefined,
        listNumberingType: 'decimal',
      });
      expect(result).toBeNull();
    });

    it('returns null when lvlText is a non-string type', () => {
      const result = generateOrderedListIndex({
        listLevel: [1],
        lvlText: 42 as any,
        listNumberingType: 'decimal',
      });
      expect(result).toBeNull();
    });

    it('still formats correctly with valid lvlText after guard', () => {
      const result = generateOrderedListIndex({
        listLevel: [3],
        lvlText: '%1.',
        listNumberingType: 'decimal',
      });
      expect(result).toBe('3.');
    });
  });

  it('handles undefined customFormat for custom numbering type', () => {
    const result = generateOrderedListIndex({
      listLevel: [5],
      lvlText: '%1)',
      listNumberingType: 'custom',
      customFormat: undefined,
    });
    expect(result).toBe('5)');
  });
});

describe('normalizeLvlTextChar', () => {
  it('normalizes known bullet glyphs', () => {
    expect(normalizeLvlTextChar('')).toBe('•');
    expect(normalizeLvlTextChar('○')).toBe('◦');
    expect(normalizeLvlTextChar('o')).toBe('◦');
    expect(normalizeLvlTextChar('■')).toBe('▪');
    expect(normalizeLvlTextChar('□')).toBe('◯');
  });

  it('returns the original character when no normalization is required', () => {
    expect(normalizeLvlTextChar('•')).toBe('•');
    expect(normalizeLvlTextChar(undefined)).toBeUndefined();
  });
});

describe('intToJapaneseCounting', () => {
  it('returns zero and single digit representations', () => {
    expect(intToJapaneseCounting(0)).toBe('零');
    expect(intToJapaneseCounting(3)).toBe('三');
  });

  it('handles teens and hundreds', () => {
    expect(intToJapaneseCounting(10)).toBe('十');
    expect(intToJapaneseCounting(15)).toBe('十五');
    expect(intToJapaneseCounting(342)).toBe('三百四十二');
  });
});
