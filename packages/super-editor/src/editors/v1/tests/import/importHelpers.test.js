import { describe, it, expect } from 'vitest';
import { parseMarks } from '@core/super-converter/v2/importer/markImporter.js';
import { parseProperties } from '@core/super-converter/v2/importer/importerHelpers.js';

// Helper creators (mirroring style of other importer tests)
const createRunProperty = (name, attributes = {}) => ({
  name,
  attributes,
});

const createRunProperties = (children = []) => ({
  name: 'w:rPr',
  elements: children,
});

const createParagraphProperties = (children = []) => ({
  name: 'w:pPr',
  elements: children,
});

describe('Invalid underline handling', () => {
  it('should ignore w:u marks without a w:val attribute', () => {
    const runProps = createRunProperties([createRunProperty('w:u', {})]);

    const marks = parseMarks(runProps);

    // parseMarks returns an array that should NOT include underline when w:val is missing
    const hasUnderline = marks.some((m) => m.type === 'underline');
    expect(hasUnderline).toBe(false);
  });

  it('should not include w:u found inside paragraph properties (w:pPr)', () => {
    const paragraphNode = {
      name: 'w:p',
      elements: [
        createParagraphProperties([
          // even with a value present, underline from paragraph properties should be ignored
          createRunProperty('w:u', { 'w:val': 'single' }),
        ]),
        // minimal run to satisfy parseProperties structure
        {
          name: 'w:r',
          elements: [
            {
              name: 'w:t',
              elements: [{ text: 'Sample text' }],
            },
          ],
        },
      ],
    };

    const { marks } = parseProperties(paragraphNode);

    const hasUnderline = marks.some((m) => m.type === 'underline');
    expect(hasUnderline).toBe(false);
  });

  it('should include underline mark when w:u has valid w:val', () => {
    const runProps = createRunProperties([createRunProperty('w:u', { 'w:val': 'single' })]);

    const marks = parseMarks(runProps);

    const underlineMark = marks.find((m) => m.type === 'underline');
    expect(underlineMark).toBeDefined();
    expect(underlineMark.attrs?.underlineType).toBe('single');
  });
});

describe.skip('section margin normalization', () => {
  it('parses header/footer inches from sectPr within paragraph properties', () => {
    const paragraphNode = {
      name: 'w:p',
      elements: [
        createParagraphProperties([
          {
            name: 'w:sectPr',
            elements: [
              {
                name: 'w:pgMar',
                attributes: {
                  'w:header': '720',
                  'w:footer': '2160',
                },
              },
            ],
          },
        ]),
        {
          name: 'w:r',
          elements: [
            {
              name: 'w:t',
              elements: [{ text: 'Example' }],
            },
          ],
        },
      ],
    };

    const { attributes } = parseProperties(paragraphNode);

    expect(attributes.sectionMargins).toEqual({
      header: 0.5,
      footer: 1.5,
    });
  });
});
