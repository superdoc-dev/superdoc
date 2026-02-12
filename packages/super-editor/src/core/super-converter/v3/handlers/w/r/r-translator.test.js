import { describe, it, expect, vi } from 'vitest';
import { translator, config } from './r-translator.js';
import * as converterStyles from '../../../../styles.js';

describe('w:r r-translator (node)', () => {
  it('exposes correct metadata', () => {
    expect(config.xmlName).toBe('w:r');
    expect(config.sdNodeOrKeyName).toBe('run');
  });

  it('offers attribute translators for all valid w:r attributes', () => {
    const xmlNames = config.attributes.map((attr) => attr.xmlName);
    expect(xmlNames).toEqual(['w:rsidR', 'w:rsidRPr', 'w:rsidDel']);
  });

  it('encodes a run node wrapping translated children', () => {
    const fakeChild = { type: 'text', text: 'Hello', marks: [] };
    const runNode = { name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Hello' }] }] };

    const params = {
      nodes: [runNode],
      nodeListHandler: { handler: vi.fn(() => [fakeChild]) },
      docx: {},
    };
    const out = translator.encode(params);

    expect(out?.type).toBe('run');
    expect(Array.isArray(out.content)).toBe(true);
    expect(out.content[0]).toMatchObject({ type: 'text', text: 'Hello' });
  });

  it('converts w:b run property into a bold mark', () => {
    const boldRun = {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: [{ name: 'w:b', attributes: {} }] },
        { name: 'w:t', elements: [{ type: 'text', text: 'Bold' }] },
      ],
    };

    const params = {
      nodes: [boldRun],
      nodeListHandler: {
        handler: vi.fn(({ nodes }) =>
          nodes
            .map((node) => {
              if (node.name === 'w:t') return { type: 'text', text: node.elements?.[0]?.text ?? '', marks: [] };
              if (node.name === 'w:b') return { type: 'attr', xmlName: 'w:b', attributes: {} };
              return null;
            })
            .filter(Boolean),
        ),
      },
      docx: {},
    };

    const node = translator.encode(params);
    expect(node.type).toBe('run');
    const child = node.content[0];
    expect(child.marks?.some((mark) => mark.type === 'bold')).toBe(true);
  });

  it('collects font and size info into a textStyle mark', () => {
    const styledRun = {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: [
            { name: 'w:rFonts', attributes: { 'w:ascii': 'Arial' } },
            { name: 'w:sz', attributes: { 'w:val': '32' } },
          ],
        },
        { name: 'w:t', elements: [{ type: 'text', text: 'Styled' }] },
      ],
    };

    const params = {
      nodes: [styledRun],
      nodeListHandler: {
        handler: vi.fn(({ nodes }) =>
          nodes
            .map((node) => {
              if (node.name === 'w:t') return { type: 'text', text: node.elements?.[0]?.text ?? '', marks: [] };
              return null;
            })
            .filter(Boolean),
        ),
      },
      docx: {},
    };

    const node = translator.encode(params);
    const textNode = node.content[0];
    const textStyleMark = textNode.marks?.find((mark) => mark.type === 'textStyle');
    expect(textStyleMark).toBeDefined();
    expect(textStyleMark.attrs).toMatchObject({ fontFamily: 'Arial, sans-serif', fontSize: '16pt' });
  });

  it('returns a run node containing multiple items such as tabs', () => {
    const run = {
      name: 'w:r',
      elements: [
        { name: 'w:t', elements: [{ text: 'Left', type: 'text' }] },
        { name: 'w:tab' },
        { name: 'w:t', elements: [{ text: 'Right', type: 'text' }] },
      ],
    };

    const params = {
      nodes: [run],
      nodeListHandler: {
        handler: vi.fn(() => [
          { type: 'text', text: 'Left', marks: [] },
          { type: 'tab', attrs: { val: 'start' } },
          { type: 'text', text: 'Right', marks: [] },
        ]),
      },
      docx: {},
    };

    const result = translator.encode(params);

    expect(result.type).toBe('run');
    expect(result.content).toHaveLength(3);
    expect(result.content[0].type).toBe('text');
    expect(result.content[1]).toMatchObject({ type: 'tab', attrs: { val: 'start' } });
    expect(result.content[2].type).toBe('text');
  });

  it('strips marks from passthroughInline child nodes', () => {
    const passthroughChild = {
      type: 'passthroughInline',
      attrs: { originalName: 'w:custom' },
      marks: [{ type: 'bold' }, { type: 'italic' }],
    };
    const runNode = {
      name: 'w:r',
      elements: [{ name: 'w:rPr', elements: [{ name: 'w:b', attributes: {} }] }],
    };

    const params = {
      nodes: [runNode],
      nodeListHandler: { handler: vi.fn(() => [passthroughChild]) },
      docx: {},
    };

    const result = translator.encode(params);

    expect(result.type).toBe('run');
    const child = result.content[0];
    expect(child.type).toBe('passthroughInline');
    expect(child.marks).toEqual([]);
    expect(child.attrs).toEqual({ originalName: 'w:custom' });
  });

  it('passes tableInfo and numberingDefinedInline to resolveRunProperties when table context is available', () => {
    const resolveRunPropertiesSpy = vi
      .spyOn(converterStyles, 'resolveRunProperties')
      .mockImplementation(() => ({ bold: true }));
    const runNode = {
      name: 'w:r',
      elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Cell' }] }],
    };

    const params = {
      nodes: [runNode],
      nodeListHandler: { handler: vi.fn(() => [{ type: 'text', text: 'Cell', marks: [] }]) },
      docx: {},
      extraParams: {
        paragraphProperties: { styleId: 'ListParagraph' },
        rowIndex: 2,
        columnIndex: 1,
        tableProperties: { tableStyleId: 'TableGrid' },
        totalColumns: 3,
        totalRows: 4,
        numberingDefinedInline: true,
      },
    };

    translator.encode(params);

    expect(resolveRunPropertiesSpy).toHaveBeenCalledTimes(1);
    expect(resolveRunPropertiesSpy).toHaveBeenCalledWith(
      params,
      {},
      { styleId: 'ListParagraph' },
      {
        rowIndex: 2,
        cellIndex: 1,
        tableProperties: { tableStyleId: 'TableGrid' },
        numCells: 3,
        numRows: 4,
      },
      false,
      true,
    );

    resolveRunPropertiesSpy.mockRestore();
  });

  it('passes null tableInfo to resolveRunProperties when table context is incomplete', () => {
    const resolveRunPropertiesSpy = vi.spyOn(converterStyles, 'resolveRunProperties').mockImplementation(() => ({}));
    const runNode = {
      name: 'w:r',
      elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'No table context' }] }],
    };

    const params = {
      nodes: [runNode],
      nodeListHandler: { handler: vi.fn(() => [{ type: 'text', text: 'No table context', marks: [] }]) },
      docx: {},
      extraParams: {
        paragraphProperties: { styleId: 'Normal' },
        rowIndex: 0,
        columnIndex: 0,
        tableProperties: { tableStyleId: 'TableGrid' },
        totalColumns: 2,
        // totalRows missing on purpose
      },
    };

    translator.encode(params);

    expect(resolveRunPropertiesSpy).toHaveBeenCalledTimes(1);
    expect(resolveRunPropertiesSpy.mock.calls[0][3]).toBeNull();
    expect(resolveRunPropertiesSpy.mock.calls[0][5]).toBeUndefined();

    resolveRunPropertiesSpy.mockRestore();
  });

  it('does not wrap a comment range start and end in a run node', () => {
    const params = {
      node: {
        type: 'run',
        attrs: {
          runProperties: [
            {
              xmlName: 'w:rtl',
              attributes: {
                'w:val': '0',
              },
            },
          ],
          rsidR: '00000000',
          rsidRPr: '00000000',
          rsidDel: '00000000',
        },
        content: [
          {
            type: 'commentRangeStart',
            attrs: {
              'w:id': 'id1',
              internal: false,
            },
          },
          {
            type: 'commentRangeEnd',
            attrs: {
              'w:id': 'id1',
            },
          },
        ],
      },
      comments: [{ commentId: 'id1' }],
      exportedCommentDefs: [{}],
      commentsExportType: 'external',
    };

    const result = translator.decode(params);

    const commentRangeStart = result.find((el) => el.name === 'w:commentRangeStart');
    const commentRangeEnd = result.find((el) => el.name === 'w:commentRangeEnd');

    expect(commentRangeStart).toBeDefined();
    expect(commentRangeEnd).toBeDefined();

    expect(commentRangeStart).toEqual(
      expect.objectContaining({
        name: 'w:commentRangeStart',
        attributes: {
          'w:id': '0',
          'w:rsidDel': '00000000',
          'w:rsidR': '00000000',
          'w:rsidRPr': '00000000',
        },
      }),
    );
    expect(commentRangeEnd).toEqual(
      expect.objectContaining({
        name: 'w:commentRangeEnd',
        attributes: {
          'w:id': '0',
          'w:rsidDel': '00000000',
          'w:rsidR': '00000000',
          'w:rsidRPr': '00000000',
        },
      }),
    );
  });
});
