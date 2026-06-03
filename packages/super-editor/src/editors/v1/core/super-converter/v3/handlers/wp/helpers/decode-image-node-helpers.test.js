import {
  translateImageNode,
  translateVectorShape,
} from '@converter/v3/handlers/wp/helpers/decode-image-node-helpers.js';
import * as helpers from '@converter/helpers.js';
import * as annotationHelpers from '@converter/v3/handlers/w/sdt/helpers/translate-field-annotation.js';
import * as coreHelpers from '@core/helpers/index.js';

vi.mock('@converter/helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emuToPixels: vi.fn((v) => v / 9525), // 1 emu ≈ 1/9525 px
    pixelsToEmu: vi.fn((v) => v * 9525),
    getTextIndentExportValue: vi.fn((v) => v),
    inchesToTwips: vi.fn((v) => v),
    linesToTwips: vi.fn((v) => v),
    pixelsToEightPoints: vi.fn((v) => v),
    pixelsToTwips: vi.fn((v) => v),
    ptToTwips: vi.fn((v) => v),
    rgbToHex: vi.fn(() => '#000000'),
    degreesToRot: vi.fn((v) => v),
  };
});

vi.mock('@converter/v3/handlers/w/sdt/helpers/translate-field-annotation.js', () => ({
  prepareTextAnnotation: vi.fn(() => ({ type: 'text', text: 'annotation' })),
}));

vi.mock('@converter/image-dimensions.js', () => ({
  readImageDimensionsFromDataUri: vi.fn(() => null),
}));

vi.mock(import('@core/helpers/index.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateDocxRandomId: vi.fn(() => '123'),
  };
});

vi.mock('@core/utilities/hash.js', () => ({
  simpleStringHash: vi.fn(() => '123'),
}));

describe('translateImageNode', () => {
  let baseParams;

  beforeEach(() => {
    baseParams = {
      node: {
        type: 'image',
        attrs: {
          src: 'word/media/test.png',
          size: { width: 100, height: 50 },
          id: 1,
        },
      },
      relationships: [],
      media: {},
      converter: {
        convertedXml: {
          'word/_rels/document.xml.rels': {
            elements: [{ name: 'Relationships', elements: [] }],
          },
        },
        addedMedia: {},
        media: {},
      },
    };
    vi.clearAllMocks();
  });

  it('should convert basic image node with size to wp:extent', () => {
    const result = translateImageNode(baseParams);

    expect(result.elements.find((e) => e.name === 'wp:extent').attributes).toEqual({
      cx: helpers.pixelsToEmu(100),
      cy: helpers.pixelsToEmu(50),
    });
    expect(result.attributes).toEqual({
      distT: 0,
      distB: 0,
      distL: 0,
      distR: 0,
    });
  });

  it('should reuse given rId if provided', () => {
    baseParams.node.attrs.rId = 'rId999';
    baseParams.converter.convertedXml['word/_rels/document.xml.rels'].elements[0].elements.push({
      type: 'element',
      name: 'Relationship',
      attributes: {
        Id: 'rId999',
        Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
        Target: '',
      },
    });

    const result = translateImageNode(baseParams);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');

    expect(blip.attributes['r:embed']).toBe('rId999');
    expect(baseParams.relationships.length).toBe(0);
  });

  it('should generate a new relationship if rId is missing', () => {
    const result = translateImageNode(baseParams);

    expect(baseParams.relationships.length).toBe(1);
    expect(baseParams.relationships[0].attributes.Type).toContain('relationships/image');
    expect(result.elements).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'a:graphic' })]));
  });

  it('should register data URI image media when rId is missing', () => {
    const src = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    baseParams.node.attrs = {
      src,
      alt: 'Signature Example',
      size: { width: 200, height: 50 },
    };

    const result = translateImageNode(baseParams);

    expect(baseParams.relationships).toHaveLength(1);
    const target = baseParams.relationships[0].attributes.Target;
    expect(target).toMatch(/^media\/image-\d+\.svg$/);
    expect(baseParams.media[`word/${target}`]).toBe(src);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');
    expect(blip.attributes['r:embed']).toBe(baseParams.relationships[0].attributes.Id);
  });

  it('should reuse data URI image media and relationship for duplicate payloads', () => {
    const src = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    baseParams.node.attrs = {
      src,
      alt: 'Signature Example',
      size: { width: 200, height: 50 },
    };

    const firstResult = translateImageNode(baseParams);
    const secondResult = translateImageNode(baseParams);

    expect(baseParams.relationships).toHaveLength(1);
    expect(Object.keys(baseParams.media)).toEqual([`word/${baseParams.relationships[0].attributes.Target}`]);

    const firstBlip = firstResult.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');
    const secondBlip = secondResult.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');
    expect(secondBlip.attributes['r:embed']).toBe(firstBlip.attributes['r:embed']);
  });

  it('should reuse the same collision media target for repeated data URI payloads', () => {
    const firstSrc = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    const collidingSrc = 'data:image/svg+xml;base64,PHN2ZyBpZD0iMiI+PC9zdmc+';
    baseParams.node.attrs = {
      src: firstSrc,
      alt: 'First Image',
      size: { width: 20, height: 10 },
    };
    translateImageNode(baseParams);

    vi.mocked(coreHelpers.generateDocxRandomId).mockClear();
    baseParams.node.attrs = {
      src: collidingSrc,
      alt: 'Colliding Image',
      size: { width: 20, height: 10 },
    };

    translateImageNode(baseParams);
    translateImageNode(baseParams);

    expect(Object.keys(baseParams.media).sort()).toEqual(['word/media/image-123.svg', 'word/media/image-123_123.svg']);
    expect(baseParams.relationships.map((rel) => rel.attributes.Target)).toEqual([
      'media/image-123.svg',
      'media/image-123_123.svg',
    ]);
    expect(vi.mocked(coreHelpers.generateDocxRandomId).mock.calls.filter(([length]) => length === 8)).toHaveLength(1);
  });

  it('should create a media target when a data URI image already has an rId', () => {
    const src = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    baseParams.node.attrs = {
      src,
      rId: 'rIdExisting',
      alt: 'Signature Example',
      size: { width: 200, height: 50 },
    };

    translateImageNode(baseParams);

    expect(baseParams.relationships).toHaveLength(1);
    expect(baseParams.relationships[0].attributes).toMatchObject({
      Id: 'rIdExisting',
      Target: expect.stringMatching(/^media\/.+\.svg$/),
    });
    expect(baseParams.relationships[0].attributes.Target).not.toBeUndefined();
    expect(baseParams.media[`word/${baseParams.relationships[0].attributes.Target}`]).toBe(src);
  });

  it('should not add duplicate relationships for repeated data URI image rIds', () => {
    const src = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    baseParams.node.attrs = {
      src,
      rId: 'rIdExisting',
      alt: 'Signature Example',
      size: { width: 200, height: 50 },
    };

    translateImageNode(baseParams);
    translateImageNode(baseParams);

    expect(baseParams.relationships).toHaveLength(1);
    expect(baseParams.relationships[0].attributes).toMatchObject({
      Id: 'rIdExisting',
      Target: expect.stringMatching(/^media\/.+\.svg$/),
    });
  });

  it('should register raster data URI image media when rId is missing', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    baseParams.node.attrs = {
      src,
      alt: 'Raster Example',
      size: { width: 20, height: 10 },
    };

    const result = translateImageNode(baseParams);

    expect(baseParams.relationships).toHaveLength(1);
    const target = baseParams.relationships[0].attributes.Target;
    expect(target).toMatch(/^media\/image-\d+\.png$/);
    expect(baseParams.media[`word/${target}`]).toBe(src);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');
    expect(blip.attributes['r:embed']).toBe(baseParams.relationships[0].attributes.Id);
  });

  it('should reuse document relationship by target when image rId is missing', () => {
    baseParams.node.attrs = {
      src: 'word/media/test.png',
      size: { width: 100, height: 50 },
    };
    baseParams.converter.convertedXml['word/_rels/document.xml.rels'].elements[0].elements.push({
      type: 'element',
      name: 'Relationship',
      attributes: {
        Id: 'rIdDocumentImage',
        Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
        Target: 'media/test.png',
      },
    });

    const result = translateImageNode(baseParams);

    expect(baseParams.relationships).toHaveLength(0);
    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');
    expect(blip.attributes['r:embed']).toBe('rIdDocumentImage');
  });

  it('should not export non-base64 raster data URI media', () => {
    baseParams.node.attrs = {
      src: 'data:image/png,not-base64',
      alt: 'Raster Example',
      size: { width: 20, height: 10 },
    };

    const result = translateImageNode(baseParams);

    expect(result).toBeNull();
    expect(baseParams.relationships).toHaveLength(0);
    expect(baseParams.media).toEqual({});
  });

  it('should not export malformed base64 image data URI media', () => {
    baseParams.node.attrs = {
      src: 'data:image/png;base64,%%%',
      alt: 'Malformed Image',
      size: { width: 20, height: 10 },
    };

    const result = translateImageNode(baseParams);

    expect(result).toBeNull();
    expect(baseParams.relationships).toHaveLength(0);
    expect(baseParams.media).toEqual({});
  });

  it('should not export non-image data URI media', () => {
    baseParams.node.attrs = {
      src: 'data:text/html,%3Cscript%3Ealert(1)%3C%2Fscript%3E',
      alt: 'HTML Example',
      size: { width: 20, height: 10 },
    };

    const result = translateImageNode(baseParams);

    expect(result).toBeNull();
    expect(baseParams.relationships).toHaveLength(0);
    expect(baseParams.media).toEqual({});
  });

  it('should not create a corrupt relationship when image src is null', () => {
    baseParams.node.attrs = {
      src: null,
      rId: 'rIdMissingSrc',
      size: { width: 200, height: 50 },
    };

    const result = translateImageNode(baseParams);

    expect(result).toBeNull();
    expect(baseParams.relationships).toHaveLength(0);
    expect(baseParams.media).toEqual({});
  });

  it('should skip data URI image export when no media target can be created', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    baseParams.node.attrs = {
      src: 'data:,payload',
      size: { width: 200, height: 50 },
    };

    const result = translateImageNode(baseParams);

    expect(result).toBeNull();
    expect(baseParams.relationships).toHaveLength(0);
    expect(baseParams.media).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      'Skipping image export because media target could not be resolved.',
      expect.objectContaining({ nodeType: 'image', src: 'data:,payload' }),
    );
    warn.mockRestore();
  });

  it('should not add an existing image rId relationship when data URI media target is invalid', () => {
    baseParams.node.attrs = {
      src: 'data:,payload',
      rId: 'rIdInvalidData',
      size: { width: 200, height: 50 },
    };

    const result = translateImageNode(baseParams);

    expect(result).toBeNull();
    expect(baseParams.relationships).toHaveLength(0);
    expect(baseParams.media).toEqual({});
  });

  it('should fall back to text for fieldAnnotation with rId and invalid data URI media target', () => {
    const params = {
      ...baseParams,
      node: {
        type: 'fieldAnnotation',
        attrs: {
          src: 'data:,payload',
          rId: 'rIdInvalidData',
          size: { width: 200, height: 50 },
        },
      },
    };

    const result = translateImageNode(params);

    expect(annotationHelpers.prepareTextAnnotation).toHaveBeenCalledWith(params);
    expect(result).toEqual({ type: 'text', text: 'annotation' });
    expect(params.relationships).toHaveLength(0);
    expect(params.media).toEqual({});
  });

  it('should use clamped fallback size (1 EMU) when attrs.size is empty', () => {
    baseParams.node.attrs.size = {};

    const result = translateImageNode(baseParams);

    const extent = result.elements.find((e) => e.name === 'wp:extent').attributes;
    // resolveExportSize clamps non-finite values to 1 EMU to prevent corrupt OOXML
    expect(extent.cx).toBe(1);
    expect(extent.cy).toBe(1);
  });

  it('should generate a new relationship if rId is presented but relation is missing', () => {
    baseParams.node.attrs.rId = 'rId123';
    translateImageNode(baseParams);
    expect(baseParams.relationships).toHaveLength(1);
    expect(baseParams.relationships[0].attributes.Id).toBe('rId123');
  });

  it('should reuse header/footer existingRelationships for image rIds', () => {
    baseParams.isHeaderFooter = true;
    baseParams.node.attrs.rId = 'rIdHeaderImage';
    baseParams.existingRelationships = [
      {
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: 'rIdHeaderImage',
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
          Target: 'media/test.png',
        },
      },
    ];

    const result = translateImageNode(baseParams);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');

    expect(blip.attributes['r:embed']).toBe('rIdHeaderImage');
    expect(baseParams.relationships).toHaveLength(0);
  });

  it('should match image relationships by rId when id and target disagree', () => {
    baseParams.isHeaderFooter = true;
    baseParams.node.attrs.rId = 'rId1';
    baseParams.node.attrs.src = 'word/media/other.png';
    baseParams.existingRelationships = [
      {
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: 'rId1',
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
          Target: 'media/expected.png',
        },
      },
      {
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: 'rId2',
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
          Target: 'media/other.png',
        },
      },
    ];

    const result = translateImageNode(baseParams);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');

    expect(blip.attributes['r:embed']).toBe('rId1');
    expect(baseParams.relationships).toHaveLength(0);
  });

  it('should call prepareTextAnnotation for fieldAnnotation without type', () => {
    const params = {
      ...baseParams,
      node: {
        type: 'fieldAnnotation',
        attrs: { src: 'data:;base64,' },
      },
    };

    const result = translateImageNode(params);
    expect(annotationHelpers.prepareTextAnnotation).toHaveBeenCalledWith(params);
    expect(result).toEqual({ type: 'text', text: 'annotation' });
  });

  it('should export fieldAnnotation SVG data URI media with svg extension', () => {
    const src = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    baseParams.node = {
      type: 'fieldAnnotation',
      attrs: {
        fieldId: 'signatureField',
        hash: 'signatureHash',
        src,
        size: { width: 200, height: 50 },
      },
    };

    const result = translateImageNode(baseParams);

    expect(baseParams.relationships).toHaveLength(1);
    expect(baseParams.relationships[0].attributes.Target).toBe('media/signatureField_signatureHash.svg');
    expect(baseParams.media['word/media/signatureField_signatureHash.svg']).toBe(src);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');
    expect(blip.attributes['r:embed']).toBe(baseParams.relationships[0].attributes.Id);
  });

  it('should fall back to text for fieldAnnotation with non-base64 raster data URI', () => {
    const params = {
      ...baseParams,
      node: {
        type: 'fieldAnnotation',
        attrs: {
          fieldId: 'signatureField',
          hash: 'signatureHash',
          src: 'data:image/png,not-base64',
          size: { width: 200, height: 50 },
        },
      },
    };

    const result = translateImageNode(params);

    expect(annotationHelpers.prepareTextAnnotation).toHaveBeenCalledWith(params);
    expect(result).toEqual({ type: 'text', text: 'annotation' });
    expect(params.relationships).toHaveLength(0);
    expect(params.media).toEqual({});
  });

  it('should fall back to text for fieldAnnotation with malformed non-base64 SVG data URI', () => {
    const params = {
      ...baseParams,
      node: {
        type: 'fieldAnnotation',
        attrs: {
          fieldId: 'signatureField',
          hash: 'signatureHash',
          src: 'data:image/svg+xml,%',
          size: { width: 200, height: 50 },
        },
      },
    };

    const result = translateImageNode(params);

    expect(annotationHelpers.prepareTextAnnotation).toHaveBeenCalledWith(params);
    expect(result).toEqual({ type: 'text', text: 'annotation' });
    expect(params.relationships).toHaveLength(0);
    expect(params.media).toEqual({});
  });

  it('should resize images inside tableCell to maxWidth', () => {
    baseParams.node.attrs.size = { width: 500, height: 500 };
    baseParams.tableCell = {
      attrs: { colwidth: [200, 200], cellMargins: { left: 10, right: 10 } },
    };

    const result = translateImageNode(baseParams);

    const extent = result.elements.find((e) => e.name === 'wp:extent').attributes;
    expect(extent.cx).toBeLessThan(helpers.pixelsToEmu(500));
  });

  it('should export grayscale effect when present', () => {
    baseParams.node.attrs.grayscale = true;

    const result = translateImageNode(baseParams);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');

    expect(blip.elements).toBeDefined();
    expect(blip.elements).toEqual([{ name: 'a:grayscl' }]);
  });

  it('should export luminance adjustment when present', () => {
    baseParams.node.attrs.lum = { bright: 70000, contrast: -70000 };

    const result = translateImageNode(baseParams);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');

    expect(blip.elements).toEqual([{ name: 'a:lum', attributes: { bright: 70000, contrast: -70000 } }]);
  });

  it('should export grayscale and luminance adjustment together when both are present', () => {
    baseParams.node.attrs.grayscale = true;
    baseParams.node.attrs.lum = { bright: 70000, contrast: -70000 };

    const result = translateImageNode(baseParams);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');

    expect(blip.elements).toEqual([
      { name: 'a:grayscl' },
      { name: 'a:lum', attributes: { bright: 70000, contrast: -70000 } },
    ]);
  });

  it('should not export grayscale element when not present', () => {
    const result = translateImageNode(baseParams);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');

    expect(blip.elements).toBeUndefined();
  });

  it('should emit a:hlinkClick and push hyperlink relationship to params.relationships', () => {
    baseParams.node.attrs.hyperlink = { url: 'https://example.com', tooltip: 'Go' };

    const result = translateImageNode(baseParams);

    // Relationship pushed to part-local array (not hardcoded to document.xml.rels)
    const hlinkRel = baseParams.relationships.find(
      (r) => r.attributes.Type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    );
    expect(hlinkRel).toBeDefined();
    expect(hlinkRel.attributes.Target).toBe('https://example.com');
    expect(hlinkRel.attributes.TargetMode).toBe('External');

    // a:hlinkClick element present inside pic:cNvPr
    const graphic = result.elements.find((e) => e.name === 'a:graphic');
    const picPic = graphic.elements[0].elements[0]; // pic:pic
    const nvPicPr = picPic.elements.find((e) => e.name === 'pic:nvPicPr');
    const cNvPr = nvPicPr.elements.find((e) => e.name === 'pic:cNvPr');
    const hlinkClick = cNvPr.elements.find((e) => e.name === 'a:hlinkClick');
    expect(hlinkClick).toBeDefined();
    expect(hlinkClick.attributes['r:id']).toBe(hlinkRel.attributes.Id);
    expect(hlinkClick.attributes.tooltip).toBe('Go');
  });

  it('should not emit a:hlinkClick when hyperlink is absent', () => {
    const result = translateImageNode(baseParams);

    const graphic = result.elements.find((e) => e.name === 'a:graphic');
    const picPic = graphic.elements[0].elements[0];
    const nvPicPr = picPic.elements.find((e) => e.name === 'pic:nvPicPr');
    const cNvPr = nvPicPr.elements.find((e) => e.name === 'pic:cNvPr');
    const hlinkClick = cNvPr?.elements?.find((e) => e.name === 'a:hlinkClick');
    expect(hlinkClick).toBeUndefined();
  });

  it('should emit a:hlinkClick in wp:docPr (Word canonical placement)', () => {
    baseParams.node.attrs.hyperlink = { url: 'https://example.com', tooltip: 'Visit' };

    const result = translateImageNode(baseParams);

    const docPr = result.elements.find((e) => e.name === 'wp:docPr');
    const hlinkClick = docPr.elements?.find((e) => e.name === 'a:hlinkClick');
    expect(hlinkClick).toBeDefined();
    expect(hlinkClick.attributes['r:id']).toBeDefined();
    expect(hlinkClick.attributes.tooltip).toBe('Visit');
  });

  it('should use same rId for a:hlinkClick in both wp:docPr and pic:cNvPr', () => {
    baseParams.node.attrs.hyperlink = { url: 'https://example.com' };

    const result = translateImageNode(baseParams);

    const docPr = result.elements.find((e) => e.name === 'wp:docPr');
    const docPrHlink = docPr.elements?.find((e) => e.name === 'a:hlinkClick');

    const graphic = result.elements.find((e) => e.name === 'a:graphic');
    const picPic = graphic.elements[0].elements[0];
    const nvPicPr = picPic.elements.find((e) => e.name === 'pic:nvPicPr');
    const cNvPr = nvPicPr.elements.find((e) => e.name === 'pic:cNvPr');
    const cNvPrHlink = cNvPr.elements?.find((e) => e.name === 'a:hlinkClick');

    expect(docPrHlink).toBeDefined();
    expect(cNvPrHlink).toBeDefined();
    // Both should reference the exact same relationship ID
    expect(docPrHlink.attributes['r:id']).toBe(cNvPrHlink.attributes['r:id']);
    // Only one hyperlink relationship should be created
    const hlinkRels = baseParams.relationships.filter(
      (r) => r.attributes.Type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    );
    expect(hlinkRels).toHaveLength(1);
  });

  it('should not emit a:hlinkClick in wp:docPr when no hyperlink', () => {
    const result = translateImageNode(baseParams);

    const docPr = result.elements.find((e) => e.name === 'wp:docPr');
    const hlinkClick = docPr?.elements?.find((e) => e.name === 'a:hlinkClick');
    expect(hlinkClick).toBeUndefined();
  });

  describe('noChangeAspect export', () => {
    it('should emit noChangeAspect=1 in a:picLocks when lockAspectRatio is true', () => {
      baseParams.node.attrs.lockAspectRatio = true;

      const result = translateImageNode(baseParams);

      const graphic = result.elements.find((e) => e.name === 'a:graphic');
      const picPic = graphic.elements[0].elements[0];
      const nvPicPr = picPic.elements.find((e) => e.name === 'pic:nvPicPr');
      const cNvPicPr = nvPicPr.elements.find((e) => e.name === 'pic:cNvPicPr');
      const picLocks = cNvPicPr.elements.find((e) => e.name === 'a:picLocks');
      expect(picLocks.attributes.noChangeAspect).toBe(1);
    });

    it('should NOT emit noChangeAspect in a:picLocks when lockAspectRatio is false', () => {
      baseParams.node.attrs.lockAspectRatio = false;

      const result = translateImageNode(baseParams);

      const graphic = result.elements.find((e) => e.name === 'a:graphic');
      const picPic = graphic.elements[0].elements[0];
      const nvPicPr = picPic.elements.find((e) => e.name === 'pic:nvPicPr');
      const cNvPicPr = nvPicPr.elements.find((e) => e.name === 'pic:cNvPicPr');
      const picLocks = cNvPicPr.elements.find((e) => e.name === 'a:picLocks');
      expect(picLocks.attributes.noChangeAspect).toBeUndefined();
      // noChangeArrowheads should still be present
      expect(picLocks.attributes.noChangeArrowheads).toBe(1);
    });

    it('should NOT emit noChangeAspect in a:picLocks when lockAspectRatio is undefined', () => {
      // lockAspectRatio not set at all
      delete baseParams.node.attrs.lockAspectRatio;

      const result = translateImageNode(baseParams);

      const graphic = result.elements.find((e) => e.name === 'a:graphic');
      const picPic = graphic.elements[0].elements[0];
      const nvPicPr = picPic.elements.find((e) => e.name === 'pic:nvPicPr');
      const cNvPicPr = nvPicPr.elements.find((e) => e.name === 'pic:cNvPicPr');
      const picLocks = cNvPicPr.elements.find((e) => e.name === 'a:picLocks');
      expect(picLocks.attributes.noChangeAspect).toBeUndefined();
    });

    it('should NOT emit noChangeAspect in a:graphicFrameLocks when lockAspectRatio is false', () => {
      baseParams.node.attrs.lockAspectRatio = false;

      const result = translateImageNode(baseParams);

      const framePr = result.elements.find((e) => e.name === 'wp:cNvGraphicFramePr');
      const frameLocks = framePr.elements.find((e) => e.name === 'a:graphicFrameLocks');
      expect(frameLocks.attributes.noChangeAspect).toBeUndefined();
    });

    it('should emit noChangeAspect=1 in a:graphicFrameLocks when lockAspectRatio is true', () => {
      baseParams.node.attrs.lockAspectRatio = true;

      const result = translateImageNode(baseParams);

      const framePr = result.elements.find((e) => e.name === 'wp:cNvGraphicFramePr');
      const frameLocks = framePr.elements.find((e) => e.name === 'a:graphicFrameLocks');
      expect(frameLocks.attributes.noChangeAspect).toBe(1);
    });
  });
});

describe('translateVectorShape', () => {
  it('wraps exported vector shapes in a run', () => {
    const params = {
      node: {
        type: 'vectorShape',
        attrs: {
          drawingContent: {
            elements: [{ name: 'wps:wsp' }],
          },
        },
      },
    };

    const result = translateVectorShape(params);

    expect(result?.name).toBe('w:r');
    expect(result?.elements?.[0]).toMatchObject({ name: 'mc:AlternateContent' });
    const choice = result?.elements?.[0]?.elements?.[0];
    expect(choice).toMatchObject({
      name: 'mc:Choice',
      attributes: { Requires: 'wps' },
    });
    const drawing = choice?.elements?.[0];
    expect(drawing?.name).toBe('w:drawing');
    expect(drawing?.elements).toEqual([{ name: 'wps:wsp' }]);
  });
});
