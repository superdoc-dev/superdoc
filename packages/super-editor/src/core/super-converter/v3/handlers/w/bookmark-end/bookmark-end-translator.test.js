import { describe, it, expect } from 'vitest';
import { translator, config } from './bookmark-end-translator.js';
import { NodeTranslator } from '@translator';

describe('w:bookmarkEnd translator', () => {
  it('exposes correct config', () => {
    expect(config.xmlName).toBe('w:bookmarkEnd');
    expect(config.sdNodeOrKeyName).toBe('bookmarkEnd');
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
    expect(config.attributes).toHaveLength(2);
  });

  it('encodes OOXML to SuperDoc', () => {
    const params = {
      nodes: [
        {
          name: 'w:bookmarkEnd',
          attributes: {
            'w:id': '0',
            'w:displacedByCustomXml': 'prev',
          },
        },
      ],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'bookmarkEnd',
      attrs: {
        id: '0',
        displacedByCustomXml: 'prev',
      },
    });
  });

  it('encodes with minimal attributes', () => {
    const params = {
      nodes: [
        {
          name: 'w:bookmarkEnd',
          attributes: {
            'w:id': '123',
          },
        },
      ],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'bookmarkEnd',
      attrs: {
        id: '123',
      },
    });
  });

  it('decodes SuperDoc to OOXML', () => {
    const params = {
      node: {
        type: 'bookmarkEnd',
        attrs: {
          id: '456',
        },
      },
    };

    const result = translator.decode(params);

    expect(result).toEqual({
      name: 'w:bookmarkEnd',
      elements: [],
      attributes: {
        'w:id': '456',
      },
    });
  });

  it('round-trips correctly', () => {
    const original = {
      name: 'w:bookmarkEnd',
      elements: [],
      attributes: {
        'w:id': '789',
      },
    };

    const encoded = translator.encode({ nodes: [original] });
    const decoded = translator.decode({ node: encoded });

    expect(decoded).toEqual(original);
  });
});
