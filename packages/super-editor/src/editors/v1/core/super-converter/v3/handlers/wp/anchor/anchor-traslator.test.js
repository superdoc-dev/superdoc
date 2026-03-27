import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config, translator } from './anchor-translator.js';
import { NodeTranslator } from '../../../node-translator/index.js';
import { translateAnchorNode } from './helpers/translate-anchor-node.js';
import { handleAnchorNode } from './helpers/handle-anchor-node.js';

vi.mock('@converter/v3/handlers/wp/anchor/helpers/handle-anchor-node.js', () => ({
  handleAnchorNode: vi.fn(),
}));

vi.mock('@converter/v3/handlers/wp/anchor/helpers/translate-anchor-node.js', () => ({
  translateAnchorNode: vi.fn(),
}));

describe('wp:anchor translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('wp:anchor');
    expect(config.sdNodeOrKeyName).toEqual(['image', 'shapeGroup', 'vectorShape', 'contentBlock']);
    expect(typeof config.encode).toBe('function');
    expect(typeof config.decode).toBe('function');
    expect(config.attributes).toHaveLength(12);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('wp:anchor');
    expect(translator.sdNodeOrKeyName).toEqual(['image', 'shapeGroup', 'vectorShape', 'contentBlock']);
  });

  it('creates attribute handlers for all attributes', () => {
    const names = config.attributes.map((a) => a.xmlName);
    expect(names).toEqual([
      'distT',
      'distB',
      'distL',
      'distR',
      'allowOverlap',
      'behindDoc',
      'layoutInCell',
      'locked',
      'relativeHeight',
      'simplePos',
      'wp14:anchorId',
      'wp14:editId',
    ]);
  });

  describe('encode', () => {
    it('calls handleAnchorNode when node is valid', () => {
      const params = { extraParams: { node: { name: 'wp:anchor' } } };
      handleAnchorNode.mockReturnValue({ encoded: true });

      const result = translator.encode(params);

      expect(handleAnchorNode).toHaveBeenCalledWith(params);
      expect(result).toEqual({ encoded: true });
    });

    it('returns null when node is missing', () => {
      const params = { extraParams: { node: null } };

      const result = translator.encode(params);

      expect(handleAnchorNode).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('returns null when node.name is missing', () => {
      const params = { extraParams: { node: {} } };

      const result = translator.encode(params);

      expect(handleAnchorNode).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('decode', () => {
    it('calls translateAnchorNode when node is valid', () => {
      const params = { node: { type: 'element' } };
      translateAnchorNode.mockReturnValue({ decoded: true });

      const result = translator.decode(params);

      expect(translateAnchorNode).toHaveBeenCalledWith(params);
      expect(result).toEqual({ decoded: true });
    });

    it('returns null when node is missing', () => {
      const params = { node: null };

      const result = translator.decode(params);

      expect(translateAnchorNode).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('returns null when node.type is missing', () => {
      const params = { node: {} };

      const result = translator.decode(params);

      expect(translateAnchorNode).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});
