import { describe, expect, it } from 'vitest';
import { loadBibliographyPartFromPackage, syncBibliographyPartToPackage } from './citation-sources.js';

const bibliographyNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography';
const customXmlRelationshipType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';

function textElement(name, text) {
  return {
    type: 'element',
    name,
    elements: [{ type: 'text', text }],
  };
}

function makeConvertedXmlWithBibliographySource() {
  return {
    'word/_rels/document.xml.rels': {
      elements: [
        {
          type: 'element',
          name: 'Relationships',
          elements: [
            {
              type: 'element',
              name: 'Relationship',
              attributes: {
                Id: 'rId1',
                Type: customXmlRelationshipType,
                Target: '../customXml/item1.xml',
              },
            },
          ],
        },
      ],
    },
    'customXml/item1.xml': {
      elements: [
        {
          type: 'element',
          name: 'b:Sources',
          attributes: {
            xmlns: bibliographyNamespace,
            'xmlns:b': bibliographyNamespace,
            SelectedStyle: '/APA.XSL',
            StyleName: 'APA',
            Version: '6',
          },
          elements: [
            {
              type: 'element',
              name: 'b:Source',
              elements: [
                textElement('b:Tag', 'Jam68'),
                textElement('b:SourceType', 'Book'),
                textElement('b:Guid', '{B7734FB8-1DB7-44BA-A42C-04F2C533D25A}'),
                textElement('b:RefOrder', '1'),
                textElement('b:Title', 'Pride and Prejudice'),
              ],
            },
          ],
        },
      ],
    },
  };
}

function sourceChildText(convertedXml, childName) {
  const source = convertedXml['customXml/item1.xml'].elements[0].elements[0];
  const child = source.elements.find((element) => element.name === childName);
  return child?.elements?.[0]?.text;
}

describe('citation bibliography source sync', () => {
  it('preserves Word source Guid and RefOrder tags on export sync', () => {
    const convertedXml = makeConvertedXmlWithBibliographySource();
    const bibliographyPart = loadBibliographyPartFromPackage(convertedXml);

    syncBibliographyPartToPackage(convertedXml, bibliographyPart);

    expect(sourceChildText(convertedXml, 'b:Guid')).toBe('{B7734FB8-1DB7-44BA-A42C-04F2C533D25A}');
    expect(sourceChildText(convertedXml, 'b:RefOrder')).toBe('1');
  });
});
