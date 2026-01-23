/**
 * Tests for Structured Content Block Handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStructuredContentBlockNode } from './structured-content-block.js';
import type { PMNode, NodeHandlerContext } from '../types.js';
import type { FlowBlock, ParagraphBlock, SdtMetadata } from '@superdoc/contracts';
import * as metadataModule from './metadata.js';

// Mock the metadata module
vi.mock('./metadata.js', async () => {
  const actual = await vi.importActual<typeof metadataModule>('./metadata.js');
  return {
    ...actual,
    applySdtMetadataToParagraphBlocks: vi.fn(),
    resolveNodeSdtMetadata: vi.fn(),
  };
});

describe('structured-content-block', () => {
  describe('handleStructuredContentBlockNode', () => {
    const mockBlockIdGenerator = vi.fn((kind: string) => `${kind}-test-id`);
    const mockPositionMap = new Map();
    const mockStyleContext = {
      styles: new Map(),
      numbering: new Map(),
    };
    const mockHyperlinkConfig = {
      enableRichHyperlinks: false,
    };
    const mockTrackedChangesConfig = undefined;
    const mockBookmarks = new Map();
    const mockEnableComments = true;
    const mockConverterContext = { docx: {} } as never;

    const scbMetadata: SdtMetadata = {
      type: 'structuredContentBlock',
      id: 'scb-1',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    // ==================== Basic Functionality Tests ====================
    describe('Basic functionality', () => {
      it('should return early if node.content is not an array', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: undefined,
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: vi.fn(),
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(0);
        expect(recordBlockKind).not.toHaveBeenCalled();
      });

      it('should throw if paragraphToFlowBlocks is not provided', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: undefined,
        };

        expect(() => handleStructuredContentBlockNode(node, context)).toThrow();
      });

      it('should handle empty children array', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: vi.fn(),
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(0);
        expect(recordBlockKind).not.toHaveBeenCalled();
      });

      it('should process a single paragraph child', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
          } as ParagraphBlock,
        ]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe('paragraph');
        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith(expect.any(Array), scbMetadata);
      });

      it('should process multiple paragraph children', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Para 1' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Para 2' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Para 3' }] },
          ],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn((params) => [
          {
            kind: 'paragraph',
            id: `p-${params.para.content[0].text}`,
            runs: [{ text: params.para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
          } as ParagraphBlock,
        ]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(3);
        expect(mockParagraphConverter).toHaveBeenCalledTimes(3);
        expect(recordBlockKind).toHaveBeenCalledTimes(3);
      });

      it('should resolve node metadata with correct override type', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(metadataModule.resolveNodeSdtMetadata).toHaveBeenCalledWith(node, 'structuredContentBlock');
      });
    });

    // ==================== Paragraph Conversion Tests ====================
    describe('Paragraph conversion', () => {
      it('should pass all required parameters to paragraphToFlowBlocks', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(mockParagraphConverter).toHaveBeenCalledWith(
          expect.objectContaining({
            para: node.content[0],
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            trackedChangesConfig: mockTrackedChangesConfig,
            bookmarks: mockBookmarks,
            hyperlinkConfig: mockHyperlinkConfig,
            enableComments: mockEnableComments,
            converterContext: mockConverterContext,
          }),
        );
      });

      it('should handle multiple paragraph blocks from converter', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [
          { kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock,
          { kind: 'paragraph', id: 'p2', runs: [] } as ParagraphBlock,
          { kind: 'paragraph', id: 'p3', runs: [] } as ParagraphBlock,
        ]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(3);
        expect(recordBlockKind).toHaveBeenCalledTimes(3);
      });

      it('should apply metadata only to paragraph blocks', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const para1: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs: [] };
        const para2: ParagraphBlock = { kind: 'paragraph', id: 'p2', runs: [] };

        const mockParagraphConverter = vi.fn(() => [para1, para2]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith([para1, para2], scbMetadata);
      });

      it('should handle non-paragraph blocks from converter', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [
          { kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock,
          { kind: 'page-break', id: 'pb1' } as FlowBlock,
          { kind: 'paragraph', id: 'p2', runs: [] } as ParagraphBlock,
        ]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(3);
        expect(blocks[1].kind).toBe('page-break');
        expect(recordBlockKind).toHaveBeenCalledWith('page-break');
        // Should only apply metadata to paragraph blocks
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ id: 'p1' }), expect.objectContaining({ id: 'p2' })]),
          scbMetadata,
        );
      });
    });

    // ==================== Metadata Application Tests ====================
    describe('Metadata application', () => {
      it('should apply metadata when metadata is defined', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith(expect.any(Array), scbMetadata);
      });

      it('should handle undefined metadata', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: {},
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(1);
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith(expect.any(Array), undefined);
      });
    });

    // ==================== Table Handling Tests ====================
    describe('Table handling', () => {
      it('should skip table children (not converted)', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [
            { type: 'paragraph', content: [] },
            { type: 'table', content: [] },
            { type: 'paragraph', content: [] },
          ],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(2);
        expect(mockParagraphConverter).toHaveBeenCalledTimes(2);
        expect(recordBlockKind).toHaveBeenCalledTimes(2);
      });

      it('should handle only table content', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'table', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: vi.fn(),
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(0);
      });
    });

    // ==================== Mixed Content Tests ====================
    describe('Mixed content', () => {
      it('should handle mixed paragraph content types', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
            { type: 'unknownType', content: [] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
            { type: 'table', content: [] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
          ],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(3);
        expect(mockParagraphConverter).toHaveBeenCalledTimes(3);
        expect(recordBlockKind).toHaveBeenCalledTimes(3);
      });
    });

    // ==================== Block Recording Tests ====================
    describe('Block recording', () => {
      it('should record block kind for each processed block', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [
            { type: 'paragraph', content: [] },
            { type: 'paragraph', content: [] },
          ],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(recordBlockKind).toHaveBeenNthCalledWith(1, 'paragraph');
        expect(recordBlockKind).toHaveBeenNthCalledWith(2, 'paragraph');
      });

      it('should record block kind for multiple block types', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [
          { kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock,
          { kind: 'page-break', id: 'pb1' } as FlowBlock,
          { kind: 'paragraph', id: 'p2', runs: [] } as ParagraphBlock,
        ]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(recordBlockKind).toHaveBeenNthCalledWith(1, 'paragraph');
        expect(recordBlockKind).toHaveBeenNthCalledWith(2, 'page-break');
        expect(recordBlockKind).toHaveBeenNthCalledWith(3, 'paragraph');
      });
    });

    // ==================== Edge Cases ====================
    describe('Edge cases', () => {
      it('should handle node with null content', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: null,
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: vi.fn(),
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(0);
      });

      it('should handle converter returning empty array', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [{ type: 'paragraph', content: [] }],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => []);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(0);
        expect(recordBlockKind).not.toHaveBeenCalled();
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith([], scbMetadata);
      });

      it('should handle large number of children', () => {
        const childCount = 100;
        const content: PMNode[] = Array.from({ length: childCount }, (_, i) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `Para ${i}` }],
        }));

        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content,
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(childCount);
        expect(mockParagraphConverter).toHaveBeenCalledTimes(childCount);
        expect(recordBlockKind).toHaveBeenCalledTimes(childCount);
      });

      it('should not mutate original node.content array', () => {
        const originalContent = [
          { type: 'paragraph', content: [] },
          { type: 'table', content: [] },
        ];
        const contentCopy = [...originalContent];

        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: originalContent,
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: mockStyleContext,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks: mockParagraphConverter,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(node.content).toEqual(contentCopy);
      });
    });
  });
});
