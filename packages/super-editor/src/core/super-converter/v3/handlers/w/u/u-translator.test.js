import { describe, it, expect } from 'vitest';

import { config, translator } from './u-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';

describe('w:u translator (attribute)', () => {
  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('w:u');
    expect(config.sdNodeOrKeyName).toBe('underline');
    expect(config.type).toBe(NodeTranslator.translatorTypes.ATTRIBUTE);
    expect(typeof config.encode).toBe('function');
    expect(config.attributes?.map((attr) => attr.xmlName)).toEqual([
      'w:val',
      'w:color',
      'w:themeColor',
      'w:themeTint',
      'w:themeShade',
    ]);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:u');
    expect(translator.sdNodeOrKeyName).toBe('underline');
  });

  describe('encode', () => {
    it('merges encoded underline attributes with fallbacks', () => {
      const params = {
        nodes: [
          {
            attributes: {
              'w:val': 'dash',
              'w:color': 'FF0000',
              'w:themeColor': 'accent1',
            },
          },
        ],
      };
      const out = config.encode(params, {
        underline: 'wave',
        color: '00FF00',
        themeTint: '33',
      });
      expect(out).toEqual({
        type: 'attr',
        xmlName: 'w:u',
        sdNodeOrKeyName: 'underline',
        attributes: {
          'w:val': 'wave',
          'w:color': '00FF00',
          'w:themeColor': 'accent1',
          'w:themeTint': '33',
        },
      });

      const fallback = config.encode({ nodes: [{}] });
      expect(fallback.attributes).toEqual({ 'w:val': null });
    });
  });

  describe('decode', () => {
    it('returns w:u with val and color', () => {
      const result = translator.decode({
        node: {
          attrs: {
            underlineType: 'single',
            underlineColor: '#ff0000',
          },
        },
      });
      expect(result).toEqual({
        name: 'w:u',
        attributes: { 'w:val': 'single', 'w:color': 'FF0000' },
      });
    });

    it('includes theme attributes when present', () => {
      const result = translator.decode({
        node: {
          attrs: {
            underlineType: 'wave',
            underlineThemeColor: 'accent1',
            underlineThemeTint: '99',
          },
        },
      });
      expect(result).toEqual({
        name: 'w:u',
        attributes: {
          'w:val': 'wave',
          'w:themeColor': 'accent1',
          'w:themeTint': '99',
        },
      });
    });

    it('returns undefined when no underline data provided', () => {
      expect(translator.decode({ node: { attrs: {} } })).toBeUndefined();
    });
  });
});
