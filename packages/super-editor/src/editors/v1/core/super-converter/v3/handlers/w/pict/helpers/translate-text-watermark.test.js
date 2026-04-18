import { describe, it, expect, vi } from 'vitest';
import { translateTextWatermark } from './translate-text-watermark';

// Mock the dependencies
vi.mock('@helpers/generateDocxRandomId', () => ({
  generateRandomSigned32BitIntStrId: () => '12345678',
}));

describe('translateTextWatermark', () => {
  describe('Round-trip with VML attributes', () => {
    it('should use original VML attributes when available', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'DRAFT MARK',
          },
          vmlAttributes: {
            id: 'PowerPlusWaterMarkObject',
            'o:spid': 'shape_0',
            type: '#_x0000_t136',
            adj: '10800',
            fillcolor: 'silver',
            stroked: 'f',
            'o:allowincell': 'f',
            style: 'position:absolute;margin-left:0.05pt;margin-top:315.7pt',
          },
          vmlTextpathAttributes: {
            on: 't',
            fitshape: 't',
            style: 'font-family:"Liberation Sans";font-size:1pt',
            trim: 't',
          },
          vmlPathAttributes: {
            textpathok: 't',
          },
          vmlFillAttributes: {
            'o:detectmouseclick': 't',
            type: 'solid',
            color2: '#3f3f3f',
            opacity: '0.5',
          },
          vmlStrokeAttributes: {
            color: '#3465a4',
            joinstyle: 'round',
            endcap: 'flat',
          },
          vmlWrapAttributes: {
            type: 'none',
          },
        },
      };

      const result = translateTextWatermark({ node });

      expect(result.name).toBe('w:pict');

      const shape = result.elements[0];
      expect(shape.name).toBe('v:shape');
      expect(shape.attributes).toEqual(node.attrs.vmlAttributes);

      const textpath = shape.elements.find((el) => el.name === 'v:textpath');
      expect(textpath).toBeDefined();
      expect(textpath.attributes.string).toBe('DRAFT MARK');
      expect(textpath.attributes.on).toBe('t');

      const path = shape.elements.find((el) => el.name === 'v:path');
      expect(path).toBeDefined();
      expect(path.attributes.textpathok).toBe('t');

      const fill = shape.elements.find((el) => el.name === 'v:fill');
      expect(fill).toBeDefined();
      expect(fill.attributes.opacity).toBe('0.5');

      const stroke = shape.elements.find((el) => el.name === 'v:stroke');
      expect(stroke).toBeDefined();
      expect(stroke.attributes.color).toBe('#3465a4');

      const wrap = shape.elements.find((el) => el.name === 'w10:wrap');
      expect(wrap).toBeDefined();
      expect(wrap.attributes.type).toBe('none');
    });

    it('should update text string in VML attributes', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'NEW TEXT',
          },
          vmlAttributes: {
            id: 'Test',
            style: 'width:100pt',
          },
          vmlTextpathAttributes: {
            on: 't',
            string: 'OLD TEXT',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const textpath = shape.elements.find((el) => el.name === 'v:textpath');
      expect(textpath.attributes.string).toBe('NEW TEXT');
    });

    it('should omit empty VML elements', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'MINIMAL',
          },
          vmlAttributes: {
            id: 'Test',
          },
          vmlTextpathAttributes: {
            on: 't',
          },
          vmlPathAttributes: {
            textpathok: 't',
          },
          vmlFillAttributes: {},
          vmlStrokeAttributes: {},
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const fill = shape.elements.find((el) => el.name === 'v:fill');
      const stroke = shape.elements.find((el) => el.name === 'v:stroke');

      expect(fill).toBeUndefined();
      expect(stroke).toBeUndefined();
    });
  });

  describe('Programmatic creation (fallback path)', () => {
    it('should generate VML from attributes when VML attributes are missing', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'CONFIDENTIAL',
            rotation: 315,
            textStyle: {
              fontFamily: 'Arial',
              fontSize: '2pt',
              textAnchor: 'middle',
            },
            fill: {
              color: 'red',
              color2: '#000000',
              opacity: 0.3,
              type: 'gradient',
            },
            stroke: {
              enabled: true,
              color: '#0000ff',
              joinstyle: 'miter',
              endcap: 'square',
            },
          },
          size: {
            width: 642.4,
            height: 110.4,
          },
          marginOffset: {
            horizontal: 0.067,
            top: 420.9,
          },
          anchorData: {
            hRelativeFrom: 'margin',
            vRelativeFrom: 'margin',
            alignH: 'center',
            alignV: 'center',
          },
          wrap: {
            type: 'None',
            style: 'none',
          },
        },
      };

      const result = translateTextWatermark({ node });

      expect(result.name).toBe('w:pict');

      const shape = result.elements[0];
      expect(shape.name).toBe('v:shape');
      expect(shape.attributes.id).toContain('PowerPlusWaterMarkObject');
      expect(shape.attributes.type).toBe('#_x0000_t136');
      expect(shape.attributes.fillcolor).toBe('red');
      expect(shape.attributes.stroked).toBe('t');
      expect(shape.attributes['o:allowincell']).toBe('f');

      // Check style (use regex for floating point values to avoid precision issues)
      const style = shape.attributes.style;
      expect(style).toContain('position:absolute');
      expect(style).toMatch(/width:481\.7\d*pt/);
      expect(style).toMatch(/height:82\.8\d*pt/);
      expect(style).toMatch(/margin-left:0\.05\d*pt/);
      expect(style).toMatch(/margin-top:315\.67\d*pt/);
      expect(style).toContain('rotation:315');
      expect(style).toContain('mso-position-horizontal:center');
      expect(style).toContain('mso-position-vertical:center');
      expect(style).toContain('mso-position-horizontal-relative:margin');
      expect(style).toContain('mso-position-vertical-relative:margin');
      expect(style).toContain('v-text-anchor:middle');
    });

    it('should generate v:path element', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'TEST',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const path = shape.elements.find((el) => el.name === 'v:path');
      expect(path).toBeDefined();
      expect(path.attributes.textpathok).toBe('t');
    });

    it('should generate v:textpath element with correct attributes', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'WATERMARK TEXT',
            textStyle: {
              fontFamily: 'Times New Roman',
              fontSize: '3pt',
            },
            textpath: {
              trim: false,
            },
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const textpath = shape.elements.find((el) => el.name === 'v:textpath');
      expect(textpath).toBeDefined();
      expect(textpath.attributes.on).toBe('t');
      expect(textpath.attributes.fitshape).toBe('t');
      expect(textpath.attributes.string).toBe('WATERMARK TEXT');
      expect(textpath.attributes.style).toContain('font-family:"Times New Roman"');
      expect(textpath.attributes.style).toContain('font-size:3pt');
      expect(textpath.attributes.trim).toBe('f');
    });

    it('should generate v:fill element with correct attributes', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'FILLED',
            fill: {
              type: 'solid',
              color2: '#ff0000',
              opacity: 0.7,
              detectmouseclick: true,
            },
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const fill = shape.elements.find((el) => el.name === 'v:fill');
      expect(fill).toBeDefined();
      expect(fill.attributes.type).toBe('solid');
      expect(fill.attributes.color2).toBe('#ff0000');
      expect(fill.attributes.opacity).toBe('0.7');
      expect(fill.attributes['o:detectmouseclick']).toBe('t');
    });

    it('should not generate v:fill element if no fill attributes', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'NO FILL',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const fill = shape.elements.find((el) => el.name === 'v:fill');
      expect(fill).toBeUndefined();
    });

    it('should generate v:stroke element when enabled', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'STROKED',
            stroke: {
              enabled: true,
              color: '#00ff00',
              joinstyle: 'bevel',
              endcap: 'round',
            },
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const stroke = shape.elements.find((el) => el.name === 'v:stroke');
      expect(stroke).toBeDefined();
      expect(stroke.attributes.color).toBe('#00ff00');
      expect(stroke.attributes.joinstyle).toBe('bevel');
      expect(stroke.attributes.endcap).toBe('round');
    });

    it('should not generate v:stroke element when disabled', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'NO STROKE',
            stroke: {
              enabled: false,
            },
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const stroke = shape.elements.find((el) => el.name === 'v:stroke');
      expect(stroke).toBeUndefined();
    });

    it('should generate w10:wrap element', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'WRAPPED',
          },
          wrap: {
            type: 'Square',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const wrap = shape.elements.find((el) => el.name === 'w10:wrap');
      expect(wrap).toBeDefined();
      expect(wrap.attributes.type).toBe('square');
    });

    it('should use default wrap type if not specified', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'DEFAULT WRAP',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const wrap = shape.elements.find((el) => el.name === 'w10:wrap');
      expect(wrap).toBeDefined();
      expect(wrap.attributes.type).toBe('none');
    });

    it('should set stroked to "f" when stroke is disabled', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'NO STROKE',
            stroke: {
              enabled: false,
            },
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      expect(shape.attributes.stroked).toBe('f');
    });

    it('should use default fill color when not specified', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'DEFAULT COLOR',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      expect(shape.attributes.fillcolor).toBe('silver');
    });

    it('should preserve adj attribute from vmlAttributes', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'ADJ TEST',
          },
          vmlAttributes: {
            adj: '10800',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      expect(shape.attributes.adj).toBe('10800');
    });
  });

  describe('Style building', () => {
    it('should build proper VML style string', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'STYLE TEST',
            rotation: 45,
            textStyle: {
              textAnchor: 'top',
            },
          },
          size: {
            width: 400,
            height: 200,
          },
          marginOffset: {
            horizontal: 10,
            top: 20,
          },
          anchorData: {
            alignH: 'left',
            alignV: 'top',
            hRelativeFrom: 'page',
            vRelativeFrom: 'page',
          },
          wrap: {
            type: 'Square',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const style = shape.attributes.style;

      expect(style).toContain('position:absolute');
      expect(style).toContain('width:300pt');
      expect(style).toContain('height:150pt');
      expect(style).toContain('margin-left:7.5pt');
      expect(style).toContain('margin-top:15pt');
      expect(style).toContain('rotation:45');
      expect(style).toContain('mso-position-horizontal:left');
      expect(style).toContain('mso-position-vertical:top');
      expect(style).toContain('mso-position-horizontal-relative:page');
      expect(style).toContain('mso-position-vertical-relative:page');
      expect(style).toContain('mso-wrap-style:square');
      expect(style).toContain('v-text-anchor:top');
    });

    it('should use default margins when not specified', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'DEFAULT MARGINS',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const style = shape.attributes.style;

      expect(style).toContain('margin-left:0.05pt');
      expect(style).toContain('margin-top:315.7pt');
    });

    it('should not include rotation if zero', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'NO ROTATION',
            rotation: 0,
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const style = shape.attributes.style;

      expect(style).not.toContain('rotation');
    });
  });

  describe('Textpath style building', () => {
    it('should build textpath style with font family and size', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'FONT TEST',
            textStyle: {
              fontFamily: 'Courier New',
              fontSize: '14pt',
            },
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const textpath = shape.elements.find((el) => el.name === 'v:textpath');
      const style = textpath.attributes.style;

      expect(style).toContain('font-family:"Courier New"');
      expect(style).toContain('font-size:14pt');
    });

    it('should handle missing textStyle', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'NO STYLE',
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const textpath = shape.elements.find((el) => el.name === 'v:textpath');

      expect(textpath.attributes.style).toBe('');
    });
  });

  describe('Unit conversion', () => {
    it('should convert pixels to points correctly', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'CONVERSION TEST',
          },
          size: {
            width: 96, // 96 pixels = 72 points
            height: 192, // 192 pixels = 144 points
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const style = shape.attributes.style;

      expect(style).toContain('width:72pt');
      expect(style).toContain('height:144pt');
    });
  });

  describe('Element ordering', () => {
    it('should order shape elements correctly', () => {
      const node = {
        type: 'image',
        attrs: {
          vmlTextWatermark: true,
          textWatermarkData: {
            text: 'ORDERED',
            fill: {
              type: 'solid',
            },
            stroke: {
              enabled: true,
              color: 'blue',
            },
          },
        },
      };

      const result = translateTextWatermark({ node });

      const shape = result.elements[0];
      const elementNames = shape.elements.map((el) => el.name);

      expect(elementNames[0]).toBe('v:path');
      expect(elementNames[1]).toBe('v:textpath');
      expect(elementNames[2]).toBe('v:fill');
      expect(elementNames[3]).toBe('v:stroke');
      expect(elementNames[4]).toBe('w10:wrap');
    });
  });
});
