// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { twipsToPixels } from '@core/super-converter/helpers.js';

import { translator as tblTranslator } from './tbl-translator.js';
import { translator as tblPrTranslator } from '../tblPr/tblPr-translator.js';

const minimalDocx = {
  'word/styles.xml': {
    elements: [
      {
        name: 'w:styles',
        elements: [],
      },
    ],
  },
};

const minimalNodeListHandler = {
  handler: vi.fn(() => []),
};

describe('w:tbl translator integration', () => {
  it('handles vertically merged cells without throwing', () => {
    const tableNode = {
      name: 'w:tbl',
      elements: [
        { name: 'w:tblPr', elements: [] },
        {
          name: 'w:tr',
          elements: [
            {
              name: 'w:tc',
              elements: [
                {
                  name: 'w:tcPr',
                  elements: [{ name: 'w:vMerge', attributes: { 'w:val': 'restart' } }],
                },
              ],
            },
          ],
        },
        {
          name: 'w:tr',
          elements: [
            {
              name: 'w:tc',
              elements: [
                {
                  name: 'w:tcPr',
                  elements: [{ name: 'w:vMerge', attributes: { 'w:val': 'continue' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    const params = {
      nodes: [tableNode],
      docx: minimalDocx,
      nodeListHandler: minimalNodeListHandler,
    };

    expect(() => tblTranslator.encode(params, {})).not.toThrow();
  });

  it('handles tables without a tblPr element', () => {
    const tableNode = {
      name: 'w:tbl',
      elements: [
        {
          name: 'w:tr',
          elements: [
            {
              name: 'w:tc',
              elements: [
                {
                  name: 'w:tcPr',
                  elements: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const params = {
      nodes: [tableNode],
      docx: minimalDocx,
      nodeListHandler: minimalNodeListHandler,
    };

    expect(() => tblTranslator.encode(params, {})).not.toThrow();
  });

  it('aligns vertically merged cells when gridBefore placeholders are present', () => {
    const tableNode = {
      name: 'w:tbl',
      elements: [
        { name: 'w:tblPr', elements: [] },
        {
          name: 'w:tblGrid',
          elements: [
            { name: 'w:gridCol', attributes: { 'w:w': '1000' } },
            { name: 'w:gridCol', attributes: { 'w:w': '2000' } },
            { name: 'w:gridCol', attributes: { 'w:w': '3000' } },
          ],
        },
        {
          name: 'w:tr',
          elements: [
            {
              name: 'w:trPr',
              elements: [{ name: 'w:gridBefore', attributes: { 'w:val': '1' } }],
            },
            {
              name: 'w:tc',
              elements: [
                {
                  name: 'w:tcPr',
                  elements: [{ name: 'w:vMerge', attributes: { 'w:val': 'restart' } }],
                },
                { name: 'w:p', elements: [] },
              ],
            },
            {
              name: 'w:tc',
              elements: [
                { name: 'w:tcPr', elements: [] },
                { name: 'w:p', elements: [] },
              ],
            },
          ],
        },
        {
          name: 'w:tr',
          elements: [
            {
              name: 'w:trPr',
              elements: [{ name: 'w:gridBefore', attributes: { 'w:val': '1' } }],
            },
            {
              name: 'w:tc',
              elements: [
                {
                  name: 'w:tcPr',
                  elements: [{ name: 'w:vMerge', attributes: { 'w:val': 'continue' } }],
                },
                { name: 'w:p', elements: [] },
              ],
            },
            {
              name: 'w:tc',
              elements: [
                { name: 'w:tcPr', elements: [] },
                { name: 'w:p', elements: [] },
              ],
            },
          ],
        },
      ],
    };

    const params = {
      nodes: [tableNode],
      docx: minimalDocx,
      nodeListHandler: minimalNodeListHandler,
    };

    const result = tblTranslator.encode(params, {});
    expect(result.content).toHaveLength(2);

    const [firstRow, secondRow] = result.content;

    expect(firstRow.content).toHaveLength(3);
    expect(firstRow.content[0].attrs?.__placeholder).toBe('gridBefore');
    const mergedCell = firstRow.content[1];
    expect(mergedCell.attrs?.rowspan).toBe(2);
    expect(mergedCell.attrs?.colwidth?.[0]).toBeCloseTo(twipsToPixels(2000), 3);

    expect(secondRow.content).toHaveLength(2);
    expect(secondRow.content[0].attrs?.__placeholder).toBe('gridBefore');
    const secondRowDataCell = secondRow.content[1];
    expect(secondRowDataCell.attrs?.colwidth?.[0]).toBeCloseTo(twipsToPixels(3000), 3);
  });

  it('preserves table style cell margins on decode', () => {
    const tableNode = {
      type: 'table',
      attrs: {
        tableProperties: {
          tableStyleId: 'TableNormal',
        },
        content: [],
      },
      content: [],
    };

    const result = tblPrTranslator.decode({
      node: {
        ...tableNode,
        attrs: {
          ...tableNode.attrs,
          tableProperties: {
            ...tableNode.attrs.tableProperties,
            cellMargins: {
              marginLeft: { value: 108, type: 'dxa' },
              marginRight: { value: 108, type: 'dxa' },
              marginTop: { value: 0, type: 'dxa' },
              marginBottom: { value: 0, type: 'dxa' },
            },
          },
        },
      },
    });

    const cellMarNode = result.elements.find((el) => el.name === 'w:tblCellMar');
    expect(cellMarNode).toBeDefined();
    expect(cellMarNode.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'w:left', attributes: { 'w:w': '108', 'w:type': 'dxa' } }),
        expect.objectContaining({ name: 'w:right', attributes: { 'w:w': '108', 'w:type': 'dxa' } }),
      ]),
    );
  });

  it('encodes table style cell margins from styles.xml', () => {
    const docxWithStyles = {
      'word/styles.xml': {
        elements: [
          {
            name: 'w:styles',
            elements: [
              {
                name: 'w:style',
                attributes: { 'w:styleId': 'TableNormal', 'w:type': 'table' },
                elements: [
                  {
                    name: 'w:tblPr',
                    elements: [
                      {
                        name: 'w:tblCellMar',
                        elements: [
                          { name: 'w:left', attributes: { 'w:w': '108', 'w:type': 'dxa' } },
                          { name: 'w:right', attributes: { 'w:w': '108', 'w:type': 'dxa' } },
                          { name: 'w:top', attributes: { 'w:w': '0', 'w:type': 'dxa' } },
                          { name: 'w:bottom', attributes: { 'w:w': '0', 'w:type': 'dxa' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const tableNode = {
      name: 'w:tbl',
      elements: [
        {
          name: 'w:tblPr',
          elements: [{ name: 'w:tblStyle', attributes: { 'w:val': 'TableNormal' } }],
        },
        {
          name: 'w:tblGrid',
          elements: [{ name: 'w:gridCol', attributes: { 'w:w': '1440' } }],
        },
        {
          name: 'w:tr',
          elements: [
            {
              name: 'w:tc',
              elements: [
                { name: 'w:tcPr', elements: [] },
                { name: 'w:p', elements: [] },
              ],
            },
          ],
        },
      ],
    };

    const params = {
      nodes: [tableNode],
      docx: docxWithStyles,
      nodeListHandler: minimalNodeListHandler,
    };

    const result = tblTranslator.encode(params, {});
    expect(result.attrs.tableProperties?.cellMargins).toEqual({
      marginLeft: { value: 108, type: 'dxa' },
      marginRight: { value: 108, type: 'dxa' },
      marginTop: { value: 0, type: 'dxa' },
      marginBottom: { value: 0, type: 'dxa' },
    });
  });
});
