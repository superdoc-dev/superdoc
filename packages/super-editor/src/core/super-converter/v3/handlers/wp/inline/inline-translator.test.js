import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config, translator } from './inline-translator.js';
const { NodeTranslator } = await import('../../../node-translator/index.js');
const { translateInlineNode } = await import('./helpers/translate-inline-node.js');
const { handleInlineNode } = await import('./helpers/handle-inline-node.js');

vi.mock('@converter/v3/handlers/wp/inline/helpers/handle-inline-node.js', () => ({
  handleInlineNode: mock(),
}));

vi.mock('@converter/v3/handlers/wp/inline/helpers/translate-inline-node.js', () => ({
  translateInlineNode: mock(),
}));

describe('wp:inline translator', () => {
  beforeEach(() => {});

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('wp:inline');
    expect(config.sdNodeOrKeyName).toEqual(['image', 'shapeGroup', 'vectorShape', 'contentBlock']);
    expect(typeof config.encode).toBe('function');
    expect(typeof config.decode).toBe('function');
    expect(config.attributes).toHaveLength(6);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('wp:inline');
    expect(translator.sdNodeOrKeyName).toEqual(['image', 'shapeGroup', 'vectorShape', 'contentBlock']);
  });

  it('creates attribute handlers for all attributes', () => {
    const names = config.attributes.map((a) => a.xmlName);
    expect(names).toEqual(['distT', 'distB', 'distL', 'distR', 'wp14:anchorId', 'wp14:editId']);
  });

  describe('encode', () => {
    it('should return null if node is missing', () => {
      const params = { extraParams: {} };
      const result = config.encode(params);
      expect(result).toBeNull();
    });

    it('should return null if node has no type', () => {
      const params = { extraParams: { node: {} } };
      const result = config.encode(params);
      expect(result).toBeNull();
    });

    it('should call handleInlineNode when node is valid', () => {
      const params = { extraParams: { node: { name: 'wp:inline' } } };
      handleInlineNode.mockReturnValue({ encoded: true });

      const result = config.encode(params);

      expect(handleInlineNode).toHaveBeenCalledWith(params);
      expect(result).toEqual({ encoded: true });
    });
  });

  describe('decode', () => {
    it('should return null if node is missing', () => {
      const params = {};
      const result = config.decode(params);
      expect(result).toBeNull();
    });

    it('should return null if node has no type', () => {
      const params = { node: {} };
      const result = config.decode(params);
      expect(result).toBeNull();
    });

    it('should call translateInlineNode when node is valid', () => {
      translateInlineNode.mockReturnValue({ decoded: true });

      const params = { node: { type: 'element' } };
      const result = config.decode(params);

      expect(translateInlineNode).toHaveBeenCalledWith(params);
      expect(result).toEqual({ decoded: true });
    });
  });
});
