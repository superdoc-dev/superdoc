// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config, translator } from './tableOfContents-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { exportSchemaToJson } from '../../../../exporter.js';

// Mock the exporter
vi.mock('../../../../exporter.js', () => ({
  exportSchemaToJson: vi.fn(),
}));

describe('sd:tableOfContents translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('sd:tableOfContents');
    expect(config.sdNodeOrKeyName).toBe('tableOfContents');
    expect(config.type).toBe(NodeTranslator.translatorTypes.NODE);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
  });

  describe('encode', () => {
    it('should encode a sd:tableOfContents node correctly', () => {
      const mockNodeListHandler = {
        handler: vi.fn(() => [{ type: 'paragraph', content: [] }]),
      };
      const params = {
        nodes: [
          {
            name: 'sd:tableOfContents',
            attributes: { instruction: 'TOC \\o "1-3"' },
            elements: [{ name: 'w:p', elements: [] }],
          },
        ],
        nodeListHandler: mockNodeListHandler,
      };

      const result = config.encode(params);

      expect(mockNodeListHandler.handler).toHaveBeenCalledWith({
        ...params,
        nodes: params.nodes[0].elements,
      });
      expect(result).toEqual({
        type: 'tableOfContents',
        attrs: { instruction: 'TOC \\o "1-3"' },
        content: [{ type: 'paragraph', content: [] }],
      });
    });
  });

  describe('decode', () => {
    const mockParams = {
      node: {
        type: 'tableOfContents',
        attrs: { instruction: 'TOC \\o "1-3"' },
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First Para' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Last Para' }] },
        ],
      },
    };

    const expectedBeginElements = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'begin' }, elements: [] }] },
      {
        name: 'w:r',
        elements: [
          {
            name: 'w:instrText',
            attributes: { 'xml:space': 'preserve' },
            elements: [{ text: 'TOC \\o "1-3"', type: 'text', name: '#text', elements: [] }],
          },
        ],
      },
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' }, elements: [] }] },
    ];

    const expectedEndElements = [
      { name: 'w:r', elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' }, elements: [] }] },
    ];

    it('should decode a TOC node with content correctly', () => {
      vi.mocked(exportSchemaToJson).mockImplementation(({ node }) => {
        if (node.content[0].text === 'First Para') {
          return { name: 'w:p', elements: [{ name: 'w:pPr' }, { name: 'w:r', text: 'First Para' }] };
        } else {
          return { name: 'w:p', elements: [{ name: 'w:r', text: 'Last Para' }] };
        }
      });

      const result = config.decode(mockParams);

      expect(result).toHaveLength(2);
      // Check begin elements injected after pPr
      expect(result[0].elements.slice(1, 4)).toEqual(expectedBeginElements);
      // Check end elements injected at the end of the last paragraph
      expect(result[1].elements.slice(-1)).toEqual(expectedEndElements);
    });

    it('should insert begin elements at the start if w:pPr is missing', () => {
      vi.mocked(exportSchemaToJson).mockReturnValue({ name: 'w:p', elements: [{ name: 'w:r' }] });

      const result = config.decode(mockParams);

      expect(result[0].elements.slice(0, 3)).toEqual(expectedBeginElements);
    });

    it('should create a new paragraph if content is empty', () => {
      const emptyContentParams = { ...mockParams, node: { ...mockParams.node, content: [] } };
      vi.mocked(exportSchemaToJson).mockReturnValue([]);

      const result = config.decode(emptyContentParams);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('w:p');
      // Should contain both begin and end elements
      expect(result[0].elements).toEqual([...expectedBeginElements, ...expectedEndElements]);
    });

    it('should handle missing content by creating a TOC field paragraph', () => {
      const noContentParams = { ...mockParams, node: { ...mockParams.node } };
      delete noContentParams.node.content;
      vi.mocked(exportSchemaToJson).mockReturnValue([]);

      const result = config.decode(noContentParams);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('w:p');
      expect(result[0].elements).toEqual([...expectedBeginElements, ...expectedEndElements]);
    });
  });
});
