import { describe, expect, it } from 'vitest';
import {
  isSeqInstruction,
  normalizeSeqIdentifier,
  parseSeqInstruction,
  sequenceFieldAttrsFromParsed,
} from './seq-instruction.js';

describe('parseSeqInstruction', () => {
  it.each([
    ['SEQ Figure', { keyword: 'SEQ', identifier: 'Figure', sequenceMode: 'next', format: 'Arabic' }],
    ['seq Figure', { keyword: 'seq', identifier: 'Figure', sequenceMode: 'next', format: 'Arabic' }],
    ['Seq Figure \\n', { keyword: 'Seq', identifier: 'Figure', sequenceMode: 'next' }],
    ['SEQ Figure \\c', { identifier: 'Figure', sequenceMode: 'current' }],
    ['SEQ Figure \\h', { identifier: 'Figure', hideResult: true }],
    ['SEQ Figure \\r 10', { identifier: 'Figure', restartNumber: 10 }],
    ['SEQ Figure \\r0', { identifier: 'Figure', restartNumber: 0 }],
    ['SEQ Figure \\R0', { identifier: 'Figure', restartNumber: 0 }],
    ['SEQ Figure \\s 1', { identifier: 'Figure', restartLevel: 1 }],
    ['SEQ Figure \\s1', { identifier: 'Figure', restartLevel: 1 }],
    ['SEQ Figure \\S1', { identifier: 'Figure', restartLevel: 1 }],
    ['seq level2 \\h \\r0', { keyword: 'seq', identifier: 'level2', hideResult: true, restartNumber: 0 }],
    ['SEQ Figure bookmarkName', { identifier: 'Figure', fieldArgument: 'bookmarkName' }],
    ['SEQ Figure "bookmark name"', { identifier: 'Figure', fieldArgument: 'bookmark name' }],
    [
      'SEQ Figure \\* roman',
      {
        identifier: 'Figure',
        format: 'roman',
        hasGeneralFormat: true,
        pageNumberFieldFormat: { format: 'lowerRoman' },
      },
    ],
    [
      'SEQ Figure \\*roman',
      {
        identifier: 'Figure',
        format: 'roman',
        hasGeneralFormat: true,
        pageNumberFieldFormat: { format: 'lowerRoman' },
      },
    ],
    [
      'seq level2 \\*arabic',
      {
        keyword: 'seq',
        identifier: 'level2',
        format: 'arabic',
        hasGeneralFormat: true,
        pageNumberFieldFormat: { format: 'decimal' },
      },
    ],
    [
      'SEQ Figure \\*"Roman"',
      {
        identifier: 'Figure',
        format: 'Roman',
        hasGeneralFormat: true,
        pageNumberFieldFormat: { format: 'upperRoman' },
      },
    ],
    [
      'SEQ Figure \\* ALPHABETIC',
      {
        identifier: 'Figure',
        format: 'ALPHABETIC',
        hasGeneralFormat: true,
        pageNumberFieldFormat: { format: 'upperLetter' },
      },
    ],
    [
      'SEQ Figure \\* ArabicDash',
      {
        identifier: 'Figure',
        format: 'ArabicDash',
        hasGeneralFormat: true,
        pageNumberFieldFormat: { format: 'numberInDash' },
      },
    ],
    ['SEQ Figure \\# "00"', { identifier: 'Figure', numericPictureFormat: { picture: '00' } }],
    ['SEQ Figure \\#00', { identifier: 'Figure', numericPictureFormat: { picture: '00' } }],
    ['SEQ Figure \\#"00"', { identifier: 'Figure', numericPictureFormat: { picture: '00' } }],
    ['SEQ Figure \\# "#,##0"', { identifier: 'Figure', numericPictureFormat: { picture: '#,##0' } }],
    [
      'SEQ Figure \\r 10 \\* roman \\h',
      {
        identifier: 'Figure',
        restartNumber: 10,
        format: 'roman',
        hasGeneralFormat: true,
        pageNumberFieldFormat: { format: 'lowerRoman' },
        hideResult: true,
      },
    ],
    ['SEQ Figure \\c \\n', { identifier: 'Figure', sequenceMode: 'next' }],
    ['SEQ Figure \\r nope \\s 99', { identifier: 'Figure', restartNumber: null, restartLevel: null }],
  ])('parses %s', (instruction, expected) => {
    expect(parseSeqInstruction(instruction)).toMatchObject({
      instruction,
      fieldArgument: '',
      hideResult: false,
      restartNumber: null,
      restartLevel: null,
      numericPictureFormat: null,
      hasGeneralFormat: false,
      unknownSwitches: [],
      ...expected,
    });
  });

  it('returns a safe empty parse for non-SEQ instructions', () => {
    expect(parseSeqInstruction('PAGEREF bookmark')).toEqual({
      instruction: 'PAGEREF bookmark',
      keyword: 'PAGEREF',
      identifier: '',
      fieldArgument: '',
      sequenceMode: 'next',
      hideResult: false,
      restartNumber: null,
      restartLevel: null,
      format: 'Arabic',
      numericPictureFormat: null,
      hasGeneralFormat: false,
      unknownSwitches: [],
    });
  });

  it('uses the shared keyword extractor for SEQ dispatch', () => {
    expect(parseSeqInstruction('"SEQ" Figure')).toMatchObject({
      keyword: 'SEQ',
      identifier: '',
      sequenceMode: 'next',
      format: 'Arabic',
    });
  });

  it('preserves the original instruction string without trimming', () => {
    expect(parseSeqInstruction('  SEQ Figure  \\n  ')).toMatchObject({
      instruction: '  SEQ Figure  \\n  ',
      keyword: 'SEQ',
      identifier: 'Figure',
    });
  });

  it('keeps unknown general formats without page-number mapping', () => {
    const parsed = parseSeqInstruction('SEQ Figure \\* OrdText');
    expect(parsed).toMatchObject({
      format: 'OrdText',
      hasGeneralFormat: true,
    });
    expect(parsed).not.toHaveProperty('pageNumberFieldFormat');
  });

  it('preserves unknown switches as raw tokens', () => {
    expect(parseSeqInstruction('SEQ Figure \\z value \\q').unknownSwitches).toEqual(['\\z', 'value', '\\q']);
  });

  it('preserves only the first numeric picture and records later numeric switches as unknown', () => {
    expect(parseSeqInstruction('SEQ Figure \\# "00" \\# "000"')).toMatchObject({
      numericPictureFormat: { picture: '00' },
      unknownSwitches: ['\\#', '000'],
    });
  });

  it('parses quoted identifiers and switch values', () => {
    expect(parseSeqInstruction('SEQ "Figure Set" \\* "Roman" \\# "00"')).toMatchObject({
      identifier: 'Figure Set',
      format: 'Roman',
      pageNumberFieldFormat: { format: 'upperRoman' },
      numericPictureFormat: { picture: '00' },
    });
  });

  it('unescapes quoted tokens without rewriting unquoted tokens', () => {
    expect(parseSeqInstruction('SEQ "Figure \\"Set\\""').identifier).toBe('Figure "Set"');
    expect(parseSeqInstruction('SEQ Figure\\\\Set').identifier).toBe('Figure\\\\Set');
  });
});

describe('isSeqInstruction', () => {
  it('matches SEQ instructions case-insensitively', () => {
    expect(isSeqInstruction('SEQ Figure')).toBe(true);
    expect(isSeqInstruction('seq Figure')).toBe(true);
    expect(isSeqInstruction('PAGEREF target')).toBe(false);
  });
});

describe('normalizeSeqIdentifier', () => {
  it('trims string identifiers and ignores non-strings', () => {
    expect(normalizeSeqIdentifier(' Figure ')).toBe('Figure');
    expect(normalizeSeqIdentifier(null)).toBe('');
  });
});

describe('sequenceFieldAttrsFromParsed', () => {
  it('projects parsed SEQ metadata into normalized sequenceField attrs', () => {
    const attrs = sequenceFieldAttrsFromParsed(parseSeqInstruction('SEQ Figure \\r 3 \\* roman'));

    expect(attrs).toEqual({
      identifier: 'Figure',
      fieldArgument: '',
      sequenceMode: 'next',
      hideResult: false,
      restartNumber: 3,
      restartLevel: null,
      format: 'roman',
      hasGeneralFormat: true,
      pageNumberFieldFormat: { format: 'lowerRoman' },
      numericPictureFormat: null,
    });
  });

  it('keeps the parser default separate from the legacy PM attr default', () => {
    const parsed = parseSeqInstruction('SEQ Figure');

    expect(parsed.format).toBe('Arabic');
    expect(sequenceFieldAttrsFromParsed(parsed)).toMatchObject({
      format: 'ARABIC',
      pageNumberFieldFormat: null,
      numericPictureFormat: null,
    });
  });
});
