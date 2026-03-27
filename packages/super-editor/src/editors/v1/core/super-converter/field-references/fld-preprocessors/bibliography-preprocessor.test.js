import { describe, expect, it } from 'vitest';
import { preProcessBibliographyInstruction } from './bibliography-preprocessor.js';

describe('preProcessBibliographyInstruction', () => {
  it('synthesizes an empty paragraph when the field has no rendered content', () => {
    const result = preProcessBibliographyInstruction([], 'BIBLIOGRAPHY');

    expect(result).toEqual([
      {
        name: 'sd:bibliography',
        type: 'element',
        attributes: {
          instruction: 'BIBLIOGRAPHY',
        },
        elements: [
          {
            name: 'w:p',
            type: 'element',
            elements: [],
          },
        ],
      },
    ]);
  });
});
