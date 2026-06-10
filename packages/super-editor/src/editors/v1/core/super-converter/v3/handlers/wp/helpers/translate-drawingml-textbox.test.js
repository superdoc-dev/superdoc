import { describe, expect, it, vi } from 'vitest';
import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { translateDrawingMLTextbox } from './translate-drawingml-textbox.js';

vi.mock('@converter/v2/exporter/helpers/translateChildNodes');

describe('translateDrawingMLTextbox', () => {
  const findNodeByName = (node, name) => {
    if (!node || typeof node !== 'object') return null;
    if (node.name === name) return node;
    if (!Array.isArray(node.elements)) return null;

    for (const child of node.elements) {
      const found = findNodeByName(child, name);
      if (found) return found;
    }

    return null;
  };

  it('replaces stored w:txbxContent with translated live textbox paragraphs', () => {
    const liveParagraphs = [
      {
        name: 'w:p',
        elements: [{ name: 'w:r', elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Live' }] }] }],
      },
    ];
    translateChildNodes.mockReturnValue(liveParagraphs);

    const drawingContent = {
      name: 'w:drawing',
      elements: [
        {
          name: 'wp:anchor',
          elements: [
            {
              name: 'a:graphic',
              elements: [
                {
                  name: 'a:graphicData',
                  attributes: { uri: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape' },
                  elements: [
                    {
                      name: 'wps:wsp',
                      elements: [
                        { name: 'wps:spPr', elements: [] },
                        {
                          name: 'wps:txbx',
                          elements: [
                            {
                              name: 'w:txbxContent',
                              elements: [{ name: 'w:p', elements: [{ name: 'w:r' }] }],
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
        },
      ],
    };

    const result = translateDrawingMLTextbox({
      node: {
        type: 'shapeContainer',
        attrs: {
          drawingContent,
        },
        content: [
          {
            type: 'shapeTextbox',
            attrs: {},
            content: [{ type: 'paragraph', content: [] }],
          },
        ],
      },
    });

    expect(result?.name).toBe('w:r');
    const alternateContent = result?.elements?.[0];
    expect(alternateContent?.name).toBe('mc:AlternateContent');
    const drawing = alternateContent?.elements?.[0]?.elements?.[0];
    expect(drawing?.name).toBe('w:drawing');

    const txbxContent = findNodeByName(drawing, 'w:txbxContent');

    expect(txbxContent).toEqual({
      name: 'w:txbxContent',
      elements: liveParagraphs,
    });
  });

  it('patches wp:posOffset EMU values when marginOffset is present', () => {
    translateChildNodes.mockReturnValue([]);

    const drawingContent = {
      name: 'w:drawing',
      elements: [
        {
          name: 'wp:anchor',
          elements: [
            {
              name: 'wp:positionH',
              attributes: { relativeFrom: 'margin' },
              elements: [{ name: 'wp:posOffset', elements: [{ type: 'text', text: '457200' }] }],
            },
            {
              name: 'wp:positionV',
              attributes: { relativeFrom: 'margin' },
              elements: [{ name: 'wp:posOffset', elements: [{ type: 'text', text: '914400' }] }],
            },
            {
              name: 'a:graphic',
              elements: [
                {
                  name: 'a:graphicData',
                  elements: [
                    {
                      name: 'wps:wsp',
                      elements: [{ name: 'wps:txbx', elements: [{ name: 'w:txbxContent', elements: [] }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = translateDrawingMLTextbox({
      node: {
        type: 'shapeContainer',
        attrs: {
          drawingContent,
          marginOffset: { horizontal: 100, top: 200 },
        },
        content: [{ type: 'shapeTextbox', attrs: {}, content: [] }],
      },
    });

    // carbonCopy makes a deep copy — check the patched copy in the result, not the original.
    const resultDrawing = result?.elements?.[0]?.elements?.[0]?.elements?.[0];
    const posH = findNodeByName(resultDrawing, 'wp:positionH');
    const posV = findNodeByName(resultDrawing, 'wp:positionV');
    // 100px * 9525 = 952500, 200px * 9525 = 1905000
    expect(posH.elements[0].elements[0].text).toBe('952500');
    expect(posV.elements[0].elements[0].text).toBe('1905000');
  });

  it('returns null when drawingContent is missing', () => {
    const result = translateDrawingMLTextbox({
      node: {
        type: 'shapeContainer',
        attrs: {},
        content: [{ type: 'shapeTextbox', attrs: {}, content: [] }],
      },
    });

    expect(result).toBeNull();
  });

  it('returns null when shapeTextbox child is missing', () => {
    const result = translateDrawingMLTextbox({
      node: {
        type: 'shapeContainer',
        attrs: { drawingContent: { name: 'w:drawing', elements: [] } },
        content: [],
      },
    });

    expect(result).toBeNull();
  });
});
