import { describe, expect, it, vi } from 'vitest';
import { config, translator } from './ins-translator.js';
import { NodeTranslator } from '@translator';
import { exportSchemaToJson } from '@converter/exporter.js';

// Mock external modules
vi.mock('@converter/exporter.js', () => ({
  exportSchemaToJson: vi.fn(),
}));

describe('w:ins translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('w:ins');
    expect(config.sdNodeOrKeyName).toEqual('trackInsert');
    expect(typeof config.encode).toBe('function');
    expect(typeof config.decode).toBe('function');
    expect(config.attributes.length).toEqual(4);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:ins');
    expect(translator.sdNodeOrKeyName).toEqual('trackInsert');
  });

  describe('encode', () => {
    it('wraps subnodes with trackInsert mark and sets importedAuthor', () => {
      const mockNode = { elements: [{ text: 'added text' }] };

      const mockSubNodes = [{ content: [{ type: 'text', text: 'added text' }] }];

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
          type: 'trackInsert',
          attrs: expect.objectContaining({
            author: 'Test',
            importedAuthor: 'Test (imported)',
          }),
        },
      ]);
    });
  });

  describe('decode', () => {
    it('decodes node with trackInsert mark into a w:ins element', () => {
      const mockTrackedMark = {
        type: 'trackInsert',
        attrs: {
          id: '123',
          author: 'Test',
          authorEmail: 'test@example.com',
          date: '2025-10-09T12:00:00Z',
        },
      };

      const mockMarks = [mockTrackedMark, { type: 'bold' }];
      const mockTextNode = { name: 'w:t', text: 'added text' };
      const mockTranslatedNode = { elements: [mockTextNode] };

      exportSchemaToJson.mockReturnValue(mockTranslatedNode);

      const node = {
        type: 'text',
        text: 'added text',
        marks: [...mockMarks],
      };

      const result = config.decode({ node });

      expect(exportSchemaToJson).toHaveBeenCalled();

      expect(result.name).toBe('w:ins');
      expect(result.attributes).toEqual({
        'w:id': '123',
        'w:author': 'Test',
        'w:authorEmail': 'test@example.com',
        'w:date': '2025-10-09T12:00:00Z',
      });
    });

    it('returns null if node is missing or invalid', () => {
      expect(config.decode({ node: null })).toBeNull();
      expect(config.decode({ node: {} })).toBeNull();
    });

    it('returns null when the node is missing a trackInsert mark', () => {
      const node = {
        type: 'text',
        marks: [{ type: 'bold', attrs: { value: true } }],
      };

      expect(config.decode({ node })).toBeNull();
      expect(exportSchemaToJson).not.toHaveBeenCalled();
    });

    it('keeps trackFormat marks for downstream text export', () => {
      const trackFormatMark = {
        type: 'trackFormat',
        attrs: {
          id: 'format-1',
          author: 'Missy Fox',
          date: '2026-01-07T20:24:39Z',
          before: [],
          after: [{ type: 'bold', attrs: { value: true } }],
        },
      };
      const node = {
        type: 'text',
        marks: [{ type: 'trackInsert', attrs: {} }, { type: 'bold', attrs: { value: true } }, trackFormatMark],
      };

      exportSchemaToJson.mockReturnValue({ elements: [{ name: 'w:t' }] });

      config.decode({ node });

      expect(exportSchemaToJson).toHaveBeenCalledWith(
        expect.objectContaining({
          node: expect.objectContaining({
            marks: [{ type: 'bold', attrs: { value: true } }, trackFormatMark],
          }),
        }),
      );
    });
  });
});
