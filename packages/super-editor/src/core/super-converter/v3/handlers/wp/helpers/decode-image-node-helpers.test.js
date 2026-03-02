import {
  translateImageNode,
  translateVectorShape,
} from '@converter/v3/handlers/wp/helpers/decode-image-node-helpers.js';
import * as helpers from '@converter/helpers.js';
import * as annotationHelpers from '@converter/v3/handlers/w/sdt/helpers/translate-field-annotation.js';

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

vi.mock(import('@core/helpers/index.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateDocxRandomId: vi.fn(() => '123'),
  };
});

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

  it('should generate a new relationship if rId is presented but relation is missing', () => {
    baseParams.node.attrs.rId = 'rId123';
    translateImageNode(baseParams);
    expect(baseParams.relationships).toHaveLength(1);
    expect(baseParams.relationships[0].attributes.Id).toBe('rId123');
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

  it('should not export grayscale element when not present', () => {
    const result = translateImageNode(baseParams);

    const blip = result.elements
      .find((e) => e.name === 'a:graphic')
      .elements[0].elements[0].elements.find((e) => e.name === 'pic:blipFill')
      .elements.find((e) => e.name === 'a:blip');

    expect(blip.elements).toBeUndefined();
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
