import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { handleDrawingNode, handleImageImport } from '../../core/super-converter/v2/importer/imageImporter.js';
import { exportSchemaToJson } from '@converter/exporter';
import { emuToPixels, rotToDegrees, pixelsToEmu, degreesToRot } from '@converter/helpers';
import { createDocumentJson } from '@core/super-converter/v2/importer/docxImporter.js';
import { getTestDataByFileName } from '@tests/helpers/helpers.js';

describe('Image Import/Export Round Trip Tests', () => {
  describe('Transform Data Round Trip', () => {
    it('preserves rotation data through import/export cycle', () => {
      // Mock OOXML input with rotation
      const mockXmlInput = {
        name: 'wp:inline',
        attributes: {
          distT: '0',
          distB: '0',
          distL: '0',
          distR: '0',
        },
        elements: [
          {
            name: 'wp:extent',
            attributes: { cx: '3810000', cy: '2857500' },
          },
          {
            name: 'wp:effectExtent',
            attributes: { l: '0', t: '0', r: '0', b: '0' },
          },
          {
            name: 'a:graphic',
            elements: [
              {
                name: 'a:graphicData',
                attributes: { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                elements: [
                  {
                    name: 'pic:pic',
                    elements: [
                      {
                        name: 'pic:blipFill',
                        elements: [
                          {
                            name: 'a:blip',
                            attributes: { 'r:embed': 'rId1' },
                          },
                        ],
                      },
                      {
                        name: 'pic:spPr',
                        elements: [
                          {
                            name: 'a:xfrm',
                            attributes: {
                              rot: '1800000', // 30 degrees
                              flipV: '1',
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: 'wp:docPr',
            attributes: { id: '1', name: 'Test Image' },
          },
        ],
      };

      const mockDocx = {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  attributes: {
                    Id: 'rId1',
                    Target: 'media/test-image.jpg',
                  },
                },
              ],
            },
          ],
        },
      };

      // Import
      const params = { docx: mockDocx };
      const importedImage = handleImageImport(mockXmlInput, null, params);

      // Verify import
      expect(importedImage.type).toBe('image');
      expect(importedImage.attrs.transformData.rotation).toBe(rotToDegrees('1800000'));
      expect(importedImage.attrs.transformData.verticalFlip).toBe(true);

      // Create mock export params
      const mockExportParams = {
        node: importedImage,
        relationships: [],
      };

      // Export
      const exportedResult = exportSchemaToJson(mockExportParams);

      // Verify export structure
      expect(exportedResult.name).toBe('w:r');
      const drawing = exportedResult.elements.find((el) => el.name === 'w:drawing');
      expect(drawing).toBeTruthy();

      const inline = drawing.elements[0];
      expect(inline.name).toBe('wp:inline');

      const graphic = inline.elements.find((el) => el.name === 'a:graphic');
      const graphicData = graphic.elements.find((el) => el.name === 'a:graphicData');
      const pic = graphicData.elements.find((el) => el.name === 'pic:pic');
      const spPr = pic.elements.find((el) => el.name === 'pic:spPr');
      const xfrm = spPr.elements.find((el) => el.name === 'a:xfrm');

      // Verify round trip preservation
      expect(Number(xfrm.attributes.rot)).toBe(degreesToRot(30));
      expect(xfrm.attributes.flipV).toBe('1');
    });

    it('preserves horizontal flip through round trip', () => {
      const mockXmlInput = {
        name: 'wp:inline',
        attributes: { distT: '0', distB: '0', distL: '0', distR: '0' },
        elements: [
          {
            name: 'wp:extent',
            attributes: { cx: '2000000', cy: '1500000' },
          },
          {
            name: 'a:graphic',
            elements: [
              {
                name: 'a:graphicData',
                attributes: { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                elements: [
                  {
                    name: 'pic:pic',
                    elements: [
                      {
                        name: 'pic:blipFill',
                        elements: [
                          {
                            name: 'a:blip',
                            attributes: { 'r:embed': 'rId2' },
                          },
                        ],
                      },
                      {
                        name: 'pic:spPr',
                        elements: [
                          {
                            name: 'a:xfrm',
                            attributes: { flipH: '1' },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: 'wp:docPr',
            attributes: { id: '2', name: 'Flipped Image' },
          },
        ],
      };

      const mockDocx = {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  attributes: {
                    Id: 'rId2',
                    Target: 'media/flipped-image.png',
                  },
                },
              ],
            },
          ],
        },
      };

      // Import
      const params = { docx: mockDocx };
      const importedImage = handleImageImport(mockXmlInput, null, params);

      // Verify import
      expect(importedImage.attrs.transformData.horizontalFlip).toBe(true);
      expect(importedImage.attrs.transformData.verticalFlip).toBe(false);

      // Export
      const exportedResult = exportSchemaToJson({ node: importedImage, relationships: [] });

      // Navigate to transform attributes
      const drawing = exportedResult.elements.find((el) => el.name === 'w:drawing');
      const inline = drawing.elements[0];
      const graphic = inline.elements.find((el) => el.name === 'a:graphic');
      const graphicData = graphic.elements.find((el) => el.name === 'a:graphicData');
      const pic = graphicData.elements.find((el) => el.name === 'pic:pic');
      const spPr = pic.elements.find((el) => el.name === 'pic:spPr');
      const xfrm = spPr.elements.find((el) => el.name === 'a:xfrm');

      // Verify round trip preservation
      expect(xfrm.attributes.flipH).toBe('1');
      expect(xfrm.attributes.flipV).toBeUndefined();
    });

    it('preserves size extensions through round trip', () => {
      const mockXmlInput = {
        name: 'wp:inline',
        attributes: { distT: '0', distB: '0', distL: '0', distR: '0' },
        elements: [
          {
            name: 'wp:extent',
            attributes: { cx: '1500000', cy: '1000000' },
          },
          {
            name: 'wp:effectExtent',
            attributes: { l: '95250', t: '47625', r: '190500', b: '0' },
          },
          {
            name: 'a:graphic',
            elements: [
              {
                name: 'a:graphicData',
                attributes: { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                elements: [
                  {
                    name: 'pic:pic',
                    elements: [
                      {
                        name: 'pic:blipFill',
                        elements: [
                          {
                            name: 'a:blip',
                            attributes: { 'r:embed': 'rId3' },
                          },
                        ],
                      },
                      {
                        name: 'pic:spPr',
                        elements: [
                          {
                            name: 'a:xfrm',
                            attributes: { rot: '900000' }, // 15 degrees
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: 'wp:docPr',
            attributes: { id: '3', name: 'Extended Image' },
          },
        ],
      };

      const mockDocx = {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  attributes: {
                    Id: 'rId3',
                    Target: 'media/extended-image.jpg',
                  },
                },
              ],
            },
          ],
        },
      };

      // Import
      const params = { docx: mockDocx };
      const importedImage = handleImageImport(mockXmlInput, null, params);

      // Verify import of size extensions
      expect(importedImage.attrs.transformData.sizeExtension.left).toBe(emuToPixels('95250'));
      expect(importedImage.attrs.transformData.sizeExtension.top).toBe(emuToPixels('47625'));
      expect(importedImage.attrs.transformData.sizeExtension.right).toBe(emuToPixels('190500'));
      expect(importedImage.attrs.transformData.sizeExtension.bottom).toBe(emuToPixels('0'));

      // Export
      const exportedResult = exportSchemaToJson({ node: importedImage, relationships: [] });

      // Navigate to effectExtent
      const drawing = exportedResult.elements.find((el) => el.name === 'w:drawing');
      const inline = drawing.elements[0];
      const effectExtent = inline.elements.find((el) => el.name === 'wp:effectExtent');

      // Verify round trip preservation
      expect(Number(effectExtent.attributes.l)).toBe(pixelsToEmu(emuToPixels('95250')));
      expect(Number(effectExtent.attributes.t)).toBe(pixelsToEmu(emuToPixels('47625')));
      expect(Number(effectExtent.attributes.r)).toBe(pixelsToEmu(emuToPixels('190500')));
      expect(effectExtent.attributes.b).toBe('0');
    });

    it('handles combined transformations correctly', () => {
      const mockXmlInput = {
        name: 'wp:inline',
        attributes: { distT: '0', distB: '0', distL: '0', distR: '0' },
        elements: [
          {
            name: 'wp:extent',
            attributes: { cx: '3000000', cy: '2000000' },
          },
          {
            name: 'wp:effectExtent',
            attributes: { l: '127000', t: '95250', r: '63500', b: '190500' },
          },
          {
            name: 'a:graphic',
            elements: [
              {
                name: 'a:graphicData',
                attributes: { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                elements: [
                  {
                    name: 'pic:pic',
                    elements: [
                      {
                        name: 'pic:blipFill',
                        elements: [
                          {
                            name: 'a:blip',
                            attributes: { 'r:embed': 'rId4' },
                          },
                        ],
                      },
                      {
                        name: 'pic:spPr',
                        elements: [
                          {
                            name: 'a:xfrm',
                            attributes: {
                              rot: '2700000', // 45 degrees
                              flipV: '1',
                              flipH: '1',
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: 'wp:docPr',
            attributes: { id: '4', name: 'Complex Transform' },
          },
        ],
      };

      const mockDocx = {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  attributes: {
                    Id: 'rId4',
                    Target: 'media/complex-image.png',
                  },
                },
              ],
            },
          ],
        },
      };

      // Import
      const params = { docx: mockDocx };
      const importedImage = handleImageImport(mockXmlInput, null, params);

      // Verify all transformations imported correctly
      expect(importedImage.attrs.transformData.rotation).toBe(rotToDegrees('2700000'));
      expect(importedImage.attrs.transformData.verticalFlip).toBe(true);
      expect(importedImage.attrs.transformData.horizontalFlip).toBe(true);
      expect(importedImage.attrs.transformData.sizeExtension.left).toBe(emuToPixels('127000'));
      expect(importedImage.attrs.transformData.sizeExtension.top).toBe(emuToPixels('95250'));
      expect(importedImage.attrs.transformData.sizeExtension.right).toBe(emuToPixels('63500'));
      expect(importedImage.attrs.transformData.sizeExtension.bottom).toBe(emuToPixels('190500'));

      // Export
      const exportedResult = exportSchemaToJson({ node: importedImage, relationships: [] });

      // Navigate to transform elements
      const drawing = exportedResult.elements.find((el) => el.name === 'w:drawing');
      const inline = drawing.elements[0];
      const graphic = inline.elements.find((el) => el.name === 'a:graphic');
      const graphicData = graphic.elements.find((el) => el.name === 'a:graphicData');
      const pic = graphicData.elements.find((el) => el.name === 'pic:pic');
      const spPr = pic.elements.find((el) => el.name === 'pic:spPr');
      const xfrm = spPr.elements.find((el) => el.name === 'a:xfrm');
      const effectExtent = inline.elements.find((el) => el.name === 'wp:effectExtent');

      // Verify all transformations preserved
      expect(Number(xfrm.attributes.rot)).toBe(degreesToRot(45));
      expect(xfrm.attributes.flipV).toBe('1');
      expect(xfrm.attributes.flipH).toBe('1');
      expect(effectExtent.attributes.l).toBe('127000');
      expect(effectExtent.attributes.t).toBe('95250');
      expect(effectExtent.attributes.r).toBe('63500');
      expect(effectExtent.attributes.b).toBe('190500');
    });
  });

  describe('Basic Image Properties Round Trip', () => {
    it('preserves basic image attributes', () => {
      const mockXmlInput = {
        name: 'wp:inline',
        attributes: {
          distT: '190500', // 10px
          distB: '190500', // 10px
          distL: '190500', // 10px
          distR: '190500', // 10px
        },
        elements: [
          {
            name: 'wp:extent',
            attributes: { cx: '4000000', cy: '3000000' },
          },
          {
            name: 'a:graphic',
            elements: [
              {
                name: 'a:graphicData',
                attributes: { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                elements: [
                  {
                    name: 'pic:pic',
                    elements: [
                      {
                        name: 'pic:blipFill',
                        elements: [
                          {
                            name: 'a:blip',
                            attributes: { 'r:embed': 'rId5' },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: 'wp:docPr',
            attributes: { id: '5', name: 'Basic Image', descr: 'Test description' },
          },
        ],
      };

      const mockDocx = {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  attributes: {
                    Id: 'rId5',
                    Target: 'media/basic-image.jpg',
                  },
                },
              ],
            },
          ],
        },
      };

      // Import
      const params = { docx: mockDocx };
      const importedImage = handleImageImport(mockXmlInput, null, params);

      // Verify basic properties
      expect(importedImage.type).toBe('image');
      expect(importedImage.attrs.src).toBe('word/media/basic-image.jpg');
      expect(importedImage.attrs.alt).toBe('Basic Image');
      expect(importedImage.attrs.title).toBe('Test description');
      expect(importedImage.attrs.id).toBe('5');
      expect(importedImage.attrs.rId).toBe('rId5');
      expect(importedImage.attrs.padding.top).toBe(emuToPixels('190500'));
      expect(importedImage.attrs.padding.bottom).toBe(emuToPixels('190500'));
      expect(importedImage.attrs.padding.left).toBe(emuToPixels('190500'));
      expect(importedImage.attrs.padding.right).toBe(emuToPixels('190500'));
      expect(importedImage.attrs.size.width).toBe(emuToPixels('4000000'));
      expect(importedImage.attrs.size.height).toBe(emuToPixels('3000000'));

      // Export
      const exportedResult = exportSchemaToJson({ node: importedImage, relationships: [] });

      // Verify export structure preserves basic properties
      const drawing = exportedResult.elements.find((el) => el.name === 'w:drawing');
      const inline = drawing.elements[0];

      // Check padding preservation in originalPadding attributes
      expect(inline.attributes.distT).toBe('190500');
      expect(inline.attributes.distB).toBe('190500');
      expect(inline.attributes.distL).toBe('190500');
      expect(inline.attributes.distR).toBe('190500');

      // Check size preservation
      const extent = inline.elements.find((el) => el.name === 'wp:extent');
      expect(Number(extent.attributes.cx)).toBe(pixelsToEmu(emuToPixels('4000000')));
      expect(Number(extent.attributes.cy)).toBe(pixelsToEmu(emuToPixels('3000000')));

      // Check docPr preservation
      const docPr = inline.elements.find((el) => el.name === 'wp:docPr');
      expect(docPr.attributes.id).toBe('5');
      expect(docPr.attributes.name).toBe('Basic Image');

      // Check relationship preservation
      const graphic = inline.elements.find((el) => el.name === 'a:graphic');
      const graphicData = graphic.elements.find((el) => el.name === 'a:graphicData');
      const pic = graphicData.elements.find((el) => el.name === 'pic:pic');
      const blipFill = pic.elements.find((el) => el.name === 'pic:blipFill');
      const blip = blipFill.elements.find((el) => el.name === 'a:blip');
      expect(blip.attributes['r:embed']).toBe('rId5');
    });
  });

  describe('Unit Conversion Round Trip', () => {
    it('maintains precision through EMU/pixel/degree conversions', () => {
      const testRotations = [0, 15, 30, 45, 90, 180, 270, -45, 33.5];
      const testEmuValues = ['0', '95250', '190500', '381000', '571500'];

      testRotations.forEach((degrees) => {
        const rot = degreesToRot(degrees);
        const roundTrip = rotToDegrees(rot);
        expect(roundTrip).toBeCloseTo(degrees, 1);
      });

      testEmuValues.forEach((emu) => {
        const pixels = emuToPixels(emu);
        const roundTrip = pixelsToEmu(pixels);
        expect(Math.abs(parseInt(emu) - roundTrip)).toBeLessThan(1000); // Allow small rounding errors
      });
    });

    it('handles edge cases in conversions', () => {
      // Test zero values
      expect(rotToDegrees('0')).toBe(0);
      expect(degreesToRot(0)).toBe(0);
      expect(emuToPixels('0')).toBe(0);
      expect(pixelsToEmu(0)).toBe(0);

      // Test negative rotations
      expect(rotToDegrees('-1800000')).toBe(-30);
      expect(degreesToRot(-30)).toBe(-1800000);

      // Test very small values
      const smallEmuToPixels = emuToPixels('1');
      const smallPixelsToEmu = pixelsToEmu(0.1);

      // These functions might return 0 for very small values due to rounding
      expect(typeof smallEmuToPixels).toBe('number');
      expect(typeof smallPixelsToEmu).toBe('number');
      expect(smallPixelsToEmu).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling in Round Trip', () => {
    it('handles missing transform attributes gracefully', () => {
      const mockXmlInput = {
        name: 'wp:inline',
        attributes: { distT: '0', distB: '0', distL: '0', distR: '0' },
        elements: [
          {
            name: 'wp:extent',
            attributes: { cx: '1000000', cy: '1000000' },
          },
          {
            name: 'a:graphic',
            elements: [
              {
                name: 'a:graphicData',
                attributes: { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                elements: [
                  {
                    name: 'pic:pic',
                    elements: [
                      {
                        name: 'pic:blipFill',
                        elements: [
                          {
                            name: 'a:blip',
                            attributes: { 'r:embed': 'rId6' },
                          },
                        ],
                      },
                      {
                        name: 'pic:spPr',
                        elements: [{}], // Empty xfrm
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: 'wp:docPr',
            attributes: { id: '6', name: 'No Transform' },
          },
        ],
      };

      const mockDocx = {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  attributes: {
                    Id: 'rId6',
                    Target: 'media/no-transform.jpg',
                  },
                },
              ],
            },
          ],
        },
      };

      // Import should not fail
      const params = { docx: mockDocx };
      const importedImage = handleImageImport(mockXmlInput, null, params);

      expect(importedImage).toBeTruthy();
      expect(importedImage.attrs.transformData).toBeDefined();
      expect(importedImage.attrs.transformData.rotation).toBeFalsy();
      expect(importedImage.attrs.transformData.verticalFlip).toBeFalsy();
      expect(importedImage.attrs.transformData.horizontalFlip).toBeFalsy();

      // Export should not fail
      const exportedResult = exportSchemaToJson({ node: importedImage, relationships: [] });
      expect(exportedResult).toBeTruthy();
    });

    it('handles malformed size extension data gracefully', () => {
      const mockXmlInput = {
        name: 'wp:inline',
        attributes: { distT: '0', distB: '0', distL: '0', distR: '0' },
        elements: [
          {
            name: 'wp:extent',
            attributes: { cx: '1000000', cy: '1000000' },
          },
          {
            name: 'wp:effectExtent',
            attributes: { l: 'invalid', t: '', r: null }, // Malformed data
          },
          {
            name: 'a:graphic',
            elements: [
              {
                name: 'a:graphicData',
                attributes: { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' },
                elements: [
                  {
                    name: 'pic:pic',
                    elements: [
                      {
                        name: 'pic:blipFill',
                        elements: [
                          {
                            name: 'a:blip',
                            attributes: { 'r:embed': 'rId7' },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: 'wp:docPr',
            attributes: { id: '7', name: 'Malformed Data' },
          },
        ],
      };

      const mockDocx = {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  attributes: {
                    Id: 'rId7',
                    Target: 'media/malformed.jpg',
                  },
                },
              ],
            },
          ],
        },
      };

      // Import should handle malformed data gracefully
      const params = { docx: mockDocx };
      const importedImage = handleImageImport(mockXmlInput, null, params);

      expect(importedImage).toBeTruthy();
      expect(importedImage.attrs.transformData).toBeDefined();

      // Should handle malformed effectExtent gracefully - might not create sizeExtension
      if (importedImage.attrs.transformData.sizeExtension) {
        expect(importedImage.attrs.transformData.sizeExtension.left).toBe(0);
        expect(importedImage.attrs.transformData.sizeExtension.top).toBe(0);
        expect(importedImage.attrs.transformData.sizeExtension.right).toBe(0);
      }
    });
  });

  describe('doc-with-graphs-diagrams-rotated fixture', () => {
    let docxFixture;
    let importedDoc;
    let imageNodes = [];

    beforeAll(async () => {
      docxFixture = await getTestDataByFileName('doc-with-graphs-diagrams-rotated.docx');
      const converter = {
        headers: {},
        headerIds: {},
        footers: {},
        footerIds: {},
      };
      const editor = { options: {}, emit: () => {} };
      const result = createDocumentJson(docxFixture, converter, editor);
      importedDoc = result.pmDoc;
      imageNodes = [];

      const walk = (node) => {
        if (!node) return;
        if (node.type === 'image') imageNodes.push(node);
        node.content?.forEach(walk);
      };

      walk(importedDoc);
    });

    it('imports rotation metadata for rotated images', () => {
      expect(imageNodes.length).toBeGreaterThan(0);
      const rotated = imageNodes.filter((img) => !!img.attrs?.transformData?.rotation);
      expect(rotated.length).toBeGreaterThan(0);
      rotated.forEach((img) => {
        expect(img.attrs.transformData.rotation).not.toBe(0);
      });
    });

    it('round-trips rotation data through export and reimport', () => {
      const rotated = imageNodes.filter((img) => !!img.attrs?.transformData?.rotation);
      expect(rotated.length).toBeGreaterThan(0);

      rotated.forEach((imageNode) => {
        const exported = exportSchemaToJson({ node: imageNode, relationships: [] });
        const drawing = exported.elements.find((el) => el.name === 'w:drawing');
        expect(drawing).toBeTruthy();

        const container = drawing.elements.find((el) => el.name === 'wp:inline' || el.name === 'wp:anchor');
        expect(container).toBeTruthy();

        const effectExtent = container.elements.find((el) => el.name === 'wp:effectExtent');
        expect(effectExtent).toBeTruthy();

        const graphic = container.elements.find((el) => el.name === 'a:graphic');
        const graphicData = graphic.elements.find((el) => el.name === 'a:graphicData');
        const pic = graphicData.elements.find((el) => el.name === 'pic:pic');
        const spPr = pic.elements.find((el) => el.name === 'pic:spPr');
        const xfrm = spPr.elements.find((el) => el.name === 'a:xfrm');
        expect(xfrm).toBeTruthy();

        const { originalDrawingChildren, transformData = {} } = imageNode.attrs;
        if (transformData.rotation) {
          expect(Number(xfrm.attributes.rot)).toBe(degreesToRot(transformData.rotation));
        }
        if (transformData.verticalFlip) {
          expect(xfrm.attributes.flipV).toBe('1');
        } else {
          expect(xfrm.attributes.flipV).toBeUndefined();
        }
        if (transformData.horizontalFlip) {
          expect(xfrm.attributes.flipH).toBe('1');
        } else {
          expect(xfrm.attributes.flipH).toBeUndefined();
        }

        const expectedSizeExtension = transformData.sizeExtension ?? { left: 0, top: 0, right: 0, bottom: 0 };
        const expectedExtent = originalDrawingChildren.find((el) => el.xml.name === 'wp:effectExtent')?.xml;

        expect(effectExtent.attributes.l).toBe(
          expectedExtent?.attributes?.l ?? pixelsToEmu(expectedSizeExtension.left ?? 0),
        );
        expect(effectExtent.attributes.t).toBe(
          expectedExtent?.attributes?.t ?? pixelsToEmu(expectedSizeExtension.top ?? 0),
        );
        expect(effectExtent.attributes.r).toBe(
          expectedExtent?.attributes?.r ?? pixelsToEmu(expectedSizeExtension.right ?? 0),
        );
        expect(effectExtent.attributes.b).toBe(
          expectedExtent?.attributes?.b ?? pixelsToEmu(expectedSizeExtension.bottom ?? 0),
        );

        const reimported = handleImageImport(container, 'document.xml', { docx: docxFixture });
        expect(reimported).toBeTruthy();
        expect(reimported.attrs.transformData.rotation).toBe(transformData.rotation);
        expect(reimported.attrs.transformData.verticalFlip).toBe(!!transformData.verticalFlip);
        expect(reimported.attrs.transformData.horizontalFlip).toBe(!!transformData.horizontalFlip);

        if (transformData.sizeExtension) {
          expect(reimported.attrs.transformData.sizeExtension).toEqual(
            expect.objectContaining({
              left: transformData.sizeExtension.left ?? 0,
              top: transformData.sizeExtension.top ?? 0,
              right: transformData.sizeExtension.right ?? 0,
              bottom: transformData.sizeExtension.bottom ?? 0,
            }),
          );
        }
      });
    });
  });
});
