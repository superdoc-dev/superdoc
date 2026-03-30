import { describe, it, expect } from 'vitest';
import {
  extractListLevelStyles,
  numDefMap,
  numDefByTypeMap,
  startHelperMap,
  googleNumDefMap,
  getLvlTextForGoogleList,
} from './pasteListHelpers.js';

describe('pasteListHelpers', () => {
  it('extracts styles for a given list definition', () => {
    const css = `@list l0:level1 lfo1{mso-level-number-format:decimal;margin-left:18pt}`;
    const result = extractListLevelStyles(css, 0, 1, 1);

    expect(result).toEqual({
      'mso-level-number-format': 'decimal',
      'margin-left': '18pt',
    });
  });

  it('maps list markers to numbering formats', () => {
    expect(numDefMap.get('roman-upper')).toBe('upperRoman');
    expect(numDefByTypeMap.get('A')).toBe('upperLetter');
    expect(googleNumDefMap.get('decimal-leading-zero')).toBe('decimal');
  });

  it('derives start values using helper map', () => {
    expect(startHelperMap.get('decimal')('12.')).toBe(12);
    expect(startHelperMap.get('lowerLetter')('c.')).toBe(3);
    expect(startHelperMap.get('upperRoman')('IV)')).toBe(4);
    expect(startHelperMap.get('bullet')()).toBe(1);
  });

  it('returns level text for Google lists', () => {
    const editor = {
      converter: {
        numbering: {
          abstracts: {
            0: {
              elements: [
                {
                  name: 'w:lvl',
                  attributes: { 'w:ilvl': '0' },
                  elements: [
                    {
                      name: 'w:lvlText',
                      attributes: { 'w:val': '•' },
                    },
                  ],
                },
                {
                  name: 'w:lvl',
                  attributes: { 'w:ilvl': '1' },
                  elements: [
                    {
                      name: 'w:lvlText',
                      attributes: { 'w:val': '•' },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };

    expect(getLvlTextForGoogleList('decimal-leading-zero', 1, editor)).toBe('0%1.');
    expect(getLvlTextForGoogleList('bullet', 1, editor)).toBe('•');
    expect(getLvlTextForGoogleList('decimal', 2, editor)).toBe('%2.');
  });
});
