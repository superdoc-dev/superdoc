import { describe, it, expect } from 'vitest';
import { handleShapeImageWatermarkImport } from './handle-shape-image-watermark-import';

describe('handleShapeImageWatermarkImport', () => {
  const createMockDocx = (relTarget = 'media/image1.png') => ({
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
                Target: relTarget,
              },
            },
          ],
        },
      ],
    },
  });

  const createWatermarkPict = (
    rId = 'rId1',
    style = 'position:absolute;width:466.55pt;height:233.25pt;z-index:-251653120',
  ) => ({
    elements: [
      {
        name: 'v:shape',
        attributes: {
          id: 'WordPictureWatermark100927634',
          'o:spid': '_x0000_s1027',
          type: '#_x0000_t75',
          alt: '',
          style,
          'o:allowincell': 'f',
        },
        elements: [
          {
            name: 'v:imagedata',
            attributes: {
              'r:id': rId,
              'o:title': 'Balloons',
              gain: '19661f',
              blacklevel: '22938f',
            },
          },
        ],
      },
    ],
  });

  it('should import a VML watermark image with all attributes', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = createWatermarkPict();

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result).toEqual({
      type: 'image',
      attrs: expect.objectContaining({
        isPict: true,
        src: 'word/media/image1.png',
        alt: 'Balloons',
        title: 'Balloons',
        extension: 'png',
        rId: 'rId1',
        vmlWatermark: true,
        isAnchor: true,
        inline: false,
        wrap: {
          type: 'None',
          attrs: {
            behindDoc: true,
          },
        },
        size: expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
        }),
        gain: '19661f',
        blacklevel: '22938f',
      }),
    });
  });

  it('should handle watermark with center positioning', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const style =
      'position:absolute;margin-left:0;margin-top:0;width:466.55pt;height:233.25pt;z-index:-251653120;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin';
    const pict = createWatermarkPict('rId1', style);

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result.attrs.anchorData).toEqual({
      hRelativeFrom: 'margin',
      vRelativeFrom: 'margin',
      alignH: 'center',
      alignV: 'center',
    });
  });

  it('should treat z-index 0 as not behind the document', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const style = 'position:absolute;width:466.55pt;height:233.25pt;z-index:0';
    const pict = createWatermarkPict('rId1', style);

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result.attrs.wrap.attrs.behindDoc).toBe(false);
  });

  it('should parse dimensions from VML style', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = createWatermarkPict();

    const result = handleShapeImageWatermarkImport({ params, pict });

    // 466.55pt = 466.55 * (96/72) ≈ 622.07 pixels
    // 233.25pt = 233.25 * (96/72) ≈ 311.00 pixels
    expect(result.attrs.size.width).toBeCloseTo(622.07, 1);
    expect(result.attrs.size.height).toBeCloseTo(311.0, 1);
  });

  it('should preserve VML attributes for round-tripping', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = createWatermarkPict();

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result.attrs.vmlAttributes).toEqual(
      expect.objectContaining({
        id: 'WordPictureWatermark100927634',
        'o:spid': '_x0000_s1027',
        type: '#_x0000_t75',
      }),
    );
    expect(result.attrs.vmlImagedata).toEqual(
      expect.objectContaining({
        'r:id': 'rId1',
        'o:title': 'Balloons',
        gain: '19661f',
        blacklevel: '22938f',
      }),
    );
  });

  it('should return null if v:shape is missing', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = { elements: [] };

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result).toBeNull();
  });

  it('should return null if v:imagedata is missing', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = {
      elements: [
        {
          name: 'v:shape',
          attributes: {},
          elements: [],
        },
      ],
    };

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result).toBeNull();
  });

  it('should return null if r:id is missing', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = {
      elements: [
        {
          name: 'v:shape',
          attributes: {},
          elements: [
            {
              name: 'v:imagedata',
              attributes: {},
            },
          ],
        },
      ],
    };

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result).toBeNull();
  });

  it('should return null if relationship is not found', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = createWatermarkPict('rIdNonExistent');

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result).toBeNull();
  });

  it('should fallback to document.xml.rels if header rels not found', () => {
    const params = {
      docx: {
        'word/_rels/document.xml.rels': {
          elements: [
            {
              name: 'Relationships',
              elements: [
                {
                  name: 'Relationship',
                  attributes: {
                    Id: 'rId1',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
                    Target: 'media/fallback.png',
                  },
                },
              ],
            },
          ],
        },
      },
      filename: 'header1.xml',
    };
    const pict = createWatermarkPict();

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result.attrs.src).toBe('word/media/fallback.png');
  });

  it('should handle different image formats', () => {
    const params = {
      docx: createMockDocx('media/watermark.jpg'),
      filename: 'header1.xml',
    };
    const pict = createWatermarkPict();

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result.attrs.src).toBe('word/media/watermark.jpg');
    expect(result.attrs.extension).toBe('jpg');
  });

  it('should handle missing optional attributes gracefully', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = {
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

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result).not.toBeNull();
    expect(result.attrs.gain).toBeUndefined();
    expect(result.attrs.blacklevel).toBeUndefined();
    expect(result.attrs.alt).toBe('Watermark'); // Default value
  });

  it('keeps imported watermark image schema-valid when pict has extra children', () => {
    const params = {
      docx: createMockDocx(),
      filename: 'header1.xml',
    };
    const pict = createWatermarkPict();
    pict.elements.push({
      name: 'v:shapetype',
      attributes: {
        id: '_x0000_t75',
      },
    });

    const result = handleShapeImageWatermarkImport({ params, pict });

    expect(result).not.toBeNull();
    expect(result.type).toBe('image');
    expect(result.content).toBeUndefined();
  });
});
