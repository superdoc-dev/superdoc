import { describe, expect, it } from 'vitest';
import { findPageOneSectPr, mergeStylesAuthoritative, reconcileSettings, type XmlElement } from './template-xml.js';

function makeDocument(bodyElements: XmlElement[]): XmlElement {
  return {
    elements: [
      {
        type: 'element',
        name: 'w:document',
        elements: [
          {
            type: 'element',
            name: 'w:body',
            elements: bodyElements,
          },
        ],
      },
    ],
  };
}

function makeSectPr(marker: string): XmlElement {
  return {
    type: 'element',
    name: 'w:sectPr',
    attributes: { 'data-marker': marker },
  };
}

function makeParagraph(sectPr?: XmlElement): XmlElement {
  return {
    type: 'element',
    name: 'w:p',
    elements: sectPr
      ? [
          {
            type: 'element',
            name: 'w:pPr',
            elements: [sectPr],
          },
        ]
      : [],
  };
}

describe('findPageOneSectPr', () => {
  it('returns the first paragraph-attached section break when the source has multiple sections', () => {
    const firstSection = makeSectPr('first-section');
    const finalBodySection = makeSectPr('final-body');
    const root = makeDocument([makeParagraph(firstSection), makeParagraph(), finalBodySection]);

    expect(findPageOneSectPr(root)).toBe(firstSection);
  });

  it('falls back to the body-level sectPr when the source has only one section', () => {
    const finalBodySection = makeSectPr('final-body');
    const root = makeDocument([makeParagraph(), finalBodySection]);

    expect(findPageOneSectPr(root)).toBe(finalBodySection);
  });
});

describe('mergeStylesAuthoritative', () => {
  it('merges source namespace declarations needed by imported style nodes', () => {
    const currentRoot: XmlElement = {
      elements: [
        {
          type: 'element',
          name: 'w:styles',
          attributes: {
            'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          },
          elements: [],
        },
      ],
    };
    const sourceRoot: XmlElement = {
      elements: [
        {
          type: 'element',
          name: 'w:styles',
          attributes: {
            'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'xmlns:w16cid': 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
            'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
            'mc:Ignorable': 'w16cid',
          },
          elements: [
            {
              type: 'element',
              name: 'w:style',
              attributes: {
                'w:styleId': 'TemplateOnly',
                'w16cid:val': '123',
              },
            },
          ],
        },
      ],
    };

    mergeStylesAuthoritative(currentRoot, sourceRoot);

    const stylesRoot = currentRoot.elements?.[0];
    expect(stylesRoot?.attributes).toMatchObject({
      'xmlns:w16cid': 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
      'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
      'mc:Ignorable': 'w16cid',
    });
  });
});

describe('reconcileSettings', () => {
  it('merges source namespace declarations needed by adopted settings nodes', () => {
    const currentRoot: XmlElement = {
      elements: [
        {
          type: 'element',
          name: 'w:settings',
          attributes: {
            'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          },
          elements: [],
        },
      ],
    };
    const sourceRoot: XmlElement = {
      elements: [
        {
          type: 'element',
          name: 'w:settings',
          attributes: {
            'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'xmlns:w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
            'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
            'mc:Ignorable': 'w14',
          },
          elements: [
            {
              type: 'element',
              name: 'w:defaultTabStop',
              attributes: {
                'w:val': '720',
                'w14:dummy': '1',
              },
            },
          ],
        },
      ],
    };

    const result = reconcileSettings(currentRoot, sourceRoot);

    expect(result.changed).toBe(true);
    const settingsRoot = currentRoot.elements?.[0];
    expect(settingsRoot?.attributes).toMatchObject({
      'xmlns:w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
      'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
      'mc:Ignorable': 'w14',
    });
  });
});
