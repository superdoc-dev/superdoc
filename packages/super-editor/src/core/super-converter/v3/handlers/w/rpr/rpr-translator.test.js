import { describe, it, expect } from 'vitest';
import { translator } from './rpr-translator.js';

const makeParams = (elements = []) => ({
  nodes: [
    {
      name: 'w:rPr',
      elements,
    },
  ],
});

describe('w:rPr translator (attribute aggregator)', () => {
  it('aggregates run property children via their translators', () => {
    const params = makeParams([
      { name: 'w:b', attributes: { 'w:val': '1' } },
      { name: 'w:color', attributes: { 'w:val': 'FF0000' } },
      { name: 'w:lang', attributes: { 'w:val': 'en-US' } },
      { name: 'w:shd', attributes: { 'w:fill': 'CCCCCC', 'w:val': 'clear' } },
      { name: 'w14:ligatures', attributes: { 'w14:val': 'standardContextual' } },
      { name: 'w14:cntxtAlts', attributes: { 'w14:val': '0' } },
    ]);

    const result = translator.encode(params);

    expect(result).toEqual({
      bold: true,
      color: {
        val: 'FF0000',
      },
      lang: {
        val: 'en-US',
      },
      shading: {
        fill: 'CCCCCC',
        val: 'clear',
      },
      ligatures: 'standardContextual',
      contextualAlternates: false,
    });
  });

  it('ignores unsupported children', () => {
    const params = makeParams([{ name: 'w:foo', attributes: { 'w:val': 'noop' } }]);

    const result = translator.encode(params);

    expect(result).toBeUndefined();
  });
});
