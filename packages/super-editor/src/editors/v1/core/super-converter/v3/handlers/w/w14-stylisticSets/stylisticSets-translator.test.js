import { describe, expect, it } from 'vitest';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { translator } from './stylisticSets-translator.js';

describe('w14:stylisticSets translator', () => {
  it('builds a NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w14:stylisticSets');
    expect(translator.sdNodeOrKeyName).toBe('stylisticSets');
  });

  it('encodes w14:ss children into stylisticSets entries', () => {
    const encoded = translator.encode({
      nodes: [
        {
          name: 'w14:stylisticSets',
          elements: [
            { name: 'w14:ss', attributes: { 'w14:id': '3', 'w14:val': '1' } },
            { name: 'w14:ss', attributes: { 'w14:id': '5', 'w14:val': '0' } },
          ],
        },
      ],
    });

    expect(encoded).toEqual([
      { id: 3, val: true },
      { id: 5, val: false },
    ]);
  });

  it('decodes stylisticSets entries into w14:ss children', () => {
    const decoded = translator.decode({
      node: {
        attrs: {
          stylisticSets: [
            { id: 7, val: true },
            { id: 9, val: false },
          ],
        },
      },
    });

    expect(decoded).toEqual({
      name: 'w14:stylisticSets',
      attributes: {},
      elements: [
        { name: 'w14:ss', attributes: { 'w14:id': '7', 'w14:val': '1' } },
        { name: 'w14:ss', attributes: { 'w14:id': '9', 'w14:val': '0' } },
      ],
    });
  });
});
