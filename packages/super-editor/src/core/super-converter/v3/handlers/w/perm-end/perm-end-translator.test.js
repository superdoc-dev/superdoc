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

  it('encodes OOXML to SuperDoc', () => {
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

  it('creates inline permEnd nodes inside inline contexts', () => {
    const params = {
      nodes: [
        {
          name: 'w:permEnd',
          attributes: {
            'w:id': 'inline',
          },
        },
      ],
      path: [{ name: 'w:p' }],
    };

    const result = translator.encode(params);
    expect(result.type).toBe('permEnd');
  });

  it('creates block permEnd nodes when parent is block-level', () => {
    const params = {
      nodes: [
        {
          name: 'w:permEnd',
          attributes: {
            'w:id': 'block',
          },
        },
      ],
      path: [{ name: 'w:body' }],
    };

    const result = translator.encode(params);
    expect(result.type).toBe('permEndBlock');
  });
});
