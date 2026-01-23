/**
 * Tests for Document Section Processing Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processDocumentSectionChildren } from './document-section.js';
import type { PMNode } from '../types.js';
import type { FlowBlock, ParagraphBlock, SdtMetadata, TableBlock } from '@superdoc/contracts';
import * as metadataModule from './metadata.js';
import * as tocModule from './toc.js';

// Mock the metadata module
vi.mock('./metadata.js', async () => {
  const actual = await vi.importActual<typeof metadataModule>('./metadata.js');
  return {
    ...actual,
    applySdtMetadataToParagraphBlocks: vi.fn(),
    applySdtMetadataToTableBlock: vi.fn(),
    resolveNodeSdtMetadata: vi.fn(),
    getDocPartGallery: vi.fn(),
    getDocPartObjectId: vi.fn(),
    getNodeInstruction: vi.fn(),
  };
});

// Mock the toc module
vi.mock('./toc.js', () => ({
  processTocChildren: vi.fn(),
}));

describe('document-section', () => {
  describe('processDocumentSectionChildren', () => {
    const mockBlockIdGenerator = vi.fn((kind: string) => `${kind}-test-id`);
    const mockPositionMap = new Map();
    const mockStyleContext = {
      styles: new Map(),
      numbering: new Map(),
    };
    const mockHyperlinkConfig = {
      enableRichHyperlinks: false,
    };

    const sectionMetadata: SdtMetadata = {
      type: 'documentSection',
      id: 'section-1',
      lock: 'sdtContentLocked',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    // ==================== Basic Functionality Tests ====================
    describe('Basic functionality', () => {
      it('should handle empty children array', () => {
        const children: PMNode[] = [];
        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(0);
        expect(recordBlockKind).not.toHaveBeenCalled();
      });

      it('should process a single paragraph child', () => {
        const children: PMNode[] = [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
          } as ParagraphBlock,
        ]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe('paragraph');
        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith(
          expect.any(Array),
          sectionMetadata,
        );
      });

      it('should process multiple children of same type', () => {
        const children: PMNode[] = [
          { type: 'paragraph', content: [{ type: 'text', text: 'Para 1' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Para 2' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Para 3' }] },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn((params) => [
          {
            kind: 'paragraph',
            id: `p-${params.para.content[0].text}`,
            runs: [{ text: params.para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
          } as ParagraphBlock,
        ]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(3);
        expect(mockParagraphConverter).toHaveBeenCalledTimes(3);
        expect(recordBlockKind).toHaveBeenCalledTimes(3);
      });

      it('should process multiple children of different types', () => {
        const children: PMNode[] = [
          { type: 'paragraph', content: [] },
          { type: 'table', content: [] },
          { type: 'image', attrs: { src: 'test.png' } },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);
        const mockTableConverter = vi.fn(() => ({ kind: 'table', id: 't1', rows: [] }) as TableBlock);
        const mockImageConverter = vi.fn(() => ({ kind: 'image', id: 'i1', src: 'test.png' }));

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: mockTableConverter as never,
            imageNodeToBlock: mockImageConverter as never,
          },
        );

        expect(blocks).toHaveLength(3);
        expect(blocks[0].kind).toBe('paragraph');
        expect(blocks[1].kind).toBe('table');
        expect(blocks[2].kind).toBe('image');
      });

      it('should handle undefined section metadata', () => {
        const children: PMNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        processDocumentSectionChildren(
          children,
          undefined,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(1);
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith(expect.any(Array), undefined);
      });
    });

    // ==================== Paragraph Child Handling Tests ====================
    describe('Paragraph child handling', () => {
      it('should convert paragraph and apply section metadata', () => {
        const children: PMNode[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'Test' }] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(mockParagraphConverter).toHaveBeenCalledWith(
          expect.objectContaining({
            para: children[0],
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          }),
        );
      });

      it('should handle multiple paragraph blocks from converter', () => {
        const children: PMNode[] = [{ type: 'paragraph', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [
          { kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock,
          { kind: 'paragraph', id: 'p2', runs: [] } as ParagraphBlock,
          { kind: 'paragraph', id: 'p3', runs: [] } as ParagraphBlock,
        ]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(3);
        expect(recordBlockKind).toHaveBeenCalledTimes(3);
      });

      it('should apply metadata only to paragraph blocks from converter', () => {
        const children: PMNode[] = [{ type: 'paragraph', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const para1: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs: [] };
        const para2: ParagraphBlock = { kind: 'paragraph', id: 'p2', runs: [] };

        const mockParagraphConverter = vi.fn(() => [para1, para2]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith([para1, para2], sectionMetadata);
      });

      it('should record block kind for each paragraph', () => {
        const children: PMNode[] = [{ type: 'paragraph', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [
          { kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock,
          { kind: 'paragraph', id: 'p2', runs: [] } as ParagraphBlock,
        ]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(recordBlockKind).toHaveBeenNthCalledWith(1, 'paragraph');
        expect(recordBlockKind).toHaveBeenNthCalledWith(2, 'paragraph');
      });

      it('should handle non-paragraph blocks from converter (e.g., page breaks)', () => {
        const children: PMNode[] = [{ type: 'paragraph', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [
          { kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock,
          { kind: 'page-break', id: 'pb1' } as FlowBlock,
          { kind: 'paragraph', id: 'p2', runs: [] } as ParagraphBlock,
        ]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(3);
        expect(blocks[1].kind).toBe('page-break');
        expect(recordBlockKind).toHaveBeenCalledWith('page-break');
      });
    });

    // ==================== Table Child Handling Tests ====================
    describe('Table child handling', () => {
      it('should convert table and apply section metadata', () => {
        const children: PMNode[] = [{ type: 'table', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockTableBlock: TableBlock = {
          kind: 'table',
          id: 't1',
          rows: [
            {
              cells: [
                {
                  paragraph: { kind: 'paragraph', id: 'p1', runs: [] },
                },
              ],
            },
          ],
        };

        const mockTableConverter = vi.fn(() => mockTableBlock);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: mockTableConverter as never,
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(mockTableConverter).toHaveBeenCalledWith(
          expect.objectContaining({
            node: children[0],
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          }),
        );
        expect(metadataModule.applySdtMetadataToTableBlock).toHaveBeenCalledWith(mockTableBlock, sectionMetadata);
        expect(blocks).toHaveLength(1);
        expect(recordBlockKind).toHaveBeenCalledWith('table');
      });

      it('should handle null return from table converter', () => {
        const children: PMNode[] = [{ type: 'table', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockTableConverter = vi.fn(() => null);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: mockTableConverter as never,
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(0);
        expect(recordBlockKind).not.toHaveBeenCalled();
        expect(metadataModule.applySdtMetadataToTableBlock).not.toHaveBeenCalled();
      });

      it('should record block kind for table', () => {
        const children: PMNode[] = [{ type: 'table', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockTableConverter = vi.fn(() => ({ kind: 'table', id: 't1', rows: [] }) as TableBlock);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: mockTableConverter as never,
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(recordBlockKind).toHaveBeenCalledWith('table');
      });
    });

    // ==================== Image Child Handling Tests ====================
    describe('Image child handling', () => {
      it('should convert image and apply section metadata', () => {
        const children: PMNode[] = [{ type: 'image', attrs: { src: 'test.png' } }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockImageBlock = { kind: 'image', id: 'i1', src: 'test.png' };

        const mockImageConverter = vi.fn(() => mockImageBlock);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: mockImageConverter as never,
          },
        );

        expect(mockImageConverter).toHaveBeenCalledWith(children[0], mockBlockIdGenerator, mockPositionMap);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toBe(mockImageBlock);
        expect(recordBlockKind).toHaveBeenCalledWith('image');
      });

      it('should handle null return from image converter', () => {
        const children: PMNode[] = [{ type: 'image', attrs: { src: 'test.png' } }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockImageConverter = vi.fn(() => null);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: mockImageConverter as never,
          },
        );

        expect(blocks).toHaveLength(0);
        expect(recordBlockKind).not.toHaveBeenCalled();
      });

      it('should not add block if kind is not image', () => {
        const children: PMNode[] = [{ type: 'image', attrs: { src: 'test.png' } }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockImageConverter = vi.fn(() => ({ kind: 'paragraph', id: 'p1', runs: [] }));

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: mockImageConverter as never,
          },
        );

        expect(blocks).toHaveLength(0);
        expect(recordBlockKind).not.toHaveBeenCalled();
      });
    });

    // ==================== Nested Structured Content Tests ====================
    describe('Nested structured content', () => {
      it('should process nested paragraph with metadata chaining', () => {
        const nestedMetadata: SdtMetadata = {
          type: 'structuredContentBlock',
          id: 'nested-1',
        };

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(nestedMetadata);

        const children: PMNode[] = [
          {
            type: 'structuredContentBlock',
            attrs: { id: 'nested-1' },
            content: [{ type: 'paragraph', content: [] }],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const para: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs: [] };
        const mockParagraphConverter = vi.fn(() => [para]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(metadataModule.resolveNodeSdtMetadata).toHaveBeenCalledWith(children[0], 'structuredContentBlock');
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith([para], nestedMetadata);
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith([para], sectionMetadata);
        expect(blocks).toHaveLength(1);
      });

      it('should process nested table with metadata chaining', () => {
        const nestedMetadata: SdtMetadata = {
          type: 'structuredContentBlock',
          id: 'nested-1',
        };

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(nestedMetadata);

        const children: PMNode[] = [
          {
            type: 'structuredContentBlock',
            attrs: { id: 'nested-1' },
            content: [{ type: 'table', content: [] }],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const tableBlock: TableBlock = { kind: 'table', id: 't1', rows: [] };
        const mockTableConverter = vi.fn(() => tableBlock);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: mockTableConverter as never,
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(metadataModule.applySdtMetadataToTableBlock).toHaveBeenCalledWith(tableBlock, nestedMetadata);
        expect(metadataModule.applySdtMetadataToTableBlock).toHaveBeenCalledWith(tableBlock, sectionMetadata);
        expect(blocks).toHaveLength(1);
      });

      it('should apply both nested and section metadata in correct order', () => {
        const nestedMetadata: SdtMetadata = {
          type: 'structuredContentBlock',
          id: 'nested-1',
        };

        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(nestedMetadata);

        const children: PMNode[] = [
          {
            type: 'structuredContentBlock',
            attrs: { id: 'nested-1' },
            content: [{ type: 'paragraph', content: [] }],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const para: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs: [] };
        const mockParagraphConverter = vi.fn(() => [para]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        const calls = vi.mocked(metadataModule.applySdtMetadataToParagraphBlocks).mock.calls;
        expect(calls.length).toBe(2);
        expect(calls[0][1]).toBe(nestedMetadata); // nested first
        expect(calls[1][1]).toBe(sectionMetadata); // section second
      });

      it('should handle nested metadata undefined', () => {
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined);

        const children: PMNode[] = [
          {
            type: 'structuredContentBlock',
            attrs: {},
            content: [{ type: 'paragraph', content: [] }],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const para: ParagraphBlock = { kind: 'paragraph', id: 'p1', runs: [] };
        const mockParagraphConverter = vi.fn(() => [para]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith([para], undefined);
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith([para], sectionMetadata);
      });

      it('should skip nested content if content is missing', () => {
        const children: PMNode[] = [
          {
            type: 'structuredContentBlock',
            attrs: { id: 'nested-1' },
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(0);
      });

      it('should process multiple nested children', () => {
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'structuredContentBlock',
          id: 'nested-1',
        });

        const children: PMNode[] = [
          {
            type: 'structuredContentBlock',
            attrs: { id: 'nested-1' },
            content: [
              { type: 'paragraph', content: [] },
              { type: 'paragraph', content: [] },
              { type: 'table', content: [] },
            ],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);
        const mockTableConverter = vi.fn(() => ({ kind: 'table', id: 't1', rows: [] }) as TableBlock);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: mockTableConverter as never,
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(3);
        expect(mockParagraphConverter).toHaveBeenCalledTimes(2);
        expect(mockTableConverter).toHaveBeenCalledTimes(1);
      });

      it('should record block kind for nested content', () => {
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'structuredContentBlock',
          id: 'nested-1',
        });

        const children: PMNode[] = [
          {
            type: 'structuredContentBlock',
            attrs: { id: 'nested-1' },
            content: [
              { type: 'paragraph', content: [] },
              { type: 'table', content: [] },
            ],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);
        const mockTableConverter = vi.fn(() => ({ kind: 'table', id: 't1', rows: [] }) as TableBlock);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: mockTableConverter as never,
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
        expect(recordBlockKind).toHaveBeenCalledWith('table');
      });
    });

    // ==================== Document Part Object / TOC Tests ====================
    describe('Document part object / TOC', () => {
      beforeEach(() => {
        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-123');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue('TOC \\o "1-3"');
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({
          type: 'docPartObject',
          gallery: 'Table of Contents',
        });
      });

      it('should process TOC (gallery = Table of Contents)', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: {
              docPartGallery: 'Table of Contents',
              id: 'toc-123',
              instruction: 'TOC \\o "1-3"',
            },
            content: [{ type: 'paragraph', content: [] }],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(metadataModule.getDocPartGallery).toHaveBeenCalledWith(children[0]);
        expect(metadataModule.getDocPartObjectId).toHaveBeenCalledWith(children[0]);
        expect(metadataModule.getNodeInstruction).toHaveBeenCalledWith(children[0]);
        expect(tocModule.processTocChildren).toHaveBeenCalled();
      });

      it('should apply section metadata to TOC paragraphs with containerSdt', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: {
              docPartGallery: 'Table of Contents',
              id: 'toc-123',
            },
            content: [],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        // Mock processTocChildren to add a TOC paragraph
        vi.mocked(tocModule.processTocChildren).mockImplementation((_, __, ___, outputArrays) => {
          const tocPara: ParagraphBlock = {
            kind: 'paragraph',
            id: 'toc-p1',
            runs: [],
            attrs: {
              sdt: {
                type: 'docPartObject',
                gallery: 'Table of Contents',
                uniqueId: 'toc-123',
              },
            },
          };
          outputArrays.blocks.push(tocPara);
        });

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(1);
        expect(blocks[0].attrs?.containerSdt).toEqual(sectionMetadata);
      });

      it('should preserve docPart metadata in attrs.sdt', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: {
              docPartGallery: 'Table of Contents',
              id: 'toc-123',
            },
            content: [],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const docPartMetadata: SdtMetadata = {
          type: 'docPartObject',
          gallery: 'Table of Contents',
          uniqueId: 'toc-123',
        };

        vi.mocked(tocModule.processTocChildren).mockImplementation((_, __, ___, outputArrays) => {
          const tocPara: ParagraphBlock = {
            kind: 'paragraph',
            id: 'toc-p1',
            runs: [],
            attrs: {
              sdt: docPartMetadata,
            },
          };
          outputArrays.blocks.push(tocPara);
        });

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks[0].attrs?.sdt).toEqual(docPartMetadata);
        expect(blocks[0].attrs?.containerSdt).toEqual(sectionMetadata);
      });

      it('should skip non-TOC document part', () => {
        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Bibliography');

        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: { docPartGallery: 'Bibliography' },
            content: [],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(tocModule.processTocChildren).not.toHaveBeenCalled();
        expect(blocks).toHaveLength(0);
      });

      it('should handle empty TOC content', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: { docPartGallery: 'Table of Contents' },
            content: [],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        // Reset the mock to not add any blocks (default behavior)
        vi.mocked(tocModule.processTocChildren).mockImplementation(() => {
          // Do nothing - empty TOC
        });

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(tocModule.processTocChildren).toHaveBeenCalled();
        expect(blocks).toHaveLength(0);
      });

      it('should call processTocChildren with correct parameters', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: {
              docPartGallery: 'Table of Contents',
              id: 'toc-123',
              instruction: 'TOC \\o "1-3"',
            },
            content: [{ type: 'paragraph', content: [] }],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn();

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(tocModule.processTocChildren).toHaveBeenCalledWith(
          Array.from(children[0].content!),
          {
            docPartGallery: 'Table of Contents',
            docPartObjectId: 'toc-123',
            tocInstruction: 'TOC \\o "1-3"',
            sdtMetadata: expect.objectContaining({ type: 'docPartObject' }),
          },
          expect.objectContaining({
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            converters: expect.any(Object),
          }),
          { blocks, recordBlockKind },
        );
      });

      it('should record block kind for TOC blocks', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: { docPartGallery: 'Table of Contents' },
            content: [],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(tocModule.processTocChildren).mockImplementation((_, __, ___, outputArrays) => {
          outputArrays.blocks.push({ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock);
          outputArrays.recordBlockKind('paragraph');
        });

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
      });

      it('should apply normal section metadata to paragraphs without docPartObject metadata', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: { docPartGallery: 'Table of Contents' },
            content: [],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(tocModule.processTocChildren).mockImplementation((_, __, ___, outputArrays) => {
          // Add a paragraph without docPartObject metadata
          outputArrays.blocks.push({
            kind: 'paragraph',
            id: 'p1',
            runs: [],
            attrs: {
              sdt: {
                type: 'documentSection',
                id: 'other-section',
              },
            },
          } as ParagraphBlock);
        });

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalled();
      });

      it('should handle multiple TOC blocks', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: { docPartGallery: 'Table of Contents' },
            content: [],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(tocModule.processTocChildren).mockImplementation((_, __, ___, outputArrays) => {
          outputArrays.blocks.push({
            kind: 'paragraph',
            id: 'p1',
            runs: [],
            attrs: { sdt: { type: 'docPartObject', gallery: 'Table of Contents' } },
          } as ParagraphBlock);
          outputArrays.blocks.push({
            kind: 'paragraph',
            id: 'p2',
            runs: [],
            attrs: { sdt: { type: 'docPartObject', gallery: 'Table of Contents' } },
          } as ParagraphBlock);
        });

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(2);
        expect(blocks[0].attrs?.containerSdt).toEqual(sectionMetadata);
        expect(blocks[1].attrs?.containerSdt).toEqual(sectionMetadata);
      });

      it('should extract instruction and objectId', () => {
        const children: PMNode[] = [
          {
            type: 'documentPartObject',
            attrs: {
              docPartGallery: 'Table of Contents',
              id: 'custom-toc-id',
              instruction: 'TOC \\o "2-4" \\h \\z',
            },
            content: [],
          },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('custom-toc-id');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue('TOC \\o "2-4" \\h \\z');

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn() as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(tocModule.processTocChildren).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            docPartObjectId: 'custom-toc-id',
            tocInstruction: 'TOC \\o "2-4" \\h \\z',
          }),
          expect.anything(),
          expect.anything(),
        );
      });
    });

    // ==================== Additional Edge Cases ====================
    describe('Additional edge cases', () => {
      it('should pass bookmarks to paragraph converter', () => {
        const children: PMNode[] = [{ type: 'paragraph', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();
        const mockBookmarks = new Map([['bookmark1', { start: 0, end: 5 }]]);

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            bookmarks: mockBookmarks,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(mockParagraphConverter).toHaveBeenCalledWith(
          expect.objectContaining({
            para: children[0],
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            bookmarks: mockBookmarks,
            hyperlinkConfig: mockHyperlinkConfig,
          }),
        );
      });

      it('should ignore unknown child types', () => {
        const children: PMNode[] = [
          { type: 'unknownType', content: [] },
          { type: 'paragraph', content: [] },
        ];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockParagraphConverter = vi.fn(() => [{ kind: 'paragraph', id: 'p1', runs: [] } as ParagraphBlock]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(1);
        expect(mockParagraphConverter).toHaveBeenCalledTimes(1);
      });

      it('should handle mixed extra blocks with non-paragraph kinds', () => {
        const children: PMNode[] = [{ type: 'paragraph', content: [] }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const extraPara: ParagraphBlock = { kind: 'paragraph', id: 'extra1', runs: [] };
        const extraPageBreak: FlowBlock = { kind: 'page-break', id: 'pb1' };

        const mockParagraphConverter = vi.fn(() => [extraPara, extraPageBreak]);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: mockParagraphConverter as never,
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: vi.fn(),
          },
        );

        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toBe(extraPara);
        expect(blocks[1]).toBe(extraPageBreak);
        expect(metadataModule.applySdtMetadataToParagraphBlocks).toHaveBeenCalledWith([extraPara], sectionMetadata);
      });

      it('should apply metadata to image with existing attrs', () => {
        const children: PMNode[] = [{ type: 'image', attrs: { src: 'test.png' } }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockImageBlock = {
          kind: 'image',
          id: 'i1',
          src: 'test.png',
          attrs: { someExisting: 'value' },
        };

        const mockImageConverter = vi.fn(() => mockImageBlock);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: mockImageConverter as never,
          },
        );

        expect(blocks[0].attrs).toEqual({
          someExisting: 'value',
          sdt: sectionMetadata,
        });
      });

      it('should apply metadata to image without existing attrs', () => {
        const children: PMNode[] = [{ type: 'image', attrs: { src: 'test.png' } }];

        const blocks: FlowBlock[] = [];
        const recordBlockKind = vi.fn();

        const mockImageBlock = { kind: 'image', id: 'i1', src: 'test.png' };

        const mockImageConverter = vi.fn(() => mockImageBlock);

        processDocumentSectionChildren(
          children,
          sectionMetadata,
          {
            nextBlockId: mockBlockIdGenerator,
            positions: mockPositionMap,
            defaultFont: 'Arial',
            defaultSize: 12,
            styleContext: mockStyleContext,
            hyperlinkConfig: mockHyperlinkConfig,
          },
          { blocks, recordBlockKind },
          {
            paragraphToFlowBlocks: vi.fn(),
            tableNodeToBlock: vi.fn(),
            imageNodeToBlock: mockImageConverter as never,
          },
        );

        expect(blocks[0].attrs).toEqual({
          sdt: sectionMetadata,
        });
      });
    });
  });
});
