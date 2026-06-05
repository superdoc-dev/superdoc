import { describe, expect, it } from 'vitest';
import { parsePageNumberFieldSwitches } from './page-number-field-switches.js';

describe('parsePageNumberFieldSwitches', () => {
  it.each([
    ['PAGE \\* Arabic', { instruction: 'PAGE \\* Arabic', pageNumberFormat: 'decimal' }],
    ['PAGE \\* arabic', { instruction: 'PAGE \\* arabic', pageNumberFormat: 'decimal' }],
    ['PAGE \\* ARABIC', { instruction: 'PAGE \\* ARABIC', pageNumberFormat: 'decimal' }],
    ['PAGE \\* roman', { instruction: 'PAGE \\* roman', pageNumberFormat: 'lowerRoman' }],
    ['PAGE \\* Roman', { instruction: 'PAGE \\* Roman', pageNumberFormat: 'upperRoman' }],
    ['PAGE \\* ROMAN', { instruction: 'PAGE \\* ROMAN', pageNumberFormat: 'upperRoman' }],
    ['PAGE \\* alphabetic', { instruction: 'PAGE \\* alphabetic', pageNumberFormat: 'lowerLetter' }],
    ['PAGE \\* ALPHABETIC', { instruction: 'PAGE \\* ALPHABETIC', pageNumberFormat: 'upperLetter' }],
    ['PAGE \\* ArabicDash', { instruction: 'PAGE \\* ArabicDash', pageNumberFormat: 'numberInDash' }],
    ['PAGE \\* arabicdash', { instruction: 'PAGE \\* arabicdash', pageNumberFormat: 'numberInDash' }],
    ['PAGE \\* ARABICDASH', { instruction: 'PAGE \\* ARABICDASH', pageNumberFormat: 'numberInDash' }],
  ])('parses general format switch %s', (instruction, expected) => {
    expect(parsePageNumberFieldSwitches(instruction, 'PAGE')).toEqual(expected);
  });

  it.each([['PAGE \\* rOman'], ['PAGE \\* Alphabetic'], ['PAGE \\* aLpHaBeTiC']])(
    'does not case-fold output-case-sensitive switch %s',
    (instruction) => {
      expect(parsePageNumberFieldSwitches(instruction, 'PAGE')).toEqual({ instruction });
    },
  );

  it.each([
    ['NUMPAGES \\# "00"', { instruction: 'NUMPAGES \\# "00"', pageNumberFormat: 'decimal', pageNumberZeroPadding: 2 }],
    ['NUMPAGES \\# 000', { instruction: 'NUMPAGES \\# 000', pageNumberFormat: 'decimal', pageNumberZeroPadding: 3 }],
  ])('parses zero-padding picture switch %s', (instruction, expected) => {
    expect(parsePageNumberFieldSwitches(instruction, 'NUMPAGES')).toEqual(expected);
  });

  it('parses SECTIONPAGES zero-padding picture switches', () => {
    expect(parsePageNumberFieldSwitches('SECTIONPAGES \\# "000"', 'SECTIONPAGES')).toEqual({
      instruction: 'SECTIONPAGES \\# "000"',
      pageNumberFormat: 'decimal',
      pageNumberZeroPadding: 3,
    });
  });

  it('preserves unsupported switched instructions without format metadata', () => {
    expect(parsePageNumberFieldSwitches('PAGE \\* OrdText', 'PAGE')).toEqual({ instruction: 'PAGE \\* OrdText' });
  });

  it('omits default instruction metadata', () => {
    expect(parsePageNumberFieldSwitches(' PAGE ', 'PAGE')).toEqual({});
  });
});
