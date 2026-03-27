import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config, translator } from './sdt-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator';
import { sdtNodeTypeStrategy } from './helpers/sdt-node-type-strategy';
import { translateFieldAnnotation } from './helpers/translate-field-annotation';
import { translateDocumentSection } from './helpers/translate-document-section';
import { translateStructuredContent } from './helpers/translate-structured-content';

// Mock the helper modules used by sdt-translator
vi.mock('./helpers/sdt-node-type-strategy', () => ({
  sdtNodeTypeStrategy: vi.fn(),
}));
vi.mock('./helpers/translate-field-annotation', () => ({
  translateFieldAnnotation: vi.fn(() => ({ name: 'w:sdt', elements: [] })),
}));
vi.mock('./helpers/translate-document-section', () => ({
  translateDocumentSection: vi.fn(() => ({ name: 'w:sdt', elements: [] })),
}));
vi.mock('./helpers/translate-structured-content', () => ({
  translateStructuredContent: vi.fn(() => ({ name: 'w:sdt', elements: [] })),
}));

describe('w:sdt translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('w:sdt');
    expect(config.sdNodeOrKeyName).toEqual([
      'fieldAnnotation',
      'structuredContent',
      'structuredContentBlock',
      'documentSection',
    ]);
    expect(typeof config.encode).toBe('function');
    expect(typeof config.decode).toBe('function');
    expect(config.attributes).toEqual([]);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:sdt');
    expect(translator.sdNodeOrKeyName).toEqual([
      'fieldAnnotation',
      'structuredContent',
      'structuredContentBlock',
      'documentSection',
    ]);
  });

  describe('encode function', () => {
    it('returns result from handler when strategy returns valid handler', () => {
      const mockHandler = vi.fn(() => ({ type: 'fieldAnnotation', content: [] }));
      sdtNodeTypeStrategy.mockReturnValue({ type: 'fieldAnnotation', handler: mockHandler });

      const params = { nodes: [{ elements: [] }] };
      const result = config.encode(params);

      expect(sdtNodeTypeStrategy).toHaveBeenCalledWith(params.nodes[0]);
      expect(mockHandler).toHaveBeenCalledWith(params);
      expect(result).toEqual({ type: 'fieldAnnotation', content: [] });
    });

    it('returns undefined when handler is null', () => {
      sdtNodeTypeStrategy.mockReturnValue({ type: 'unknown', handler: null });

      const params = { nodes: [{ elements: [] }] };
      const result = config.encode(params);

      expect(sdtNodeTypeStrategy).toHaveBeenCalledWith(params.nodes[0]);
      expect(result).toBeUndefined();
    });

    it('returns undefined when type is unknown', () => {
      const mockHandler = vi.fn();
      sdtNodeTypeStrategy.mockReturnValue({ type: 'unknown', handler: mockHandler });

      const params = { nodes: [{ elements: [] }] };
      const result = config.encode(params);

      expect(sdtNodeTypeStrategy).toHaveBeenCalledWith(params.nodes[0]);
      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('decode function', () => {
    it('calls translateFieldAnnotation for fieldAnnotation type', () => {
      const params = { node: { type: 'fieldAnnotation', attrs: {} } };
      const result = config.decode(params);

      expect(translateFieldAnnotation).toHaveBeenCalledWith(params);
      expect(result.name).toBe('w:sdt');
    });

    it('calls translateDocumentSection for documentSection type', () => {
      const params = { node: { type: 'documentSection', attrs: {} } };
      const result = config.decode(params);

      expect(translateDocumentSection).toHaveBeenCalledWith(params);
      expect(result.name).toBe('w:sdt');
    });

    it('calls translateStructuredContent for structuredContent type', () => {
      const params = { node: { type: 'structuredContent', attrs: {} } };
      const result = config.decode(params);

      expect(translateStructuredContent).toHaveBeenCalledWith(params);
      expect(result.name).toBe('w:sdt');
    });

    it('calls translateStructuredContent for structuredContentBlock type', () => {
      const params = { node: { type: 'structuredContentBlock', attrs: {} } };
      const result = config.decode(params);

      expect(translateStructuredContent).toHaveBeenCalledWith(params);
      expect(result.name).toBe('w:sdt');
    });

    it('returns null for unknown type', () => {
      const params = { node: { type: 'unknownType', attrs: {} } };
      const result = config.decode(params);

      expect(result).toBeNull();
    });

    it('returns null when node is missing', () => {
      const params = {};
      const result = config.decode(params);

      expect(result).toBeNull();
    });

    it('returns null when node type is missing', () => {
      const params = { node: { attrs: {} } };
      const result = config.decode(params);

      expect(result).toBeNull();
    });
  });
});
