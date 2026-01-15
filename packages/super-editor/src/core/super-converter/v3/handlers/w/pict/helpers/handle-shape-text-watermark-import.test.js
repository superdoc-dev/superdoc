import { describe, it, expect } from 'vitest';
import { handleShapeTextWatermarkImport } from './handle-shape-text-watermark-import';

describe('handleShapeTextWatermarkImport', () => {
  describe('Basic text watermark import', () => {
    it('should import a basic text watermark with v:textpath', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              id: 'PowerPlusWaterMarkObject',
              'o:spid': 'shape_0',
              type: '#_x0000_t136',
              adj: '10800',
              fillcolor: 'silver',
              stroked: 'f',
              'o:allowincell': 'f',
              style:
                'position:absolute;margin-left:0.05pt;margin-top:315.7pt;width:481.8pt;height:82.8pt;mso-wrap-style:none;v-text-anchor:middle;rotation:315;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin',
            },
            elements: [
              {
                name: 'v:path',
                attributes: {
                  textpathok: 't',
                },
              },
              {
                name: 'v:textpath',
                attributes: {
                  on: 't',
                  fitshape: 't',
                  string: 'DRAFT MARK',
                  style: 'font-family:"Liberation Sans";font-size:1pt',
                  trim: 't',
                },
              },
              {
                name: 'v:fill',
                attributes: {
                  'o:detectmouseclick': 't',
                  type: 'solid',
                  color2: '#3f3f3f',
                  opacity: '0.5',
                },
              },
              {
                name: 'v:stroke',
                attributes: {
                  color: '#3465a4',
                  joinstyle: 'round',
                  endcap: 'flat',
                },
              },
              {
                name: 'w10:wrap',
                attributes: {
                  type: 'none',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result).toBeDefined();
      expect(result.type).toBe('image');
      expect(result.attrs.vmlTextWatermark).toBe(true);
      expect(result.attrs.textWatermarkData.text).toBe('DRAFT MARK');
      expect(result.attrs.src).toContain('data:image/svg+xml');
    });

    it('should extract text from string attribute', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'position:absolute;width:100pt;height:50pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'CONFIDENTIAL',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result).not.toBeNull();
      expect(result.attrs.textWatermarkData.text).toBe('CONFIDENTIAL');
    });

    it('should return null if v:textpath is missing', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {},
            elements: [],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result).toBeNull();
    });

    it('should return null if v:shape is missing', () => {
      const pict = {
        elements: [],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result).toBeNull();
    });

    it('should warn and return null if string attribute is empty', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {},
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  on: 't',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('v:textpath missing string attribute');

      consoleSpy.mockRestore();
    });
  });

  describe('Style parsing', () => {
    it('should parse dimensions from style', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:481.8pt;height:82.8pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // Dimensions include 10% padding to prevent text clipping
      expect(result.attrs.size.width).toBeCloseTo(642.4 * 1.1, 1); // 481.8pt to pixels * 1.1
      expect(result.attrs.size.height).toBeCloseTo(110.4 * 1.1, 1); // 82.8pt to pixels * 1.1
    });

    it('should parse rotation from style', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'rotation:315',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'ROTATED',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.rotation).toBe(315);
      // Rotation is baked into the SVG, not in transformData
      // (layout engine doesn't support rotation for image fragments)
      expect(result.attrs.transformData).toBeUndefined();
    });

    it('should parse margin offsets from style', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'margin-left:0.05pt;margin-top:315.7pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'MARGIN TEST',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // For center-aligned watermarks relative to margin, both horizontal and vertical
      // margin offsets are set to 0 to let center alignment work properly in the browser
      expect(result.attrs.marginOffset.horizontal).toBe(0);
      expect(result.attrs.marginOffset.top).toBe(0);
    });

    it('should parse positioning from style', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style:
                'mso-position-horizontal:center;mso-position-vertical:center;mso-position-horizontal-relative:margin;mso-position-vertical-relative:margin',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'POSITIONED',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.anchorData).toEqual({
        hRelativeFrom: 'margin',
        vRelativeFrom: 'margin',
        alignH: 'center',
        alignV: 'center',
      });
    });

    it('should use default positioning if not specified', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'DEFAULT POS',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.anchorData.alignH).toBe('center');
      expect(result.attrs.anchorData.alignV).toBe('center');
      expect(result.attrs.anchorData.hRelativeFrom).toBe('margin');
      expect(result.attrs.anchorData.vRelativeFrom).toBe('margin');
    });

    it('should preserve margin offsets for left-aligned watermarks', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style:
                'margin-left:50pt;margin-top:100pt;mso-position-horizontal:left;mso-position-vertical:top;mso-position-horizontal-relative:margin;mso-position-vertical-relative:margin',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'LEFT ALIGNED',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // For left-aligned watermarks, margin offsets should be preserved
      expect(result.attrs.marginOffset.horizontal).toBeCloseTo(66.7, 1); // 50pt to pixels
      expect(result.attrs.marginOffset.top).toBeCloseTo(133.3, 1); // 100pt to pixels
      expect(result.attrs.anchorData.alignH).toBe('left');
      expect(result.attrs.anchorData.alignV).toBe('top');
    });

    it('should preserve margin offsets for right-aligned watermarks', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style:
                'margin-left:30pt;margin-top:60pt;mso-position-horizontal:right;mso-position-vertical:bottom;mso-position-horizontal-relative:margin;mso-position-vertical-relative:margin',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'RIGHT ALIGNED',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // For right-aligned watermarks, margin offsets should be preserved
      expect(result.attrs.marginOffset.horizontal).toBeCloseTo(40, 1); // 30pt to pixels
      expect(result.attrs.marginOffset.top).toBeCloseTo(80, 1); // 60pt to pixels
      expect(result.attrs.anchorData.alignH).toBe('right');
      expect(result.attrs.anchorData.alignV).toBe('bottom');
    });

    it('should preserve margin offsets for page-relative watermarks', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style:
                'margin-left:25pt;margin-top:75pt;mso-position-horizontal:center;mso-position-vertical:center;mso-position-horizontal-relative:page;mso-position-vertical-relative:page',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'PAGE RELATIVE',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // For page-relative watermarks, margin offsets should be preserved even if center-aligned
      expect(result.attrs.marginOffset.horizontal).toBeCloseTo(33.3, 1); // 25pt to pixels
      expect(result.attrs.marginOffset.top).toBeCloseTo(100, 1); // 75pt to pixels
      expect(result.attrs.anchorData.hRelativeFrom).toBe('page');
      expect(result.attrs.anchorData.vRelativeFrom).toBe('page');
      expect(result.attrs.anchorData.alignH).toBe('center');
      expect(result.attrs.anchorData.alignV).toBe('center');
    });
  });

  describe('Fill properties', () => {
    it('should extract fill properties', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              fillcolor: 'silver',
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'FILLED',
                },
              },
              {
                name: 'v:fill',
                attributes: {
                  type: 'solid',
                  color2: '#3f3f3f',
                  opacity: '0.5',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.fill).toEqual({
        color: 'silver',
        color2: '#3f3f3f',
        opacity: 0.5,
        type: 'solid',
      });
    });

    it('should use fillcolor from shape if v:fill is missing', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              fillcolor: 'blue',
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'BLUE TEXT',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.fill.color).toBe('blue');
    });

    it('should default to silver if no fill color specified', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'DEFAULT COLOR',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.fill.color).toBe('silver');
    });
  });

  describe('Stroke properties', () => {
    it('should extract stroke properties when enabled', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              stroked: 't',
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'STROKED',
                },
              },
              {
                name: 'v:stroke',
                attributes: {
                  color: '#3465a4',
                  joinstyle: 'round',
                  endcap: 'flat',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.stroke).toEqual({
        enabled: true, // 'stroked' attribute is 't' which means enabled
        color: '#3465a4',
        joinstyle: 'round',
        endcap: 'flat',
      });
    });

    it('should mark stroke as disabled when stroked="f"', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              stroked: 'f',
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'NO STROKE',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.stroke.enabled).toBe(false);
    });
  });

  describe('Text styling', () => {
    it('should extract font family and size from textpath style', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'STYLED TEXT',
                  style: 'font-family:"Liberation Sans";font-size:1pt',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.textStyle.fontFamily).toBe('Liberation Sans');
      expect(result.attrs.textWatermarkData.textStyle.fontSize).toBe('1pt');
    });

    it('should handle single quotes in font-family', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'ARIAL',
                  style: "font-family:'Arial'",
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.textStyle.fontFamily).toBe('Arial');
    });

    it('should use default font if not specified', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'DEFAULT FONT',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.textStyle.fontFamily).toBe('Arial');
      expect(result.attrs.textWatermarkData.textStyle.fontSize).toBe('1pt');
    });

    it('should extract text anchor from style', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'v-text-anchor:middle',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'ANCHORED',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.textStyle.textAnchor).toBe('middle');
    });
  });

  describe('VML attributes preservation', () => {
    it('should preserve all VML attributes for round-tripping', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              id: 'PowerPlusWaterMarkObject',
              'o:spid': 'shape_123',
              type: '#_x0000_t136',
              adj: '10800',
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:path',
                attributes: {
                  textpathok: 't',
                },
              },
              {
                name: 'v:textpath',
                attributes: {
                  on: 't',
                  fitshape: 't',
                  string: 'PRESERVED',
                  trim: 't',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.vmlAttributes).toBeDefined();
      expect(result.attrs.vmlTextpathAttributes).toBeDefined();
      expect(result.attrs.vmlPathAttributes).toBeDefined();
      expect(result.attrs.vmlTextpathAttributes.on).toBe('t');
      expect(result.attrs.vmlPathAttributes.textpathok).toBe('t');
      expect(result.type).toBe('image');
      expect(result.attrs.vmlTextWatermark).toBe(true);
    });

    it('should preserve wrap attributes', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'WRAPPED',
                },
              },
              {
                name: 'w10:wrap',
                attributes: {
                  type: 'none',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.vmlWrapAttributes).toEqual({ type: 'none' });
      expect(result.attrs.wrap.type).toBe('None');
      expect(result.attrs.wrap.attrs.behindDoc).toBe(true);
    });
  });

  describe('Textpath properties', () => {
    it('should extract textpath boolean properties', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:path',
                attributes: {
                  textpathok: 't',
                },
              },
              {
                name: 'v:textpath',
                attributes: {
                  on: 't',
                  fitshape: 't',
                  trim: 't',
                  string: 'TEXTPATH',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.textpath).toEqual({
        on: true,
        fitshape: true,
        trim: true,
        textpathok: true,
      });
    });

    it('should handle false values for textpath properties', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt',
            },
            elements: [
              {
                name: 'v:path',
                attributes: {
                  textpathok: 'f',
                },
              },
              {
                name: 'v:textpath',
                attributes: {
                  on: 'f',
                  fitshape: 'f',
                  string: 'NO TEXTPATH',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.textpath.on).toBe(false);
      expect(result.attrs.textWatermarkData.textpath.fitshape).toBe(false);
      expect(result.attrs.textWatermarkData.textpath.textpathok).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle landscape watermark with 345 degree rotation', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              id: 'PowerPlusWaterMarkObject',
              'o:spid': 'shape_0',
              adj: '10800',
              fillcolor: 'red',
              stroked: 'f',
              'o:allowincell': 'f',
              style:
                'position:absolute;margin-left:123.3pt;margin-top:191.5pt;width:481.8pt;height:84.65pt;mso-wrap-style:none;v-text-anchor:middle;rotation:345;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin',
              type: '_x0000_t136',
            },
            elements: [
              {
                name: 'v:path',
                attributes: {
                  textpathok: 't',
                },
              },
              {
                name: 'v:textpath',
                attributes: {
                  on: 't',
                  fitshape: 't',
                  string: 'DRAFT MARK',
                  style: 'font-family:"LM Mono Prop Light 10";font-size:1pt',
                  trim: 't',
                },
              },
              {
                name: 'v:fill',
                attributes: {
                  'o:detectmouseclick': 't',
                  type: 'solid',
                  color2: 'aqua',
                  opacity: '0.5',
                },
              },
              {
                name: 'v:stroke',
                attributes: {
                  color: '#3465a4',
                  joinstyle: 'round',
                  endcap: 'flat',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result).toBeDefined();
      expect(result.type).toBe('image');
      expect(result.attrs.vmlTextWatermark).toBe(true);

      // Should handle 345 degree rotation (15 degrees clockwise from horizontal)
      expect(result.attrs.textWatermarkData.rotation).toBe(345);

      // For center-aligned watermarks, margins should be 0
      expect(result.attrs.marginOffset.horizontal).toBe(0);
      expect(result.attrs.marginOffset.top).toBe(0);

      // Verify rotated bounding box is calculated correctly with 10% padding
      // Original: 481.8pt × 84.65pt ≈ 642.4px × 112.9px
      // With 345° rotation, bbox should be larger to prevent clipping
      // Plus 10% padding for font rendering
      expect(result.attrs.size.width).toBeGreaterThan(642 * 1.1);
      expect(result.attrs.size.height).toBeGreaterThan(112 * 1.1);

      // SVG should be generated
      expect(result.attrs.src).toContain('data:image/svg+xml');
    });

    it('should handle missing optional elements gracefully', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:50pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'MINIMAL',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result).not.toBeNull();
      expect(result.type).toBe('image');
      expect(result.attrs.textWatermarkData.text).toBe('MINIMAL');
    });

    it('should handle complex style strings with colons in values', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:50pt;position:absolute',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'COMPLEX',
                  style: 'font-family:"Times New Roman";font-size:12pt',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      expect(result.attrs.textWatermarkData.textStyle.fontFamily).toBe('Times New Roman');
    });
  });

  describe('Security: SVG injection prevention', () => {
    it('should sanitize malicious font-family with quotes and event handlers', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:50pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                  style: 'font-family:"Arial" onload="alert(1)"',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // Should strip out quotes and dangerous characters (but alphanumeric remains)
      expect(result.attrs.src).toBeDefined();
      expect(result.attrs.src).not.toContain('"');
      expect(result.attrs.src).not.toContain('<');
      expect(result.attrs.src).not.toContain('>');
      // fontFamily should be sanitized - dangerous chars removed but alphanumeric kept
      expect(result.attrs.textWatermarkData.textStyle.fontFamily).toBe('Arial onloadalert1');
    });

    it('should sanitize malicious font-family with angle brackets', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:50pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                  style: 'font-family:"Arial<script>alert(1)</script>"',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // Should strip out angle brackets and dangerous characters
      expect(result.attrs.src).not.toContain('<');
      expect(result.attrs.src).not.toContain('>');
      expect(result.attrs.src).not.toContain('"');
      expect(result.attrs.src).not.toContain('<');
      expect(result.attrs.src).not.toContain('>');
      // The word "script" and "alert" remain as plain text (safe) after sanitization
      expect(result.attrs.textWatermarkData.textStyle.fontFamily).toBe('Arialscriptalert1script');
    });

    it('should sanitize malicious color with event handlers', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              fillcolor: 'red" onload="alert(1)"',
              style: 'width:100pt;height:50pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // fillcolor should be sanitized - dangerous chars removed (but parentheses allowed for rgb())
      expect(result.attrs.src).not.toContain('"');
      expect(result.attrs.src).not.toContain('<');
      expect(result.attrs.src).not.toContain('>');
      // Color should be sanitized - alphanumeric and rgb() syntax kept, other special chars removed
      expect(result.attrs.textWatermarkData.fill.color).toBe('redonloadalert(1)');
    });

    it('should sanitize malicious color with angle brackets', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:50pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                },
              },
              {
                name: 'v:fill',
                attributes: {
                  color: 'blue</text><script>alert(1)</script>',
                  opacity: '0.5',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // Should strip out angle brackets and dangerous characters (but parentheses allowed for rgb())
      expect(result.attrs.src).not.toContain('<');
      expect(result.attrs.src).not.toContain('>');
      expect(result.attrs.src).not.toContain('"');
      // The word "script" and "alert" remain as plain text (safe) after sanitization
      expect(result.attrs.textWatermarkData.fill.color).toBe('bluetextscriptalert(1)script');
    });

    it('should handle malicious numeric values gracefully', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:50pt;rotation:99999999',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                },
              },
              {
                name: 'v:fill',
                attributes: {
                  opacity: '999',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // Rotation should be clamped to -360 to 360
      expect(result.attrs.textWatermarkData.rotation).toBe(360);
      // Opacity should be clamped to 0-1
      expect(result.attrs.textWatermarkData.fill.opacity).toBe(1);
    });

    it('should handle NaN and Infinity numeric values', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:50pt;rotation:NaN',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                },
              },
              {
                name: 'v:fill',
                attributes: {
                  opacity: 'Infinity',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // NaN and Infinity should be replaced with defaults
      // rotation: NaN becomes default 0
      expect(result.attrs.textWatermarkData.rotation).toBe(0);
      // opacity: Infinity becomes default 0.5
      expect(result.attrs.textWatermarkData.fill.opacity).toBe(0.5);
    });

    it('should sanitize extreme dimension values', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:999999pt;height:999999pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // Dimensions should be clamped to reasonable maximums
      // With 10% padding, max 10000 becomes 11000
      expect(result.attrs.size.width).toBeLessThanOrEqual(11000);
      expect(result.attrs.size.height).toBeLessThanOrEqual(11000);
    });

    it('should escape XML special characters in watermark text', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:50pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: '<script>alert("XSS")</script>',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // XML special characters should be escaped in the SVG output
      const decodedSrc = decodeURIComponent(result.attrs.src.replace('data:image/svg+xml,', ''));
      expect(decodedSrc).toContain('&lt;');
      expect(decodedSrc).toContain('&gt;');
      // But the actual text should be preserved
      expect(result.attrs.textWatermarkData.text).toBe('<script>alert("XSS")</script>');
      // Should not contain raw dangerous characters in SVG
      expect(result.attrs.src).not.toMatch(/<script>/);
    });

    it('should handle empty or null malicious inputs', () => {
      const pict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              fillcolor: '',
              style: 'width:100pt;height:50pt',
            },
            elements: [
              {
                name: 'v:textpath',
                attributes: {
                  string: 'TEST',
                  style: 'font-family:""',
                },
              },
              {
                name: 'v:fill',
                attributes: {
                  opacity: '',
                },
              },
            ],
          },
        ],
      };

      const result = handleShapeTextWatermarkImport({ params: {}, pict });

      // Should use defaults for empty values
      expect(result.attrs.textWatermarkData.fill.color).toBe('silver');
      expect(result.attrs.textWatermarkData.textStyle.fontFamily).toBe('Arial');
      expect(result.attrs.textWatermarkData.fill.opacity).toBe(0.5);
    });
  });
});
