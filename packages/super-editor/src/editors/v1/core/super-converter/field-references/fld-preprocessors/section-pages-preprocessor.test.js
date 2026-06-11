// @ts-check
import { describe, it, expect } from 'vitest';
import { preProcessSectionPagesInstruction } from './section-pages-preprocessor.js';

describe('preProcessSectionPagesInstruction', () => {
  it.each([
    ['SECTIONPAGES', undefined, undefined],
    ['sectionpages', undefined, undefined],
    ['SectionPages', undefined, undefined],
    ['SECTIONPAGES \\* roman', 'lowerRoman', undefined],
    ['SECTIONPAGES \\* Roman \\* MERGEFORMAT', 'upperRoman', undefined],
    ['SECTIONPAGES \\# "000"', 'decimal', 3],
    ['SECTIONPAGES \\* Unsupported \\* MERGEFORMAT', undefined, undefined],
  ])(
    'creates sd:sectionPageCount and parses supported value format: %s',
    (instruction, pageNumberFormat, pageNumberZeroPadding) => {
      const result = preProcessSectionPagesInstruction([], instruction, null);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'sd:sectionPageCount',
        type: 'element',
        attributes: {
          instruction: instruction.trim().replace(/\s+/g, ' '),
          ...(pageNumberFormat ? { pageNumberFormat } : {}),
          ...(pageNumberZeroPadding != null ? { pageNumberZeroPadding } : {}),
        },
      });
    },
  );

  it('preserves cached text and content run styling', () => {
    const rPr = { name: 'w:rPr', elements: [{ name: 'w:b' }] };
    const result = preProcessSectionPagesInstruction(
      [
        {
          name: 'w:r',
          elements: [rPr, { name: 'w:t', elements: [{ type: 'text', text: '4' }] }],
        },
      ],
      'SECTIONPAGES',
      null,
    );

    expect(result[0].attributes.importedCachedText).toBe('4');
    expect(result[0].elements).toEqual([rPr]);
  });

  it('uses fieldRunRPr when cached content has no run properties', () => {
    const fieldRunRPr = { name: 'w:rPr', elements: [{ name: 'w:i' }] };
    const result = preProcessSectionPagesInstruction([], 'SECTIONPAGES', undefined, null, fieldRunRPr);

    expect(result[0].elements).toEqual([fieldRunRPr]);
  });
});
