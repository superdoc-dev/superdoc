import { describe, expect, it } from 'vitest';
import { patchNumberingDefinitions } from './patchNumberingDefinitions.js';

const makeNumberingXml = (elements) => ({
  elements: [
    {
      name: 'w:numbering',
      attributes: {
        'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      },
      elements,
    },
  ],
});

const abstractNum = (id) => ({
  type: 'element',
  name: 'w:abstractNum',
  attributes: { 'w:abstractNumId': String(id) },
  elements: [
    {
      type: 'element',
      name: 'w:lvl',
      attributes: { 'w:ilvl': '0' },
      elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'decimal' } }],
    },
  ],
});

const num = ({ numId, abstractId }) => ({
  type: 'element',
  name: 'w:num',
  attributes: { 'w:numId': String(numId) },
  elements: [
    {
      type: 'element',
      name: 'w:abstractNumId',
      attributes: { 'w:val': String(abstractId) },
    },
  ],
});

describe('patchNumberingDefinitions', () => {
  it('creates a missing abstractNum using the base ordered list definition', () => {
    const docx = {
      'word/numbering.xml': makeNumberingXml([
        abstractNum(41),
        { type: 'comment', comment: 'broken reference follows' },
        num({ numId: 1, abstractId: 42 }),
      ]),
    };

    patchNumberingDefinitions(docx);

    const numberingRoot = docx['word/numbering.xml'].elements[0];
    const numberingElements = numberingRoot.elements;

    const patchedAbstract = numberingElements.find(
      (el) => el?.name === 'w:abstractNum' && String(el.attributes?.['w:abstractNumId']) === '42',
    );

    expect(patchedAbstract).toBeTruthy();
    expect(patchedAbstract.elements?.some((el) => el?.name === 'w:lvl')).toBe(true);
    expect(numberingRoot.attributes?.['xmlns:w15']).toBe('http://schemas.microsoft.com/office/word/2012/wordml');

    const firstNumIndex = numberingElements.findIndex((el) => el?.name === 'w:num');
    const patchedAbstractIndex = numberingElements.findIndex(
      (el) => el?.name === 'w:abstractNum' && String(el.attributes?.['w:abstractNumId']) === '42',
    );
    expect(patchedAbstractIndex).toBeGreaterThan(-1);
    expect(firstNumIndex).toBeGreaterThan(patchedAbstractIndex);
  });

  it('does not change the numbering xml when all abstract references exist', () => {
    const docx = {
      'word/numbering.xml': makeNumberingXml([
        abstractNum(41),
        abstractNum(42),
        num({ numId: 1, abstractId: 41 }),
        num({ numId: 2, abstractId: 42 }),
      ]),
    };

    const before = JSON.parse(JSON.stringify(docx));

    patchNumberingDefinitions(docx);

    expect(docx).toEqual(before);
  });

  it('creates multiple missing abstractNum definitions', () => {
    const docx = {
      'word/numbering.xml': makeNumberingXml([
        abstractNum(41),
        num({ numId: 1, abstractId: 43 }),
        num({ numId: 2, abstractId: 42 }),
        num({ numId: 3, abstractId: 44 }),
      ]),
    };

    patchNumberingDefinitions(docx);

    const numberingRoot = docx['word/numbering.xml'].elements[0];
    const numberingElements = numberingRoot.elements;

    const missingIds = ['42', '43', '44'];
    for (const id of missingIds) {
      const patchedAbstract = numberingElements.find(
        (el) => el?.name === 'w:abstractNum' && String(el.attributes?.['w:abstractNumId']) === id,
      );
      expect(patchedAbstract).toBeTruthy();
    }

    const firstNumIndex = numberingElements.findIndex((el) => el?.name === 'w:num');
    for (const id of missingIds) {
      const patchedAbstractIndex = numberingElements.findIndex(
        (el) => el?.name === 'w:abstractNum' && String(el.attributes?.['w:abstractNumId']) === id,
      );
      expect(patchedAbstractIndex).toBeGreaterThan(-1);
      expect(firstNumIndex).toBeGreaterThan(patchedAbstractIndex);
    }
  });
});
