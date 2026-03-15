import { describe, expect, it, vi } from 'vitest';
import { config, translator } from './ins-translator.js';
import { NodeTranslator } from '@translator';
import { exportSchemaToJson } from '@converter/exporter.js';

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
    const mockNode = { elements: [{ text: 'added text' }] };

    function encodeWith({ converter, id = '123' } = {}) {
      const mockSubNodes = [{ content: [{ type: 'text', text: 'added text' }] }];
      const mockNodeListHandler = { handler: vi.fn().mockReturnValue(mockSubNodes) };

      const encodedAttrs = {
        author: 'Test',
        authorEmail: 'test@example.com',
        id,
        date: '2025-10-09T12:00:00Z',
      };

      const result = config.encode(
        {
          nodeListHandler: mockNodeListHandler,
          extraParams: { node: mockNode },
          converter,
          path: [],
        },
        { ...encodedAttrs },
      );

      return { result, mockNodeListHandler };
    }

    function getMarkAttrs(result) {
      return result[0].content[0].marks[0].attrs;
    }

    it('wraps subnodes with trackInsert mark and sets importedAuthor', () => {
      const { result, mockNodeListHandler } = encodeWith();

      expect(mockNodeListHandler.handler).toHaveBeenCalledWith(
        expect.objectContaining({
          insideTrackChange: true,
          nodes: mockNode.elements,
        }),
      );

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

    it('preserves the original Word ID as sourceId when no map exists', () => {
      const { result } = encodeWith();

      expect(getMarkAttrs(result)).toEqual(expect.objectContaining({ id: '123', sourceId: '123' }));
    });

    it('remaps id via trackedChangeIdMap and preserves sourceId', () => {
      const converter = {
        trackedChangeIdMap: new Map([['123', 'shared-uuid-abc']]),
      };

      const { result } = encodeWith({ converter });
      const attrs = getMarkAttrs(result);

      expect(attrs.id).toBe('shared-uuid-abc');
      expect(attrs.sourceId).toBe('123');
    });
  });

  describe('decode', () => {
    it('decodes node with trackInsert mark into a w:ins element', () => {
      const mockTrackedMark = {
        type: 'trackInsert',
        attrs: {
          id: '123',
          sourceId: '',
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

    it('writes sourceId to w:id for round-trip fidelity', () => {
      const mockTrackedMark = {
        type: 'trackInsert',
        attrs: {
          id: 'shared-uuid-abc',
          sourceId: '456',
          author: 'Test',
          authorEmail: 'test@example.com',
          date: '2025-10-09T12:00:00Z',
        },
      };

      exportSchemaToJson.mockReturnValue({ elements: [{ name: 'w:t' }] });

      const node = { type: 'text', marks: [mockTrackedMark] };
      const result = config.decode({ node });

      expect(result.attributes['w:id']).toBe('456');
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
