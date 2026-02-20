import { describe, it, expect } from 'vitest';
import { translator, config } from './perm-start-translator.js';
import { NodeTranslator } from '@translator';

describe('w:permStart translator', () => {
  it('exposes correct config', () => {
    expect(config.xmlName).toBe('w:permStart');
    expect(config.sdNodeOrKeyName).toEqual(['permStart', 'permStartBlock']);
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
    expect(config.attributes).toHaveLength(5);
  });

  it('encodes OOXML to SuperDoc inline with all attributes', () => {
    const params = {
      nodes: [
        {
          name: 'w:permStart',
          attributes: {
            'w:id': '3',
            'w:edGrp': 'everyone',
            'w:ed': 'alice@example.com',
            'w:colFirst': '0',
            'w:colLast': '2',
          },
        },
      ],
      path: [{ name: 'w:p' }],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'permStart',
      attrs: {
        id: '3',
        edGrp: 'everyone',
        ed: 'alice@example.com',
        colFirst: 0,
        colLast: 2,
      },
    });
  });

  it('encodes inline with minimal attributes', () => {
    const params = {
      nodes: [
        {
          name: 'w:permStart',
          attributes: {
            'w:id': '9',
          },
        },
      ],
      path: [{ name: 'w:p' }],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'permStart',
      attrs: {
        id: '9',
      },
    });
  });

  it('encodes block-level nodes when not in inline context', () => {
    const params = {
      nodes: [
        {
          name: 'w:permStart',
          attributes: {
            'w:id': '21',
          },
        },
      ],
      path: [],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'permStartBlock',
      attrs: {
        id: '21',
      },
    });
  });

  it('decodes SuperDoc to OOXML', () => {
    const params = {
      node: {
        type: 'permStart',
        attrs: {
          id: '11',
          ed: 'gabriel@example.com',
          edGrp: 'contributors',
          colFirst: 1,
        },
      },
    };

    const result = translator.decode(params);

    expect(result).toEqual({
      name: 'w:permStart',
      elements: [],
      attributes: {
        'w:id': '11',
        'w:edGrp': 'contributors',
        'w:ed': 'gabriel@example.com',
        'w:colFirst': '1',
      },
    });
  });

  it('round-trips correctly', () => {
    const original = {
      name: 'w:permStart',
      elements: [],
      attributes: {
        'w:id': '13',
        'w:edGrp': 'contributors',
        'w:ed': 'gabriel@example.com',
      },
    };

    const encoded = translator.encode({ nodes: [original] });
    const decoded = translator.decode({ node: encoded });

    expect(decoded).toEqual(original);
  });
});
