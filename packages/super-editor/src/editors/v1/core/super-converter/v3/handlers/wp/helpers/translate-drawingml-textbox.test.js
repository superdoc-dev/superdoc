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

  it('patches wp:extent and a:ext EMU values when width and height attrs are present', () => {
    translateChildNodes.mockReturnValue([]);

    const drawingContent = {
      name: 'w:drawing',
      elements: [
        {
          name: 'wp:anchor',
          elements: [
            { name: 'wp:extent', attributes: { cx: '457200', cy: '914400' } },
            {
              name: 'a:graphic',
              elements: [
                {
                  name: 'a:graphicData',
                  elements: [
                    {
                      name: 'wps:wsp',
                      elements: [
                        {
                          name: 'wps:spPr',
                          elements: [
                            {
                              name: 'a:xfrm',
                              elements: [{ name: 'a:ext', attributes: { cx: '457200', cy: '914400' } }],
                            },
                          ],
                        },
                        { name: 'wps:txbx', elements: [{ name: 'w:txbxContent', elements: [] }] },
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
        attrs: { drawingContent, width: 200, height: 100 },
        content: [{ type: 'shapeTextbox', attrs: {}, content: [] }],
      },
    });

    // 200px * 9525 = 1905000, 100px * 9525 = 952500
    const resultDrawing = result?.elements?.[0]?.elements?.[0]?.elements?.[0];
    const extent = findNodeByName(resultDrawing, 'wp:extent');
    const ext = findNodeByName(resultDrawing, 'a:ext');
    expect(extent.attributes.cx).toBe('1905000');
    expect(extent.attributes.cy).toBe('952500');
    expect(ext.attributes.cx).toBe('1905000');
    expect(ext.attributes.cy).toBe('952500');
  });

  it('patches only cx when only width is changed', () => {
    translateChildNodes.mockReturnValue([]);

    const drawingContent = {
      name: 'w:drawing',
      elements: [
        {
          name: 'wp:anchor',
          elements: [
            { name: 'wp:extent', attributes: { cx: '457200', cy: '914400' } },
            {
              name: 'a:graphic',
              elements: [
                {
                  name: 'a:graphicData',
                  elements: [
                    {
                      name: 'wps:wsp',
                      elements: [
                        {
                          name: 'wps:spPr',
                          elements: [
                            {
                              name: 'a:xfrm',
                              elements: [{ name: 'a:ext', attributes: { cx: '457200', cy: '914400' } }],
                            },
                          ],
                        },
                        { name: 'wps:txbx', elements: [{ name: 'w:txbxContent', elements: [] }] },
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
        attrs: { drawingContent, width: 300, height: null },
        content: [{ type: 'shapeTextbox', attrs: {}, content: [] }],
      },
    });

    // 300px * 9525 = 2857500; cy must be unchanged
    const resultDrawing = result?.elements?.[0]?.elements?.[0]?.elements?.[0];
    const extent = findNodeByName(resultDrawing, 'wp:extent');
    expect(extent.attributes.cx).toBe('2857500');
    expect(extent.attributes.cy).toBe('914400');
  });

  it('does not patch posOffset when marginOffset is absent', () => {
    translateChildNodes.mockReturnValue([]);

    const drawingContent = {
      name: 'w:drawing',
      elements: [
        {
          name: 'wp:anchor',
          elements: [
            {
              name: 'wp:positionH',
              elements: [{ name: 'wp:posOffset', elements: [{ type: 'text', text: '123456' }] }],
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
        attrs: { drawingContent },
        content: [{ type: 'shapeTextbox', attrs: {}, content: [] }],
      },
    });

    const resultDrawing = result?.elements?.[0]?.elements?.[0]?.elements?.[0];
    const posH = findNodeByName(resultDrawing, 'wp:positionH');
    expect(posH.elements[0].elements[0].text).toBe('123456');
  });

  it('does not patch a:ext elements in extension lists — only patches wps:spPr > a:xfrm > a:ext', () => {
    translateChildNodes.mockReturnValue([]);

    // In real Word documents, wp:cNvGraphicFramePr > a:extLst > a:ext appears earlier in
    // DFS order than wps:spPr > a:xfrm > a:ext. The old patchNodeAttributes DFS would
    // wrongly add cx/cy to the extension-list a:ext. patchShapeGeometryExt uses a direct path.
    const drawingContent = {
      name: 'w:drawing',
      elements: [
        {
          name: 'wp:anchor',
          elements: [
            { name: 'wp:extent', attributes: { cx: '457200', cy: '914400' } },
            // Extension-list a:ext with uri appears BEFORE the shape geometry a:ext in DFS order
            {
              name: 'wp:cNvGraphicFramePr',
              elements: [
                {
                  name: 'a:extLst',
                  elements: [
                    { name: 'a:ext', attributes: { uri: '{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}' }, elements: [] },
                  ],
                },
              ],
            },
            {
              name: 'a:graphic',
              elements: [
                {
                  name: 'a:graphicData',
                  elements: [
                    {
                      name: 'wps:wsp',
                      elements: [
                        {
                          name: 'wps:spPr',
                          elements: [
                            {
                              name: 'a:xfrm',
                              elements: [{ name: 'a:ext', attributes: { cx: '457200', cy: '914400' } }],
                            },
                          ],
                        },
                        { name: 'wps:txbx', elements: [{ name: 'w:txbxContent', elements: [] }] },
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
        attrs: { drawingContent, width: 200, height: 100 },
        content: [{ type: 'shapeTextbox', attrs: {}, content: [] }],
      },
    });

    // carbonCopy creates a deep copy — inspect the output, not the inputs.
    const resultDrawing = result?.elements?.[0]?.elements?.[0]?.elements?.[0];

    // DFS first match is the extension-list a:ext — it must NOT have cx/cy added.
    const firstExt = findNodeByName(resultDrawing, 'a:ext');
    expect(firstExt.attributes).toEqual({ uri: '{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}' });

    // The shape geometry a:ext (inside wps:spPr > a:xfrm) must be patched.
    // 200px * 9525 = 1905000, 100px * 9525 = 952500
    const spPr = findNodeByName(resultDrawing, 'wps:spPr');
    const shapeExt = findNodeByName(spPr, 'a:ext');
    expect(shapeExt.attributes.cx).toBe('1905000');
    expect(shapeExt.attributes.cy).toBe('952500');
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
