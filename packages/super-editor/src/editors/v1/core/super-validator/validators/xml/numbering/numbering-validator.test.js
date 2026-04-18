import { describe, it, expect, vi } from 'vitest';
import { createNumberingValidator } from './numbering-validator.js';

function makeEditorWithNumbering(numberingXmlLike) {
  return {
    converter: {
      convertedXml: {
        'word/numbering.xml': numberingXmlLike,
      },
    },
  };
}

function makeLogger() {
  return { debug: vi.fn(), withPrefix: vi.fn(() => ({ debug: vi.fn() })) };
}

describe('numbering-validator', () => {
  it('returns invalid when numbering.xml is missing or malformed', () => {
    const cases = [undefined, null, {}, { elements: [] }, { elements: [{}] }, { elements: [{ elements: [] }] }];

    for (const numbering of cases) {
      const editor = makeEditorWithNumbering(numbering);
      const logger = makeLogger();
      const validator = createNumberingValidator({ editor, logger });
      const result = validator();

      expect(result.modified).toBe(false);
      expect(result.results).toEqual(['word/numbering.xml is not a valid xml']);
      expect(logger.debug).not.toHaveBeenCalled();
    }
  });

  it('no changes when all <w:num> have valid numeric w:numId', () => {
    const numbering = {
      elements: [
        {
          elements: [
            {
              type: 'element',
              name: 'w:abstractNum',
              attributes: { 'w:abstractNumId': '1' },
              elements: [],
            },
            {
              type: 'element',
              name: 'w:num',
              attributes: { 'w:numId': '1' },
              elements: [],
            },
            {
              type: 'element',
              name: 'w:pPr',
              elements: [
                {
                  type: 'element',
                  name: 'w:num',
                  attributes: { 'w:numId': '42' },
                  elements: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const editor = makeEditorWithNumbering(numbering);
    const logger = makeLogger();

    const validator = createNumberingValidator({ editor, logger });
    const result = validator();

    expect(result.modified).toBe(false);
    expect(result.results).toEqual(['No <w:num> entries with null/invalid numId found.']);
    expect(logger.debug).not.toHaveBeenCalled();
    // Ensure structure preserved
    const root = numbering.elements[0].elements;
    expect(root.find((e) => e.name === 'w:num' && e.attributes['w:numId'] === '1')).toBeTruthy();
    const nested = root.find((e) => e.name === 'w:pPr').elements;
    expect(nested.find((e) => e.name === 'w:num' && e.attributes['w:numId'] === '42')).toBeTruthy();
  });

  it('removes <w:num> elements with invalid/missing w:numId and reports them', () => {
    const numbering = {
      elements: [
        {
          elements: [
            // valid
            { type: 'element', name: 'w:num', attributes: { 'w:numId': '10' }, elements: [] },
            // invalid: missing attr
            { type: 'element', name: 'w:num', elements: [] },
            // invalid: empty string
            { type: 'element', name: 'w:num', attributes: { 'w:numId': '' }, elements: [] },
            // invalid: literal "null"
            { type: 'element', name: 'w:num', attributes: { 'w:numId': 'null' }, elements: [] },
            // invalid: non-numeric
            { type: 'element', name: 'w:num', attributes: { 'w:numId': '12a' }, elements: [] },
            // nested invalid
            {
              type: 'element',
              name: 'w:pPr',
              elements: [
                { type: 'element', name: 'w:num', attributes: { 'w:numId': '  ' }, elements: [] },
                { type: 'element', name: 'w:num', attributes: { 'w:numId': '5' }, elements: [] }, // valid nested
              ],
            },
          ],
        },
      ],
    };

    const editor = makeEditorWithNumbering(numbering);
    const logger = makeLogger();

    const validator = createNumberingValidator({ editor, logger });
    const result = validator();

    expect(result.modified).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatch(/^Removed invalid <w:num> by numId:/);

    // The order should match traversal order:
    // missing node, '', 'null', '12a', '' (trim of spaces)
    expect(result.results[0]).toContain('missing node');
    expect(result.results[0]).toContain(', ,');
    expect(result.results[0]).toContain('null');
    expect(result.results[0]).toContain('12a');

    expect(logger.debug).toHaveBeenCalledTimes(1);

    // Ensure invalid ones are removed but valid remain
    const root = numbering.elements[0].elements;
    const rootNums = root.filter((e) => e.name === 'w:num');
    expect(rootNums).toHaveLength(1);
    expect(rootNums[0].attributes['w:numId']).toBe('10');

    const nested = root.find((e) => e.name === 'w:pPr').elements;
    const nestedNums = nested.filter((e) => e.name === 'w:num');
    expect(nestedNums).toHaveLength(1);
    expect(nestedNums[0].attributes['w:numId']).toBe('5');
  });
});
