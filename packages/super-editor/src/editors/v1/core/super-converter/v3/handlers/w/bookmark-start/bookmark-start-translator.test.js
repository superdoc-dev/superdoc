import { describe, it, expect } from 'vitest';
import { translator, config } from './bookmark-start-translator.js';
import { NodeTranslator } from '@translator';

describe('w:bookmarkStart translator', () => {
  it('exposes correct config', () => {
    expect(config.xmlName).toBe('w:bookmarkStart');
    expect(config.sdNodeOrKeyName).toBe('bookmarkStart');
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
    expect(config.attributes).toHaveLength(5);
  });

  it('encodes OOXML to SuperDoc with all attributes', () => {
    const params = {
      nodes: [
        {
          name: 'w:bookmarkStart',
          attributes: {
            'w:id': '0',
            'w:name': 'Test',
            'w:colFirst': '2',
            'w:colLast': '5',
            'w:displacedByCustomXml': 'next',
          },
        },
      ],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'bookmarkStart',
      attrs: {
        id: '0',
        name: 'Test',
        colFirst: '2',
        colLast: '5',
        displacedByCustomXml: 'next',
      },
    });
  });

  it('encodes with minimal attributes', () => {
    const params = {
      nodes: [
        {
          name: 'w:bookmarkStart',
          attributes: {
            'w:id': '123',
            'w:name': 'chapter_1',
          },
        },
      ],
    };

    const result = translator.encode(params);

    expect(result).toEqual({
      type: 'bookmarkStart',
      attrs: {
        id: '123',
        name: 'chapter_1',
      },
    });
  });

  it('decodes SuperDoc to OOXML', () => {
    const params = {
      node: {
        type: 'bookmarkStart',
        attrs: {
          id: '456',
          name: 'section_2',
          colFirst: '1',
        },
      },
    };

    const result = translator.decode(params);

    expect(result).toEqual({
      name: 'w:bookmarkStart',
      elements: [],
      attributes: {
        'w:id': '456',
        'w:name': 'section_2',
        'w:colFirst': '1',
      },
    });
  });

  it('round-trips correctly', () => {
    const original = {
      name: 'w:bookmarkStart',
      elements: [],
      attributes: {
        'w:id': '789',
        'w:name': 'test_bookmark',
      },
    };

    const encoded = translator.encode({ nodes: [original] });
    const decoded = translator.decode({ node: encoded });

    expect(decoded).toEqual(original);
  });
});
