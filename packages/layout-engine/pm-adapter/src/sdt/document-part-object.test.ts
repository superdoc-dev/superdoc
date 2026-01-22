/**
 * Tests for Document Part Object Handler Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDocumentPartObjectNode } from './document-part-object.js';
import type { PMNode, NodeHandlerContext } from '../types.js';
import type { ParagraphBlock, SdtMetadata } from '@superdoc/contracts';
import * as metadataModule from './metadata.js';
import * as tocModule from './toc.js';

// Mock the metadata module
vi.mock('./metadata.js', async () => {
  const actual = await vi.importActual<typeof metadataModule>('./metadata.js');
  return {
    ...actual,
    getDocPartGallery: vi.fn(),
    getDocPartObjectId: vi.fn(),
    getNodeInstruction: vi.fn(),
    resolveNodeSdtMetadata: vi.fn(),
  };
});

// Mock the toc module
vi.mock('./toc.js', () => ({
  processTocChildren: vi.fn(),
}));

describe('document-part-object', () => {
  describe('handleDocumentPartObjectNode', () => {
    const mockBlockIdGenerator = vi.fn((kind: string) => `${kind}-test-id`);
    const mockPositionMap = new Map();
    const mockStyleContext = {
      styles: new Map(),
      numbering: new Map(),
    };
    const mockHyperlinkConfig = {
      enableRichHyperlinks: false,
    };
    const mockConverterContext = { docx: {} } as never;
    const mockEnableComments = true;

    const mockParagraphConverter = vi.fn((_node: PMNode) => [
      {
        kind: 'paragraph',
        id: 'p1',
        runs: [{ text: 'TOC Entry', fontFamily: 'Arial', fontSize: 12 }],
      } as ParagraphBlock,
    ]);

    let mockContext: NodeHandlerContext;

    beforeEach(() => {
      vi.clearAllMocks();

      mockContext = {
        blocks: [],
        recordBlockKind: vi.fn(),
        nextBlockId: mockBlockIdGenerator,
        positions: mockPositionMap,
        defaultFont: 'Arial',
        defaultSize: 12,
        styleContext: mockStyleContext,
        bookmarks: new Map(),
        hyperlinkConfig: mockHyperlinkConfig,
        enableComments: mockEnableComments,
        converterContext: mockConverterContext,
        converters: {
          paragraphToFlowBlocks: mockParagraphConverter,
          tableNodeToBlock: vi.fn(),
          imageNodeToBlock: vi.fn(),
        },
      };
    });

    // ==================== Basic Functionality Tests ====================
    describe('Basic functionality', () => {
      it('should handle node with no content array', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          attrs: { docPartGallery: 'Table of Contents' },
        };

        handleDocumentPartObjectNode(node, mockContext);

        expect(mockContext.blocks).toHaveLength(0);
        expect(tocModule.processTocChildren).not.toHaveBeenCalled();
      });

      it('should handle node with null content', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: null,
          attrs: { docPartGallery: 'Table of Contents' },
        };

        handleDocumentPartObjectNode(node, mockContext);

        expect(mockContext.blocks).toHaveLength(0);
        expect(tocModule.processTocChildren).not.toHaveBeenCalled();
      });

      it('should handle node with empty content array', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [],
          attrs: { docPartGallery: 'Table of Contents' },
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue('TOC \\o "1-3"');
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'docPartObject',
          gallery: 'Table of Contents',
        });

        handleDocumentPartObjectNode(node, mockContext);

        expect(tocModule.processTocChildren).toHaveBeenCalledWith(
          [],
          expect.objectContaining({
            docPartGallery: 'Table of Contents',
            docPartObjectId: 'toc-1',
            tocInstruction: 'TOC \\o "1-3"',
          }),
          expect.objectContaining({
            converters: mockContext.converters,
            converterContext: mockConverterContext,
            enableComments: mockEnableComments,
          }),
          expect.any(Object),
        );
      });
    });

    // ==================== TOC Processing Tests ====================
    describe('TOC processing', () => {
      it('should process TOC when docPartGallery is "Table of Contents"', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Chapter 1' }],
            },
          ],
          attrs: {
            docPartGallery: 'Table of Contents',
            docPartObjectId: 'toc-123',
            instruction: 'TOC \\o "1-3"',
          },
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-123');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue('TOC \\o "1-3"');
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'docPartObject',
          gallery: 'Table of Contents',
          uniqueId: 'toc-123',
        });

        handleDocumentPartObjectNode(node, mockContext);

        expect(tocModule.processTocChildren).toHaveBeenCalledOnce();
        expect(tocModule.processTocChildren).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'paragraph',
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'text',
                  text: 'Chapter 1',
                }),
              ]),
            }),
          ]),
          expect.objectContaining({
            docPartGallery: 'Table of Contents',
            docPartObjectId: 'toc-123',
            tocInstruction: 'TOC \\o "1-3"',
          }),
          expect.objectContaining({
            converters: mockContext.converters,
            converterContext: mockConverterContext,
            enableComments: mockEnableComments,
          }),
          expect.any(Object),
        );
      });

      it('should pass correct tocInstruction to processTocChildren', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'TOC Entry' }],
            },
          ],
        };

        const instruction = 'TOC \\o "1-2" \\h \\z \\u';
        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-456');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(instruction);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'docPartObject',
          gallery: 'Table of Contents',
        });

        handleDocumentPartObjectNode(node, mockContext);

        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[1].tocInstruction).toBe(instruction);
      });

      it('should pass sdtMetadata from resolveNodeSdtMetadata', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Entry' }],
            },
          ],
        };

        const sdtMetadata: SdtMetadata = {
          type: 'docPartObject',
          gallery: 'Table of Contents',
          uniqueId: 'toc-789',
          instruction: 'TOC \\o "1-3"',
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-789');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue('TOC \\o "1-3"');
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(sdtMetadata);

        handleDocumentPartObjectNode(node, mockContext);

        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[1].sdtMetadata).toEqual(sdtMetadata);
      });

      it('should not process when docPartGallery is not "Table of Contents"', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Some content' }],
            },
          ],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Building Block Gallery');

        handleDocumentPartObjectNode(node, mockContext);

        expect(tocModule.processTocChildren).not.toHaveBeenCalled();
      });

      it('should not process when docPartGallery is null or undefined', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Some content' }],
            },
          ],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue(null as never);

        handleDocumentPartObjectNode(node, mockContext);

        expect(tocModule.processTocChildren).not.toHaveBeenCalled();
      });
    });

    // ==================== Missing Dependencies Tests ====================
    describe('Missing dependencies', () => {
      it('should still call processTocChildren even if paragraphToFlowBlocks is missing', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'TOC Entry' }],
            },
          ],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue('TOC');
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'docPartObject',
        });

        const contextWithoutConverter: NodeHandlerContext = {
          ...mockContext,
          converters: {
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          } as never,
        };

        handleDocumentPartObjectNode(node, contextWithoutConverter);

        expect(tocModule.processTocChildren).toHaveBeenCalled();
      });

      it('should throw when converters is missing entirely', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'TOC Entry' }],
            },
          ],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');

        const contextWithoutConverters: NodeHandlerContext = {
          ...mockContext,
          converters: undefined as never,
        };

        expect(() => handleDocumentPartObjectNode(node, contextWithoutConverters)).toThrow();
      });
    });

    // ==================== Context Passing Tests ====================
    describe('Context passing to processTocChildren', () => {
      it('should pass correct style context', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph' }],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined as never);

        handleDocumentPartObjectNode(node, mockContext);

        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[2]).toEqual(
          expect.objectContaining({
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            bookmarks: mockContext.bookmarks,
            hyperlinkConfig: mockHyperlinkConfig,
            converters: mockContext.converters,
            converterContext: mockConverterContext,
            enableComments: mockEnableComments,
          }),
        );
      });

      it('should pass blocks and recordBlockKind in fourth argument', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph' }],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined as never);

        handleDocumentPartObjectNode(node, mockContext);

        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[3]).toEqual({
          blocks: mockContext.blocks,
          recordBlockKind: mockContext.recordBlockKind,
        });
      });

      it('should pass converters in context', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph' }],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined as never);

        handleDocumentPartObjectNode(node, mockContext);

        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[2].converters).toBe(mockContext.converters);
      });
    });

    // ==================== Multiple Children Tests ====================
    describe('Multiple children', () => {
      it('should process multiple paragraph children in TOC', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Chapter 1' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Chapter 2' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Chapter 3' }],
            },
          ],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-multi');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue('TOC \\o "1-3"');
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'docPartObject',
        });

        handleDocumentPartObjectNode(node, mockContext);

        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[0]).toHaveLength(3);
        expect(callArgs[0][0]).toEqual(node.content[0]);
        expect(callArgs[0][1]).toEqual(node.content[1]);
        expect(callArgs[0][2]).toEqual(node.content[2]);
      });
    });

    // ==================== Edge Cases ====================
    describe('Edge cases', () => {
      it('should handle docPartGallery with different case sensitivity', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph' }],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('table of contents');

        handleDocumentPartObjectNode(node, mockContext);

        // Should not process because exact match is required
        expect(tocModule.processTocChildren).not.toHaveBeenCalled();
      });

      it('should handle undefined instruction from getNodeInstruction', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph' }],
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'docPartObject',
        });

        handleDocumentPartObjectNode(node, mockContext);

        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[1].tocInstruction).toBeUndefined();
      });
    });
  });
});
