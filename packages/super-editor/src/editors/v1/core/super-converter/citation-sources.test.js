import { describe, expect, it } from 'vitest';
import {
  loadBibliographyPartFromPackage,
  resolveBibliographyStyleMetadata,
  syncBibliographyPartToPackage,
} from './citation-sources.js';

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
  it.each([
    ['APA', '/APASixthEditionOfficeOnline.xsl', 'APA', '6'],
    ['Chicago', '/CHICAGO.XSL', 'Chicago', '16'],
    ['GB7714', '/GB.XSL', 'GB7714', '2005'],
    ['GOST - Name Sort', '/GostName.XSL', 'GOST - Name Sort', '2003'],
    ['GOST - Title Sort', '/GostTitle.XSL', 'GOST - Title Sort', '2003'],
    ['Harvard - Anglia', '/HarvardAnglia2008OfficeOnline.xsl', 'Harvard - Anglia', '2008'],
    ['IEEE', '/IEEE2006OfficeOnline.xsl', 'IEEE', '2006'],
    ['ISO 690 - First Element and Date', '/ISO690.XSL', 'ISO 690 - First Element and Date', '1987'],
    ['ISO 690 - Numerical Reference', '/ISO690Nmerical.XSL', 'ISO 690 - Numerical Reference', '1987'],
    ['MLA', '/MLASeventhEditionOfficeOnline.xsl', 'MLA', '7'],
    ['SIST02', '/SIST02.XSL', 'SIST02', '2003'],
    ['Turabian', '/TURABIAN.XSL', 'Turabian', '6'],
  ])('resolves Word bibliography style metadata for %s', (input, selectedStyle, styleName, version) => {
    expect(resolveBibliographyStyleMetadata(input)).toEqual({ selectedStyle, styleName, version });
  });

  it('resolves Word bibliography style metadata from a SelectedStyle path', () => {
    expect(resolveBibliographyStyleMetadata('/CHICAGO.XSL')).toEqual({
      selectedStyle: '/CHICAGO.XSL',
      styleName: 'Chicago',
      version: '16',
    });
  });

  it('normalizes known style metadata when writing the bibliography part', () => {
    const convertedXml = makeConvertedXmlWithBibliographySource();
    const bibliographyPart = loadBibliographyPartFromPackage(convertedXml);
    bibliographyPart.styleName = 'APA';
    bibliographyPart.selectedStyle = '/APA.XSL';

    syncBibliographyPartToPackage(convertedXml, bibliographyPart);

    const attributes = convertedXml['customXml/item1.xml'].elements[0].attributes;
    expect(attributes.SelectedStyle).toBe('/APASixthEditionOfficeOnline.xsl');
    expect(attributes.StyleName).toBe('APA');
    expect(attributes.Version).toBe('6');
  });

  it('preserves an imported Word-authored selected style when exporting', () => {
    const convertedXml = makeConvertedXmlWithBibliographySource();
    const bibliographyPart = loadBibliographyPartFromPackage(convertedXml);
    bibliographyPart.styleName = 'APA';
    bibliographyPart.selectedStyle = '/APASeventhEditionOfficeOnline.xsl';
    bibliographyPart.version = '7';

    syncBibliographyPartToPackage(convertedXml, bibliographyPart);

    const attributes = convertedXml['customXml/item1.xml'].elements[0].attributes;
    expect(attributes.SelectedStyle).toBe('/APASeventhEditionOfficeOnline.xsl');
    expect(attributes.StyleName).toBe('APA');
    expect(attributes.Version).toBe('7');
  });

  it('lets an explicit known style override imported fallback metadata', () => {
    expect(
      resolveBibliographyStyleMetadata('Chicago', {
        styleName: 'APA',
        selectedStyle: '/APASeventhEditionOfficeOnline.xsl',
        version: '7',
      }),
    ).toEqual({
      selectedStyle: '/CHICAGO.XSL',
      styleName: 'Chicago',
      version: '16',
    });
  });

  it('lets an explicit known style override a known selected-style fallback', () => {
    expect(
      resolveBibliographyStyleMetadata('Chicago', {
        styleName: 'APA',
        selectedStyle: '/APASixthEditionOfficeOnline.xsl',
        version: '6',
      }),
    ).toEqual({
      selectedStyle: '/CHICAGO.XSL',
      styleName: 'Chicago',
      version: '16',
    });
  });

  it('lets an explicit custom style override imported fallback metadata', () => {
    expect(
      resolveBibliographyStyleMetadata('Vancouver', {
        styleName: 'APA',
        selectedStyle: '/APASixthEditionOfficeOnline.xsl',
        version: '6',
      }),
    ).toEqual({
      selectedStyle: '/Vancouver.XSL',
      styleName: 'Vancouver',
      version: '6',
    });
  });

  it('preserves Word source Guid and RefOrder tags on export sync', () => {
    const convertedXml = makeConvertedXmlWithBibliographySource();
    const bibliographyPart = loadBibliographyPartFromPackage(convertedXml);

    syncBibliographyPartToPackage(convertedXml, bibliographyPart);

    expect(sourceChildText(convertedXml, 'b:Guid')).toBe('{B7734FB8-1DB7-44BA-A42C-04F2C533D25A}');
    expect(sourceChildText(convertedXml, 'b:RefOrder')).toBe('1');
  });
});
