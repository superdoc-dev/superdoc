import { describe, it, expect } from 'vitest';
import { config, translator } from './highlight-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:highlight translator (attribute)', () => {
  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('w:highlight');
    expect(config.sdNodeOrKeyName).toBe('highlight');
    expect(config.type).toBe(NodeTranslator.translatorTypes.ATTRIBUTE);
    expect(typeof config.encode).toBe('function');
    expect(config.attributes?.map((attr) => attr.xmlName)).toEqual(['w:val']);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:highlight');
    expect(translator.sdNodeOrKeyName).toBe('highlight');
  });

  it('prefers encoded value and defaults to null when missing', () => {
    const params = { nodes: [{ attributes: { 'w:val': 'yellow' } }] };
    const out = config.encode(params, { highlight: 'green' });
    expect(out).toEqual({
      type: 'attr',
      xmlName: 'w:highlight',
      sdNodeOrKeyName: 'highlight',
      attributes: { 'w:val': 'green' },
    });

    const missing = config.encode({ nodes: [{}] });
    expect(missing.attributes).toEqual({ 'w:val': null });
  });

  it('decodes keyword highlight values to w:highlight', () => {
    const node = { attrs: { highlight: 'yellow' } };
    const result = translator.decode({ node });
    expect(result).toEqual({ name: 'w:highlight', attributes: { 'w:val': 'yellow' } });
  });

  it('decodes hex highlight values to w:shd when keyword missing', () => {
    const node = { attrs: { highlight: '#ABCDEF' } };
    const result = translator.decode({ node });
    expect(result).toEqual({
      name: 'w:shd',
      attributes: { 'w:color': 'auto', 'w:val': 'clear', 'w:fill': 'ABCDEF' },
    });
  });

  it('returns w:highlight none for transparent/none/inherit values', () => {
    const transparent = translator.decode({ node: { attrs: { highlight: 'transparent' } } });
    const none = translator.decode({ node: { attrs: { highlight: 'none' } } });
    const inherit = translator.decode({ node: { attrs: { highlight: 'inherit' } } });

    expect(transparent).toEqual({ name: 'w:highlight', attributes: { 'w:val': 'none' } });
    expect(none).toEqual({ name: 'w:highlight', attributes: { 'w:val': 'none' } });
    expect(inherit).toEqual({ name: 'w:highlight', attributes: { 'w:val': 'none' } });

    expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
  });
});
