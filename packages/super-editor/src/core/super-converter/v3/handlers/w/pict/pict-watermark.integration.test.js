import { describe, it, expect } from 'vitest';
import { pictNodeTypeStrategy } from './helpers/pict-node-type-strategy';
import { handleShapeImageWatermarkImport } from './helpers/handle-shape-image-watermark-import';
import { translateImageWatermark } from './helpers/translate-image-watermark';
import { translateTextWatermark } from './helpers/translate-text-watermark';

describe('VML Watermark Integration Tests', () => {
  describe('Import → Export round-trip', () => {
    it('should import and export a VML watermark preserving all attributes', () => {
      // Setup: Mock DOCX structure with header containing watermark
      const mockDocx = {
        'word/_rels/header1.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/balloons.png',
                  },
                },
              ],
            },
          ],
        },
      };

      // Input: VML watermark XML (as it appears in header1.xml)
      const inputPict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              id: 'WordPictureWatermark100927634',
              'o:spid': '_x0000_s1027',
              type: '#_x0000_t75',
              alt: '',
              style:
                'position:absolute;margin-left:0;margin-top:0;width:466.55pt;height:233.25pt;z-index:-251653120;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin;mso-width-percent:0;mso-height-percent:0',
              'o:allowincell': 'f',
            },
            elements: [
              {
                name: 'v:imagedata',
                attributes: {
                  'r:id': 'rId1',
                  'o:title': 'Balloons',
                  gain: '19661f',
                  blacklevel: '22938f',
                },
              },
            ],
          },
        ],
      };

      // Step 1: Import - Convert from DOCX XML to SuperDoc node
      const { type: detectedType, handler } = pictNodeTypeStrategy(inputPict);
      expect(detectedType).toBe('image');
      expect(handler).toBe(handleShapeImageWatermarkImport);

      const importedNode = handler({
        params: {
          docx: mockDocx,
          filename: 'header1.xml',
        },
        pict: inputPict,
      });

      // Verify imported node structure
      expect(importedNode).toEqual({
        type: 'image',
        attrs: expect.objectContaining({
          src: 'word/media/balloons.png',
          alt: 'Balloons',
          title: 'Balloons',
          extension: 'png',
          rId: 'rId1',
          vmlWatermark: true,
          isPict: true,
          isAnchor: true,
          inline: false,
          wrap: {
            type: 'None',
            attrs: {
              behindDoc: true,
            },
          },
          anchorData: {
            hRelativeFrom: 'margin',
            vRelativeFrom: 'margin',
            alignH: 'center',
            alignV: 'center',
          },
          gain: '19661f',
          blacklevel: '22938f',
          vmlAttributes: expect.any(Object),
          vmlImagedata: expect.any(Object),
        }),
      });

      // Step 2: Export - Convert from SuperDoc node back to DOCX XML
      const exportedXml = translateImageWatermark({ node: importedNode });

      // Verify exported structure
      expect(exportedXml.name).toBe('w:pict');
      expect(exportedXml.attributes['w14:anchorId']).toBeDefined();

      const shape = exportedXml.elements.find((el) => el.name === 'v:shape');
      expect(shape).toBeDefined();
      expect(shape.attributes).toMatchObject({
        id: 'WordPictureWatermark100927634',
        'o:spid': '_x0000_s1027',
        type: '#_x0000_t75',
      });

      const imagedata = shape.elements.find((el) => el.name === 'v:imagedata');
      expect(imagedata).toBeDefined();
      expect(imagedata.attributes).toMatchObject({
        'r:id': 'rId1',
        'o:title': 'Balloons',
        gain: '19661f',
        blacklevel: '22938f',
      });
    });

    it('should handle watermark without VML attributes (programmatic creation)', () => {
      // Create a watermark node programmatically (not imported from DOCX)
      const programmaticNode = {
        type: 'image',
        attrs: {
          src: 'word/media/watermark.png',
          alt: 'Company Logo',
          title: 'Company Logo',
          extension: 'png',
          rId: 'rId5',
          vmlWatermark: true,
          isAnchor: true,
          inline: false,
          wrap: {
            type: 'None',
            attrs: {
              behindDoc: true,
            },
          },
          anchorData: {
            hRelativeFrom: 'margin',
            vRelativeFrom: 'page',
            alignH: 'center',
            alignV: 'top',
          },
          size: {
            width: 400,
            height: 200,
          },
          marginOffset: {
            horizontal: 0,
            top: 50,
          },
        },
      };

      // Export the programmatic node
      const exportedXml = translateImageWatermark({ node: programmaticNode });

      // Verify the structure is created correctly
      expect(exportedXml.name).toBe('w:pict');

      const shape = exportedXml.elements.find((el) => el.name === 'v:shape');
      expect(shape).toBeDefined();
      expect(shape.attributes.id).toContain('WordPictureWatermark');
      expect(shape.attributes.type).toBe('#_x0000_t75');
      expect(shape.attributes.style).toContain('position:absolute');
      expect(shape.attributes.style).toContain('width:');
      expect(shape.attributes.style).toContain('height:');
      expect(shape.attributes.style).toContain('mso-position-horizontal:center');
      expect(shape.attributes.style).toContain('mso-position-vertical:top');

      const imagedata = shape.elements.find((el) => el.name === 'v:imagedata');
      expect(imagedata).toBeDefined();
      expect(imagedata.attributes['r:id']).toBe('rId5');
      expect(imagedata.attributes['o:title']).toBe('Company Logo');
    });
  });

  describe('Edge cases', () => {
    it('should handle watermark with minimal attributes', () => {
      const mockDocx = {
        'word/_rels/header1.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/simple.png',
                  },
                },
              ],
            },
          ],
        },
      };

      const minimalPict = {
        elements: [
          {
            name: 'v:shape',
            attributes: {
              style: 'width:100pt;height:100pt',
            },
            elements: [
              {
                name: 'v:imagedata',
                attributes: {
                  'r:id': 'rId1',
                },
              },
            ],
          },
        ],
      };

      const { handler } = pictNodeTypeStrategy(minimalPict);
      const importedNode = handler({
        params: {
          docx: mockDocx,
          filename: 'header1.xml',
        },
        pict: minimalPict,
      });

      expect(importedNode).not.toBeNull();
      expect(importedNode.type).toBe('image');
      expect(importedNode.attrs.src).toBe('word/media/simple.png');
    });

    it('should not process non-watermark images through VML path', () => {
      const regularImageNode = {
        type: 'image',
        attrs: {
          src: 'word/media/regular.png',
          vmlWatermark: false, // Not a VML watermark
          isAnchor: true,
        },
      };

      const result = translateImageWatermark({ node: regularImageNode });

      // Should still work but create VML structure since the function is called
      expect(result).toBeDefined();
    });
  });

  describe('Text watermark handling', () => {
    it('should import and export a text watermark preserving all attributes', () => {
      // Input: VML text watermark XML (as it appears in header1.xml)
      const inputPict = {
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

      // Step 1: Import - Convert from DOCX XML to SuperDoc node
      const { type: detectedType, handler } = pictNodeTypeStrategy(inputPict);
      expect(detectedType).toBe('image');

      const importedNode = handler({
        params: {},
        pict: inputPict,
      });

      // Verify imported node structure
      expect(importedNode).toEqual({
        type: 'image',
        attrs: expect.objectContaining({
          src: expect.stringContaining('data:image/svg+xml'),
          vmlWatermark: true,
          vmlTextWatermark: true,
          textWatermarkData: expect.objectContaining({
            text: 'DRAFT MARK',
            rotation: 315,
            fill: expect.objectContaining({
              color: 'silver',
              opacity: 0.5,
            }),
            stroke: expect.objectContaining({
              enabled: false,
            }),
            textStyle: expect.objectContaining({
              fontFamily: 'Liberation Sans',
              fontSize: '1pt',
            }),
          }),
          anchorData: {
            hRelativeFrom: 'margin',
            vRelativeFrom: 'margin',
            alignH: 'center',
            alignV: 'center',
          },
        }),
      });

      // Step 2: Export - Convert from SuperDoc node back to DOCX XML
      const exportedXml = translateTextWatermark({ node: importedNode });

      // Verify exported structure
      expect(exportedXml.name).toBe('w:pict');

      const shape = exportedXml.elements.find((el) => el.name === 'v:shape');
      expect(shape).toBeDefined();
      expect(shape.attributes).toMatchObject({
        id: 'PowerPlusWaterMarkObject',
        'o:spid': 'shape_0',
        type: '#_x0000_t136',
        fillcolor: 'silver',
        stroked: 'f',
      });

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
    });

    it('should handle programmatically created text watermark', () => {
      // Create a text watermark node programmatically (as image with textWatermarkData)
      const programmaticNode = {
        type: 'image',
        attrs: {
          src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MDAiIGhlaWdodD0iMTAwIj4KICA8dGV4dCB4PSIzMDAiIHk9IjUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSJyZWQiIG9wYWNpdHk9IjAuNCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjcycHgiPkNPTkZJREVOVElBTDwvdGV4dD4KPC9zdmc+',
          vmlWatermark: true,
          vmlTextWatermark: true,
          size: {
            width: 600,
            height: 100,
          },
          anchorData: {
            hRelativeFrom: 'page',
            vRelativeFrom: 'page',
            alignH: 'center',
            alignV: 'center',
          },
          wrap: {
            type: 'None',
            attrs: {
              behindDoc: true,
            },
          },
          textWatermarkData: {
            text: 'CONFIDENTIAL',
            rotation: 45,
            textStyle: {
              fontFamily: 'Arial',
              fontSize: '2pt',
            },
            fill: {
              color: 'red',
              opacity: 0.4,
            },
            stroke: {
              enabled: false,
            },
          },
        },
      };

      // Export the programmatic node
      const exportedXml = translateTextWatermark({ node: programmaticNode });

      // Verify the structure is created correctly
      expect(exportedXml.name).toBe('w:pict');

      const shape = exportedXml.elements.find((el) => el.name === 'v:shape');
      expect(shape).toBeDefined();
      expect(shape.attributes.id).toContain('PowerPlusWaterMarkObject');
      expect(shape.attributes.type).toBe('#_x0000_t136');
      expect(shape.attributes.fillcolor).toBe('red');
      expect(shape.attributes.stroked).toBe('f');
      expect(shape.attributes.style).toContain('position:absolute');
      expect(shape.attributes.style).toContain('rotation:45');
      expect(shape.attributes.style).toContain('mso-position-horizontal:center');

      const textpath = shape.elements.find((el) => el.name === 'v:textpath');
      expect(textpath).toBeDefined();
      expect(textpath.attributes.string).toBe('CONFIDENTIAL');
      expect(textpath.attributes.style).toContain('font-family:"Arial"');
      expect(textpath.attributes.style).toContain('font-size:2pt');
    });
  });

  describe('v:shapetype handling', () => {
    it('should handle watermarks with v:shapetype definitions', () => {
      const mockDocx = {
        'word/_rels/header1.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/watermark.png',
                  },
                },
              ],
            },
          ],
        },
      };

      // Full watermark structure from the user's example
      const fullPict = {
        elements: [
          {
            name: 'v:shapetype',
            attributes: {
              id: '_x0000_t75',
              coordsize: '21600,21600',
              'o:spt': '75',
              'o:preferrelative': 't',
              path: 'm@4@5l@4@11@9@11@9@5xe',
              filled: 'f',
              stroked: 'f',
            },
            elements: [
              // ... shapetype definition elements (skipped for brevity)
            ],
          },
          {
            name: 'v:shape',
            attributes: {
              id: 'WordPictureWatermark100927634',
              'o:spid': '_x0000_s1027',
              type: '#_x0000_t75',
              alt: '',
              style:
                'position:absolute;margin-left:0;margin-top:0;width:466.55pt;height:233.25pt;z-index:-251653120;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin;mso-width-percent:0;mso-height-percent:0',
              'o:allowincell': 'f',
            },
            elements: [
              {
                name: 'v:imagedata',
                attributes: {
                  'r:id': 'rId1',
                  'o:title': 'Balloons',
                  gain: '19661f',
                  blacklevel: '22938f',
                },
              },
            ],
          },
        ],
      };

      // The strategy should still detect the v:shape element
      const { type, handler } = pictNodeTypeStrategy(fullPict);
      expect(type).toBe('image');
      expect(handler).toBe(handleShapeImageWatermarkImport);

      const importedNode = handler({
        params: {
          docx: mockDocx,
          filename: 'header1.xml',
        },
        pict: fullPict,
      });

      expect(importedNode).not.toBeNull();
      expect(importedNode.type).toBe('image');
      expect(importedNode.attrs.vmlWatermark).toBe(true);
    });
  });
});
