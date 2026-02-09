import { describe, it, expect } from 'vitest';
import { translator, config } from './perm-end-translator.js';
import { NodeTranslator } from '@translator';

describe('w:permEnd translator', () => {
  it('exposes correct config', () => {
    expect(config.xmlName).toBe('w:permEnd');
    expect(config.sdNodeOrKeyName).toEqual(['permEnd', 'permEndBlock']);
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
    expect(config.attributes).toHaveLength(2);
  });

  it('encodes OOXML to SuperDoc inline', () => {
    const params = {
      nodes: [
        {
          name: 'w:permEnd',
          attributes: {
            'w:id': '3',
            'w:displacedByCustomXml': 'prev',
          },
        },
      ],
      path: [{ name: 'w:p' }],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'permEnd',
      attrs: {
        id: '3',
        displacedByCustomXml: 'prev',
      },
    });
  });

  it('encodes block-level nodes when not in inline context', () => {
    const params = {
      nodes: [
        {
          name: 'w:permEnd',
          attributes: {
            'w:id': '7',
            'w:displacedByCustomXml': 'prev',
          },
        },
      ],
      path: [],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'permEndBlock',
      attrs: {
        id: '7',
        displacedByCustomXml: 'prev',
      },
    });
  });

  it('decodes SuperDoc to OOXML', () => {
    const params = {
      node: {
        type: 'permEnd',
        attrs: {
          id: '5',
          displacedByCustomXml: 'prev',
        },
      },
    };

    const result = translator.decode(params);

    expect(result).toEqual({
      name: 'w:permEnd',
      elements: [],
      attributes: {
        'w:id': '5',
        'w:displacedByCustomXml': 'prev',
      },
    });
  });

  it('round-trips correctly', () => {
    const original = {
      name: 'w:permEnd',
      elements: [],
      attributes: {
        'w:id': '9',
        'w:displacedByCustomXml': 'prev',
      },
    };

    const encoded = translator.encode({ nodes: [original] });
    const decoded = translator.decode({ node: encoded });

    expect(decoded).toEqual(original);
  });
});
