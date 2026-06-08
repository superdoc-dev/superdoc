import { describe, expect, it, vi } from 'vitest';
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
            attributes: {
              verticalAlign: 'center',
              lIns: 9.6,
              tIns: 4.8,
              rIns: 9.6,
              bIns: 4.8,
            },
          },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
          ],
        },
      ],
    });
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
