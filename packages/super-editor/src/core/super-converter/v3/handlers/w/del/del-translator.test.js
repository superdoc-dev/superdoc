import { describe, expect, it, vi } from 'vitest';
import { config, translator } from './del-translator.js';
import { NodeTranslator } from '@translator';
import { exportSchemaToJson } from '@converter/exporter.js';
import { decodeTrackFormatMark } from '@converter/v3/handlers/helpers.js';

// Mock external modules
vi.mock('@converter/exporter.js', () => ({
  exportSchemaToJson: vi.fn(),
}));

vi.mock('@converter/v3/handlers/helpers.js', () => ({
  decodeTrackFormatMark: vi.fn(),
}));

describe('w:del translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('w:del');
    expect(config.sdNodeOrKeyName).toEqual('trackDelete');
    expect(typeof config.encode).toBe('function');
    expect(typeof config.decode).toBe('function');
    expect(config.attributes.length).toEqual(4);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:del');
    expect(translator.sdNodeOrKeyName).toEqual('trackDelete');
  });

  describe('encode', () => {
    it('wraps subnodes with trackDelete mark and sets importedAuthor', () => {
      const mockNode = { elements: [{ text: 'deleted text' }] };

      const mockSubNodes = [{ content: [{ type: 'text', text: 'deleted text' }] }];

      const mockNodeListHandler = {
        handler: vi.fn().mockReturnValue(mockSubNodes),
      };

      const encodedAttrs = {
        author: 'Test',
        authorEmail: 'test@example.com',
        id: '123',
        date: '2025-10-09T12:00:00Z',
      };

      const result = config.encode(
        {
          nodeListHandler: mockNodeListHandler,
          extraParams: { node: mockNode },
          path: [],
        },
        { ...encodedAttrs },
      );

      // Ensure handler is called properly
      expect(mockNodeListHandler.handler).toHaveBeenCalledWith(
        expect.objectContaining({
          insideTrackChange: true,
          nodes: mockNode.elements,
        }),
      );

      // Ensure results are annotated correctly
      expect(result).toHaveLength(1);
      expect(result[0].marks).toEqual([]);
      expect(result[0].content[0].marks).toEqual([
        {
          type: 'trackDelete',
          attrs: expect.objectContaining({
            author: 'Test',
            importedAuthor: 'Test (imported)',
          }),
        },
      ]);
    });
  });

  describe('decode', () => {
    it('decodes node with trackDelete mark into a w:del element', () => {
      const mockTrackedMark = {
        type: 'trackDelete',
        attrs: {
          id: '123',
          author: 'Test',
          authorEmail: 'test@example.com',
          date: '2025-10-09T12:00:00Z',
        },
      };

      const mockMarks = [mockTrackedMark, { type: 'bold' }];
      const mockTextNode = { name: 'w:t', text: 'deleted text' };
      const mockTranslatedNode = { elements: [mockTextNode] };

      exportSchemaToJson.mockReturnValue(mockTranslatedNode);
      decodeTrackFormatMark.mockReturnValue(null);

      const node = {
        type: 'text',
        text: 'deleted text',
        marks: [...mockMarks],
      };

      const result = config.decode({ node });

      expect(exportSchemaToJson).toHaveBeenCalled();

      expect(result.name).toBe('w:del');
      expect(result.attributes).toEqual({
        'w:id': '123',
        'w:author': 'Test',
        'w:authorEmail': 'test@example.com',
        'w:date': '2025-10-09T12:00:00Z',
      });
      expect(result.elements[0].elements[0].name).toBe('w:delText');
    });

    it('returns null if node is missing or invalid', () => {
      expect(config.decode({ node: null })).toBeNull();
      expect(config.decode({ node: {} })).toBeNull();
    });

    it('preserves trackStyleMark if created', () => {
      const node = {
        type: 'text',
        marks: [{ type: 'trackDelete', attrs: {} }],
      };

      const mockTrackStyleMark = { type: 'trackStyle', attrs: {} };
      decodeTrackFormatMark.mockReturnValue(mockTrackStyleMark);
      exportSchemaToJson.mockReturnValue({ elements: [{ name: 'w:t' }] });

      const result = config.decode({ node });

      expect(decodeTrackFormatMark).toHaveBeenCalled();
      expect(result).toBeTruthy();
      expect(result.elements[0].elements[0].name).toBe('w:delText');
    });
  });
});
