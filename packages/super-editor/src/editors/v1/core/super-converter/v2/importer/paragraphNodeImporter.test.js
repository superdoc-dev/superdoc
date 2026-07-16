import { describe, expect, it } from 'vitest';
import { defaultNodeListHandler } from './docxImporter.js';
import { exportSchemaToJson } from '../../exporter.js';

const textRun = (text) => ({
  name: 'w:r',
  elements: [{ name: 'w:t', elements: [{ type: 'text', text }] }],
});

const paragraphProperties = (styleId) => ({
  name: 'w:pPr',
  elements: [
    { name: 'w:pStyle', attributes: { 'w:val': styleId } },
    {
      name: 'w:tabs',
      elements: [{ name: 'w:tab', attributes: { 'w:val': 'right', 'w:pos': '8640', 'w:leader': 'dot' } }],
    },
    { name: 'w:spacing', attributes: { 'w:before': '120', 'w:after': '240' } },
    { name: 'w:ind', attributes: { 'w:left': '360', 'w:hanging': '180' } },
    {
      name: 'w:sectPr',
      elements: [{ name: 'w:pgSz', attributes: { 'w:w': '15840', 'w:h': '12240', 'w:orient': 'landscape' } }],
    },
  ],
});

const bibliographyField = (elements) => ({
  name: 'sd:bibliography',
  attributes: { instruction: 'BIBLIOGRAPHY' },
  elements,
});

const importNodes = (nodes) =>
  defaultNodeListHandler().handler({
    nodes,
    docx: {},
  });

describe('paragraphNodeImporter block field hoisting', () => {
  it('transfers wrapper paragraph properties to a single-paragraph generated reference field result', () => {
    const result = importNodes([
      {
        name: 'w:p',
        elements: [
          paragraphProperties('Bibliography'),
          bibliographyField([
            {
              name: 'w:p',
              elements: [textRun('Generated bibliography result')],
            },
          ]),
        ],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('bibliography');

    const paragraph = result[0].content[0];
    const pPr = paragraph.attrs.paragraphProperties;
    const wrapperPPr = result[0].attrs.wrapperParagraphProperties;
    expect(pPr.styleId).toBe('Bibliography');
    expect(pPr.tabStops).toEqual([{ tab: { tabType: 'right', pos: 8640, leader: 'dot' } }]);
    expect(pPr.spacing).toEqual({ before: 120, after: 240 });
    expect(pPr.indent).toEqual({ left: 360, hanging: 180 });
    expect(pPr.sectPr).toBeUndefined();
    expect(paragraph.attrs.pageBreakSource).toBeUndefined();
    expect(wrapperPPr.elements.find((element) => element.name === 'w:sectPr')).toMatchObject({
      name: 'w:sectPr',
      elements: [{ name: 'w:pgSz', attributes: { 'w:w': '15840', 'w:h': '12240', 'w:orient': 'landscape' } }],
    });

    const exported = exportSchemaToJson({ node: result[0] });
    const exportedPPr = exported[0].elements[0];
    expect(exportedPPr).toMatchObject({
      name: 'w:pPr',
      elements: [
        { name: 'w:pStyle', attributes: { 'w:val': 'Bibliography' } },
        {
          name: 'w:tabs',
          elements: [{ name: 'w:tab', attributes: { 'w:val': 'right', 'w:pos': '8640', 'w:leader': 'dot' } }],
        },
        { name: 'w:spacing', attributes: { 'w:before': '120', 'w:after': '240' } },
        { name: 'w:ind', attributes: { 'w:left': '360', 'w:hanging': '180' } },
        {
          name: 'w:sectPr',
          elements: [{ name: 'w:pgSz', attributes: { 'w:w': '15840', 'w:h': '12240', 'w:orient': 'landscape' } }],
        },
      ],
    });
  });

  it('does not overwrite existing generated result paragraph properties', () => {
    const result = importNodes([
      {
        name: 'w:p',
        elements: [
          paragraphProperties('WrapperStyle'),
          bibliographyField([
            {
              name: 'w:p',
              elements: [paragraphProperties('InnerResultStyle'), textRun('Generated bibliography result')],
            },
          ]),
        ],
      },
    ]);

    const paragraph = result[0].content[0];
    expect(paragraph.attrs.paragraphProperties.styleId).toBe('InnerResultStyle');
    expect(result[0].attrs.wrapperParagraphProperties).toBeNull();
  });

  it('keeps wrapper paragraph properties on ordinary paragraph content instead of duplicating them onto the field', () => {
    const result = importNodes([
      {
        name: 'w:p',
        elements: [
          paragraphProperties('WrapperStyle'),
          textRun('Leading text'),
          bibliographyField([
            {
              name: 'w:p',
              elements: [textRun('Generated bibliography result')],
            },
          ]),
        ],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('paragraph');
    expect(result[0].attrs.paragraphProperties.styleId).toBe('WrapperStyle');
    expect(result[1].type).toBe('bibliography');
    expect(result[1].content[0].attrs.paragraphProperties.styleId).toBeUndefined();
  });
});
