import { describe, expect, it, vi } from 'vitest';
import { defaultNodeListHandler } from '@converter/v2/importer/docxImporter.js';
import { importDrawingMLTextbox } from './import-drawingml-textbox.js';

vi.mock('./textbox-content-helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    preProcessTextBoxContent: vi.fn((content) => content),
  };
});

describe('importDrawingMLTextbox', () => {
  it('returns null when textBoxContent is missing', () => {
    const result = importDrawingMLTextbox({
      params: {},
      drawingNode: null,
      textBoxContent: null,
    });

    expect(result).toBeNull();
  });

  it('builds shapeContainer with shapeTextbox content and bodyPr-derived attrs', () => {
    const drawingNode = { name: 'w:drawing', elements: [{ name: 'wp:anchor', elements: [] }] };
    const textBoxContent = {
      name: 'w:txbxContent',
      elements: [
        { name: 'w:p', elements: [] },
        { name: 'w:p', elements: [] },
      ],
    };
    const paragraphImporter = vi
      .fn()
      .mockReturnValueOnce({ type: 'paragraph', content: [{ type: 'text', text: 'First' }] })
      .mockReturnValueOnce({ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] });

    const result = importDrawingMLTextbox({
      params: { docx: {}, filename: 'document.xml' },
      drawingNode,
      textBoxContent,
      bodyPr: {
        attributes: {
          anchor: 'ctr',
          lIns: '91440',
          tIns: '45720',
          rIns: '91440',
          bIns: '45720',
        },
      },
      baseAttrs: {
        width: 100,
        height: 50,
      },
      paragraphImporter,
    });

    expect(result).toEqual({
      type: 'shapeContainer',
      attrs: {
        width: 100,
        height: 50,
        drawingContent: drawingNode,
      },
      content: [
        {
          type: 'shapeTextbox',
          attrs: {
            textInsets: { top: 4.8, right: 9.6, bottom: 4.8, left: 9.6 },
            textVerticalAlign: 'center',
            attributes: {},
          },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
          ],
        },
      ],
    });
  });

  it('strips marks from run nodes but preserves marks on text nodes inside', () => {
    const textWithMark = { type: 'text', text: 'Hello', marks: [{ type: 'textStyle', attrs: { fontSize: '10pt' } }] };
    const runWithMarks = {
      type: 'run',
      attrs: { runProperties: { styleId: 'PageNumber' } },
      marks: [{ type: 'textStyle', attrs: { fontSize: '10pt' } }],
      content: [textWithMark],
    };
    const paragraphImporter = vi.fn().mockReturnValue({
      type: 'paragraph',
      attrs: {},
      content: [runWithMarks],
      marks: [],
    });

    const result = importDrawingMLTextbox({
      params: {},
      drawingNode: null,
      textBoxContent: { name: 'w:txbxContent', elements: [{ name: 'w:p', elements: [] }] },
      paragraphImporter,
    });

    const run = result?.content?.[0]?.content?.[0]?.content?.[0];
    expect(run?.type).toBe('run');
    expect(run?.marks).toEqual([]);

    const text = run?.content?.[0];
    expect(text?.type).toBe('text');
    expect(text?.marks).toEqual([{ type: 'textStyle', attrs: { fontSize: '10pt' } }]);
  });

  it('imports table content from txbxContent into shapeTextbox', () => {
    const textBoxContent = {
      name: 'w:txbxContent',
      elements: [
        {
          name: 'w:tbl',
          elements: [
            { name: 'w:tblPr', elements: [{ name: 'w:tblW', attributes: { 'w:w': '5000', 'w:type': 'dxa' } }] },
            { name: 'w:tblGrid', elements: [{ name: 'w:gridCol', attributes: { 'w:w': '5000' } }] },
            {
              name: 'w:tr',
              elements: [
                {
                  name: 'w:tc',
                  elements: [
                    { name: 'w:tcPr', elements: [{ name: 'w:tcW', attributes: { 'w:w': '5000', 'w:type': 'dxa' } }] },
                    {
                      name: 'w:p',
                      elements: [
                        {
                          name: 'w:r',
                          elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Test Name' }] }],
                        },
                      ],
                    },
                    {
                      name: 'w:p',
                      elements: [
                        {
                          name: 'w:r',
                          elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Utrecht' }] }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = importDrawingMLTextbox({
      params: { docx: {}, filename: 'header1.xml', nodeListHandler: defaultNodeListHandler() },
      drawingNode: { name: 'w:drawing' },
      textBoxContent,
      baseAttrs: { width: 100, height: 50 },
    });

    const serialized = JSON.stringify(result?.content?.[0]?.content ?? []);
    expect(serialized).toContain('Test Name');
    expect(serialized).toContain('Utrecht');
  });

  it('stores drawingNode in shapeContainer attrs', () => {
    const drawingNode = { name: 'w:drawing', elements: [] };
    const textBoxContent = {
      name: 'w:txbxContent',
      elements: [{ name: 'w:p', elements: [] }],
    };

    const result = importDrawingMLTextbox({
      params: {},
      drawingNode,
      textBoxContent,
      paragraphImporter: () => [],
    });

    expect(result?.attrs?.drawingContent).toBe(drawingNode);
  });
});
