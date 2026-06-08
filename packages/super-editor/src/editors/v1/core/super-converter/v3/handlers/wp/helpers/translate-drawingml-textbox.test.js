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
