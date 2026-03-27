import { describe, it, expect } from 'vitest';
import { translateInlineNode } from '@core/super-converter/v3/handlers/wp/inline/helpers/translate-inline-node.js';
import { translateAnchorNode } from '@core/super-converter/v3/handlers/wp/anchor/helpers/translate-anchor-node.js';
import { translateImageNode } from '@core/super-converter/v3/handlers/wp/helpers/decode-image-node-helpers.js';

/** Helper to build minimal params for translateImageNode / translateInlineNode */
function makeImageParams(overrides = {}) {
  return {
    node: {
      type: 'image',
      attrs: {
        src: 'word/media/image1.png',
        size: { width: 64, height: 64 },
        ...overrides,
      },
    },
    media: {},
    relationships: [],
    converter: { convertedXml: {} },
  };
}

describe('translateInlineNode guard', () => {
  it('returns wp:inline for valid image nodes', () => {
    const result = translateInlineNode(makeImageParams());

    expect(result).toBeTruthy();
    expect(result.name).toBe('wp:inline');
    expect(result.elements.some((el) => el.name === 'wp:extent')).toBe(true);
  });

  it('returns text run when signature fallback produces no drawing', () => {
    const params = {
      node: {
        type: 'fieldAnnotation',
        attrs: {
          type: 'signature',
          src: 'data:,',
          displayLabel: 'Signature',
        },
      },
      media: {},
      relationships: [],
      converter: { convertedXml: {} },
      editor: { extensionService: { extensions: [] } },
    };

    const result = translateInlineNode(params);

    expect(result).toBeTruthy();
    expect(result.name).toBe('w:r');
  });
});

describe('translateAnchorNode guard', () => {
  it('returns text run when signature fallback produces no drawing', () => {
    const params = {
      node: {
        type: 'fieldAnnotation',
        attrs: {
          type: 'signature',
          src: 'data:,',
          displayLabel: 'Signature',
          isAnchor: true,
        },
      },
      media: {},
      relationships: [],
      converter: { convertedXml: {} },
      editor: { extensionService: { extensions: [] } },
    };

    const result = translateAnchorNode(params);

    expect(result).toBeTruthy();
    expect(result.name).toBe('w:r');
  });
});

describe('translateImageNode IDs', () => {
  function findCNvPr(inline) {
    const graphic = inline.elements.find((el) => el.name === 'a:graphic');
    const graphicData = graphic.elements.find((el) => el.name === 'a:graphicData');
    const pic = graphicData.elements.find((el) => el.name === 'pic:pic');
    const nvPicPr = pic.elements.find((el) => el.name === 'pic:nvPicPr');
    return nvPicPr.elements.find((el) => el.name === 'pic:cNvPr');
  }

  it('generates non-zero IDs for wp:docPr and pic:cNvPr when attrs.id is missing', () => {
    const inline = translateImageNode(makeImageParams());

    const docPr = inline.elements.find((el) => el.name === 'wp:docPr');
    expect(Number(docPr.attributes.id)).toBeGreaterThan(0);

    const cNvPr = findCNvPr(inline);
    expect(Number(cNvPr.attributes.id)).toBeGreaterThan(0);
  });

  it('generates non-zero IDs when attrs.id is explicitly 0', () => {
    const inline = translateImageNode(makeImageParams({ id: 0 }));

    const docPr = inline.elements.find((el) => el.name === 'wp:docPr');
    expect(Number(docPr.attributes.id)).toBeGreaterThan(0);

    const cNvPr = findCNvPr(inline);
    expect(Number(cNvPr.attributes.id)).toBeGreaterThan(0);
  });

  it('uses same ID for both wp:docPr and pic:cNvPr', () => {
    const inline = translateImageNode(makeImageParams());

    const docPr = inline.elements.find((el) => el.name === 'wp:docPr');
    const cNvPr = findCNvPr(inline);
    expect(docPr.attributes.id).toBe(cNvPr.attributes.id);
  });

  it('preserves provided positive ID', () => {
    const inline = translateImageNode(makeImageParams({ id: 42 }));

    const docPr = inline.elements.find((el) => el.name === 'wp:docPr');
    expect(Number(docPr.attributes.id)).toBe(42);

    const cNvPr = findCNvPr(inline);
    expect(Number(cNvPr.attributes.id)).toBe(42);
  });
});
