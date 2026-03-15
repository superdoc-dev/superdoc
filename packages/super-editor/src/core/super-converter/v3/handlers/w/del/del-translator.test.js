import { describe, expect, it, vi } from 'vitest';
import { config, translator } from './del-translator.js';
import { NodeTranslator } from '@translator';
import { exportSchemaToJson } from '@converter/exporter.js';
import { createTrackStyleMark } from '@converter/v3/handlers/helpers.js';

// Mock external modules
vi.mock('@converter/exporter.js', () => ({
  exportSchemaToJson: vi.fn(),
}));

vi.mock('@converter/v3/handlers/helpers.js', () => ({
  createTrackStyleMark: vi.fn(),
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
    const mockNode = { elements: [{ text: 'deleted text' }] };

    function encodeWith({ converter, id = '123' } = {}) {
      const mockSubNodes = [{ content: [{ type: 'text', text: 'deleted text' }] }];
      const mockNodeListHandler = { handler: vi.fn().mockReturnValue(mockSubNodes) };

      const encodedAttrs = {
        author: 'Test',
        authorEmail: 'test@example.com',
        id,
        date: '2025-10-09T12:00:00Z',
      };

      return config.encode(
        {
          nodeListHandler: mockNodeListHandler,
          extraParams: { node: mockNode },
          converter,
          path: [],
        },
        { ...encodedAttrs },
      );
    }

    function getMarkAttrs(result) {
      return result[0].content[0].marks[0].attrs;
    }

    it('wraps subnodes with trackDelete mark and sets importedAuthor', () => {
      const result = encodeWith();

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

    it('preserves the original Word ID as sourceId when no map exists', () => {
      const result = encodeWith();

      expect(getMarkAttrs(result)).toEqual(expect.objectContaining({ id: '123', sourceId: '123' }));
    });

    it('remaps id via trackedChangeIdMap and preserves sourceId', () => {
      const converter = {
        trackedChangeIdMap: new Map([['123', 'shared-uuid-abc']]),
      };

      const result = encodeWith({ converter });
      const attrs = getMarkAttrs(result);

      expect(attrs.id).toBe('shared-uuid-abc');
      expect(attrs.sourceId).toBe('123');
    });
  });

  describe('decode', () => {
    it('decodes node with trackDelete mark into a w:del element', () => {
      const mockTrackedMark = {
        type: 'trackDelete',
        attrs: {
          id: '123',
          sourceId: '',
          author: 'Test',
          authorEmail: 'test@example.com',
          date: '2025-10-09T12:00:00Z',
        },
      };

      const mockMarks = [mockTrackedMark, { type: 'bold' }];
      const mockTextNode = { name: 'w:t', text: 'deleted text' };
      const mockTranslatedNode = { elements: [mockTextNode] };

      exportSchemaToJson.mockReturnValue(mockTranslatedNode);
      createTrackStyleMark.mockReturnValue(null);

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

    it('writes sourceId to w:id for round-trip fidelity', () => {
      const mockTrackedMark = {
        type: 'trackDelete',
        attrs: {
          id: 'shared-uuid-abc',
          sourceId: '456',
          author: 'Test',
          authorEmail: 'test@example.com',
          date: '2025-10-09T12:00:00Z',
        },
      };

      exportSchemaToJson.mockReturnValue({ elements: [{ name: 'w:t' }] });
      createTrackStyleMark.mockReturnValue(null);

      const node = { type: 'text', marks: [mockTrackedMark] };
      const result = config.decode({ node });

      expect(result.attributes['w:id']).toBe('456');
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
      createTrackStyleMark.mockReturnValue(mockTrackStyleMark);
      exportSchemaToJson.mockReturnValue({ elements: [{ name: 'w:t' }] });

      const result = config.decode({ node });

      expect(createTrackStyleMark).toHaveBeenCalled();
      expect(result).toBeTruthy();
      expect(result.elements[0].elements[0].name).toBe('w:delText');
    });
  });
});
