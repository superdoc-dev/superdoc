import { describe, it, expect, vi } from 'vitest';
import { translateShapeContainer } from './translate-shape-container';
import { handleShapeTextboxImport } from './handle-shape-textbox-import';
import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { generateRandomSigned32BitIntStrId } from '@helpers/generateDocxRandomId';

vi.mock('@converter/v2/exporter/helpers/translateChildNodes');
vi.mock('@helpers/generateDocxRandomId');

describe('translateShapeContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateRandomSigned32BitIntStrId.mockReturnValue('12345678');
  });

  it('should create shape container structure with all nested elements', () => {
    const mockElements = [{ name: 'v:textbox' }];
    translateChildNodes.mockReturnValue(mockElements);

    const params = {
      node: {
        attrs: {
          attributes: {
            id: '_x0000_s1026',
            type: '#_x0000_t202',
            style: 'position:absolute',
          },
          fillcolor: '#4472C4',
        },
      },
    };

    const result = translateShapeContainer(params);

    expect(result).toEqual({
      name: 'w:p',
      elements: [
        {
          name: 'w:r',
          elements: [
            {
              name: 'w:pict',
              attributes: {
                'w14:anchorId': '12345678',
              },
              elements: [
                {
                  name: 'v:shape',
                  attributes: {
                    id: '_x0000_s1026',
                    type: '#_x0000_t202',
                    style: 'position:absolute',
                    fillcolor: '#4472C4',
                  },
                  elements: mockElements,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('should include w10:wrap when wrapAttributes are present', () => {
    translateChildNodes.mockReturnValue([]);

    const params = {
      node: {
        attrs: {
          attributes: { id: 'shape1' },
          fillcolor: '#FFFFFF',
          wrapAttributes: {
            type: 'square',
            side: 'both',
          },
        },
      },
    };

    const result = translateShapeContainer(params);
    const pict = result.elements[0].elements[0]; // w:p > w:r > w:pict
    const shape = pict.elements[0];

    expect(shape.elements).toContainEqual({
      name: 'w10:wrap',
      attributes: {
        type: 'square',
        side: 'both',
      },
    });
  });

  it('should not include w10:wrap when wrapAttributes are absent', () => {
    translateChildNodes.mockReturnValue([{ name: 'v:textbox' }]);

    const params = {
      node: {
        attrs: {
          attributes: { id: 'shape1' },
          fillcolor: '#FFFFFF',
        },
      },
    };

    const result = translateShapeContainer(params);
    const pict = result.elements[0].elements[0]; // w:p > w:r > w:pict
    const shape = pict.elements[0];

    expect(shape.elements).not.toContainEqual(expect.objectContaining({ name: 'w10:wrap' }));
  });

  it('wraps shapeContainer export in paragraph and run XML', () => {
    translateChildNodes.mockReturnValue([{ name: 'v:textbox' }]);

    const params = {
      node: {
        attrs: {
          attributes: {
            id: '_x0000_s2048',
            type: '#_x0000_t202',
            style: 'position:absolute',
          },
          fillcolor: '#FFFFFF',
        },
      },
    };

    const result = translateShapeContainer(params);

    expect(result).toEqual({
      name: 'w:p',
      elements: [
        {
          name: 'w:r',
          elements: [
            {
              name: 'w:pict',
              attributes: {
                'w14:anchorId': '12345678',
              },
              elements: [
                {
                  name: 'v:shape',
                  attributes: {
                    id: '_x0000_s2048',
                    type: '#_x0000_t202',
                    style: 'position:absolute',
                    fillcolor: '#FFFFFF',
                  },
                  elements: [{ name: 'v:textbox' }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('should serialize marginOffset and anchorData into VML style', () => {
    translateChildNodes.mockReturnValue([{ name: 'v:textbox' }]);

    const params = {
      node: {
        attrs: {
          attributes: {
            id: 'shape-positioned',
            type: '#_x0000_t202',
            style: 'position:absolute;z-index:1',
          },
          style: 'width: 100pt;height: 50pt;',
          fillcolor: '#FFFFFF',
          anchorData: {
            alignH: 'center',
            hRelativeFrom: 'margin',
            alignV: 'top',
            vRelativeFrom: 'page',
          },
          marginOffset: {
            horizontal: 96,
            top: 48,
          },
        },
      },
    };

    const result = translateShapeContainer(params);
    const style = result.elements[0].elements[0].elements[0].attributes.style;

    expect(style).toContain('position:absolute');
    expect(style).toContain('z-index:1');
    expect(style).toContain('width:100pt');
    expect(style).toContain('height:50pt');
    expect(style).toContain('margin-left:72pt');
    expect(style).toContain('margin-top:36pt');
    expect(style).toContain('mso-position-horizontal:center');
    expect(style).toContain('mso-position-horizontal-relative:margin');
    expect(style).toContain('mso-position-vertical:top');
    expect(style).toContain('mso-position-vertical-relative:page');
  });

  it('preserves VML textbox positioning through import to export', () => {
    translateChildNodes.mockReturnValue([{ name: 'v:textbox' }]);

    const importedNode = handleShapeTextboxImport({
      params: { docx: {} },
      pict: {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              id: 'shape-roundtrip',
              type: '#_x0000_t202',
              style:
                'position:absolute;margin-left:72pt;margin-top:36pt;width:100pt;height:50pt;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:top;mso-position-vertical-relative:page;z-index:1',
            },
            elements: [],
          },
        ],
      },
    });

    const result = translateShapeContainer({ node: importedNode });
    const style = result.elements[0].elements[0].elements[0].attributes.style;

    expect(style).toContain('position:absolute');
    expect(style).toContain('z-index:1');
    expect(style).toContain('width:100pt');
    expect(style).toContain('height:50pt');
    expect(style).toContain('margin-left:72pt');
    expect(style).toContain('margin-top:36pt');
    expect(style).toContain('mso-position-horizontal:center');
    expect(style).toContain('mso-position-horizontal-relative:margin');
    expect(style).toContain('mso-position-vertical:top');
    expect(style).toContain('mso-position-vertical-relative:page');
  });
});
