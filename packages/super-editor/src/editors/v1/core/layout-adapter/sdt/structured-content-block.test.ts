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
    const mockHyperlinkConfig = {
      enableRichHyperlinks: false,
    };
    const mockTrackedChangesConfig = undefined;
    const mockBookmarks = new Map();
    const mockEnableComments = true;
    const mockConverterContext = { docx: {} } as never;

    const scbMetadata: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'scb-1',
    };
    const nonEmptyParagraph = (text = 'Text'): PMNode => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mockPositionMap.clear();
    });

    // ==================== Basic Functionality Tests ====================
    describe('Basic functionality', () => {
      it('should emit a placeholder paragraph if node.content is not an array', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: undefined,
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();
        mockPositionMap.set(node, { start: 10, end: 12 });
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
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

        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          kind: 'paragraph',
          id: 'paragraph-test-id',
          attrs: { sdt: scbMetadata },
          runs: [
            {
              text: '',
              sdt: scbMetadata,
              visualPlaceholder: 'emptyBlockSdt',
              pmStart: 11,
              pmEnd: 11,
            },
          ],
        });
        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
      });

      it('should throw if paragraphToFlowBlocks is not provided', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [nonEmptyParagraph()],
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
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: undefined,
        };

        expect(() => handleStructuredContentBlockNode(node, context)).toThrow();
      });

      it('should emit a placeholder paragraph for empty children array', () => {
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

        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          kind: 'paragraph',
          attrs: { sdt: scbMetadata },
          runs: [
            {
              text: '',
              sdt: scbMetadata,
              visualPlaceholder: 'emptyBlockSdt',
            },
          ],
        });
        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
      });

      it('should emit a placeholder paragraph for a single empty paragraph child', () => {
        const emptyParagraph: PMNode = { type: 'paragraph', content: [] };
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [emptyParagraph],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        mockPositionMap.set(node, { start: 10, end: 14 });
        mockPositionMap.set(emptyParagraph, { start: 11, end: 13 });
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);
        const paragraphToFlowBlocks = vi.fn().mockReturnValue([
          {
            kind: 'paragraph',
            id: 'converted-empty-paragraph',
            attrs: { sdt: scbMetadata },
            runs: [
              {
                text: '',
                fontFamily: 'Aptos',
                fontSize: 14,
                color: '#123456',
                pmStart: 12,
                pmEnd: 12,
              },
            ],
          },
        ] satisfies ParagraphBlock[]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          kind: 'paragraph',
          attrs: { sdt: scbMetadata },
          runs: [
            {
              text: '',
              sdt: scbMetadata,
              visualPlaceholder: 'emptyBlockSdt',
              fontFamily: 'Aptos',
              fontSize: 14,
              color: '#123456',
              pmStart: 12,
              pmEnd: 12,
            },
          ],
        });
        expect(paragraphToFlowBlocks).toHaveBeenCalledWith(
          expect.objectContaining({
            para: emptyParagraph,
            positions: mockPositionMap,
          }),
        );
        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
      });

      it('should emit a placeholder paragraph when the empty paragraph only has bookmark markers', () => {
        const emptyParagraph: PMNode = {
          type: 'paragraph',
          content: [
            { type: 'bookmarkStart', attrs: { id: '1', name: 'EmptySdtBookmark' } },
            { type: 'bookmarkEnd', attrs: { id: '1' } },
          ],
        };
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [emptyParagraph],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        mockPositionMap.set(node, { start: 10, end: 16 });
        mockPositionMap.set(emptyParagraph, { start: 11, end: 15 });
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);
        const paragraphToFlowBlocks = vi.fn().mockReturnValue([
          {
            kind: 'paragraph',
            id: 'converted-bookmark-only-paragraph',
            attrs: { sdt: scbMetadata },
            runs: [
              {
                text: '',
                fontFamily: 'Aptos',
                fontSize: 14,
                pmStart: 12,
                pmEnd: 12,
              },
            ],
          },
        ] satisfies ParagraphBlock[]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          kind: 'paragraph',
          attrs: { sdt: scbMetadata },
          runs: [
            {
              text: '',
              sdt: scbMetadata,
              visualPlaceholder: 'emptyBlockSdt',
              pmStart: 12,
              pmEnd: 12,
            },
          ],
        });
        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
      });

      it('should emit a placeholder paragraph when the empty paragraph only has comment range markers', () => {
        const emptyParagraph: PMNode = {
          type: 'paragraph',
          content: [
            { type: 'commentRangeStart', attrs: { 'w:id': 'comment-1' } },
            { type: 'commentRangeEnd', attrs: { 'w:id': 'comment-1' } },
          ],
        };
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [emptyParagraph],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        mockPositionMap.set(node, { start: 10, end: 16 });
        mockPositionMap.set(emptyParagraph, { start: 11, end: 15 });
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);
        const paragraphToFlowBlocks = vi.fn().mockReturnValue([
          {
            kind: 'paragraph',
            id: 'converted-comment-only-paragraph',
            attrs: { sdt: scbMetadata },
            runs: [
              {
                text: '',
                fontFamily: 'Aptos',
                fontSize: 14,
                pmStart: 12,
                pmEnd: 12,
              },
            ],
          },
        ] satisfies ParagraphBlock[]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          kind: 'paragraph',
          attrs: { sdt: scbMetadata },
          runs: [
            {
              text: '',
              sdt: scbMetadata,
              visualPlaceholder: 'emptyBlockSdt',
              pmStart: 12,
              pmEnd: 12,
            },
          ],
        });
        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
      });

      it('should emit a placeholder paragraph when the empty paragraph only has permission range markers', () => {
        const emptyParagraph: PMNode = {
          type: 'paragraph',
          content: [
            { type: 'permStart', attrs: { id: 'perm-1', edGrp: 'everyone' } },
            { type: 'permEnd', attrs: { id: 'perm-1' } },
          ],
        };
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [emptyParagraph],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        mockPositionMap.set(node, { start: 10, end: 16 });
        mockPositionMap.set(emptyParagraph, { start: 11, end: 15 });
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);
        const paragraphToFlowBlocks = vi.fn().mockReturnValue([
          {
            kind: 'paragraph',
            id: 'converted-permission-only-paragraph',
            attrs: { sdt: scbMetadata },
            runs: [
              {
                text: '',
                fontFamily: 'Aptos',
                fontSize: 14,
                pmStart: 12,
                pmEnd: 12,
              },
            ],
          },
        ] satisfies ParagraphBlock[]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          kind: 'paragraph',
          attrs: { sdt: scbMetadata },
          runs: [
            {
              text: '',
              sdt: scbMetadata,
              visualPlaceholder: 'emptyBlockSdt',
              pmStart: 12,
              pmEnd: 12,
            },
          ],
        });
        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
      });

      it('should not emit a placeholder for a vanished empty paragraph child', () => {
        const emptyParagraph: PMNode = {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {
              runProperties: {
                vanish: true,
              },
            },
          },
          content: [],
        };
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [emptyParagraph],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);
        const paragraphToFlowBlocks = vi.fn().mockReturnValue([]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toHaveLength(0);
        expect(recordBlockKind).not.toHaveBeenCalled();
      });

      it('should preserve non-paragraph converter output for a vanished empty paragraph child', () => {
        const emptyParagraph: PMNode = {
          type: 'paragraph',
          attrs: {
            pageBreakBefore: true,
            paragraphProperties: {
              runProperties: {
                vanish: true,
              },
            },
          },
          content: [],
        };
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [emptyParagraph],
        };

        const pageBreakBlock: FlowBlock = {
          kind: 'pageBreak',
          id: 'page-break-before-hidden-paragraph',
          attrs: { source: 'pageBreakBefore' },
        };
        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);
        const paragraphToFlowBlocks = vi.fn().mockReturnValue([pageBreakBlock]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks,
          },
        };

        handleStructuredContentBlockNode(node, context);

        expect(blocks).toEqual([pageBreakBlock]);
        expect(recordBlockKind).toHaveBeenCalledWith('pageBreak');
      });

      it('should not synthesize a placeholder when tracked-change filtering removes an empty paragraph child', () => {
        const emptyParagraph: PMNode = {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {
              runProperties: {},
            },
          },
          content: [],
        };
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [emptyParagraph],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);
        const paragraphToFlowBlocks = vi.fn().mockReturnValue([]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          trackedChangesConfig: { enabled: true, mode: 'final' },
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: {
            paragraphToFlowBlocks,
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
          content: [nonEmptyParagraph()],
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
          content: [nonEmptyParagraph()],
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
            trackedChangesConfig: mockTrackedChangesConfig,
            bookmarks: mockBookmarks,
            hyperlinkConfig: mockHyperlinkConfig,
            enableComments: mockEnableComments,
            converterContext: mockConverterContext,
            converters: { paragraphToFlowBlocks: mockParagraphConverter },
            themeColors: undefined,
          }),
        );
      });

      it('should handle multiple paragraph blocks from converter', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [nonEmptyParagraph()],
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
          content: [nonEmptyParagraph()],
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
          content: [nonEmptyParagraph()],
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
          content: [nonEmptyParagraph()],
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
          content: [nonEmptyParagraph()],
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
          content: [nonEmptyParagraph()],
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
      it('should emit a placeholder paragraph for null content', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: null,
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

        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          kind: 'paragraph',
          attrs: { sdt: scbMetadata },
          runs: [{ visualPlaceholder: 'emptyBlockSdt', sdt: scbMetadata }],
        });
      });

      it('should handle converter returning empty array', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1' },
          content: [nonEmptyParagraph()],
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

    // SD-1333: an SDT in Word that wraps a documentPartObject (e.g. a Signature
    // SDT containing a PAGE field) parses into PM as
    // `structuredContentBlock > documentPartObject > paragraph > page-number`.
    // Before the fix, the inner documentPartObject was not a recognised child
    // type, so the wrapped paragraph (and its page-number token) was silently
    // dropped, producing an empty SDT in the rendered footer.
    describe('SD-1333: documentPartObject children', () => {
      it('flattens a documentPartObject child by processing its inner paragraphs', () => {
        const node: PMNode = {
          type: 'structuredContentBlock',
          attrs: { id: 'scb-1', alias: 'Signature' },
          content: [
            {
              type: 'documentPartObject',
              attrs: {},
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Page ' }] }],
            },
          ],
        };

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(scbMetadata);

        const mockParagraphConverter = vi.fn(() => [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Page ', fontFamily: 'Arial', fontSize: 12 }],
          } as ParagraphBlock,
        ]);

        const context: NodeHandlerContext = {
          blocks,
          recordBlockKind,
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          trackedChangesConfig: mockTrackedChangesConfig,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: mockEnableComments,
          converterContext: mockConverterContext,
          converters: { paragraphToFlowBlocks: mockParagraphConverter },
        };

        handleStructuredContentBlockNode(node, context);

        expect(mockParagraphConverter).toHaveBeenCalledTimes(1);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe('paragraph');
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ kind: 'paragraph' })]),
          scbMetadata,
        );
      });
    });
  });
});
