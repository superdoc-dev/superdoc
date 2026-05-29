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
      it('should pass correct context parameters', () => {
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
            bookmarks: mockContext.bookmarks,
            hyperlinkConfig: mockHyperlinkConfig,
            converters: mockContext.converters,
            converterContext: mockConverterContext,
            enableComments: mockEnableComments,
            trackedChangesConfig: undefined,
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

    // ==================== Table Children Tests ====================
    describe('Table children', () => {
      it('should process tableOfContents children for non-"Table of Contents" gallery types (e.g. "Custom Table of Contents")', () => {
        const tocNode: PMNode = {
          type: 'tableOfContents',
          content: [{ type: 'paragraph', content: [] }],
          attrs: { instruction: 'TOC \\o "1-3"' },
        };
        const node: PMNode = {
          type: 'documentPartObject',
          content: [tocNode],
          attrs: { docPartGallery: 'Custom Table of Contents' },
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Custom Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined as never);

        handleDocumentPartObjectNode(node, mockContext);

        expect(tocModule.processTocChildren).toHaveBeenCalledOnce();
        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[0]).toEqual(tocNode.content);
        expect(callArgs[1]).toMatchObject({ docPartGallery: 'Custom Table of Contents' });
      });

      it('should prefer the child tableOfContents instruction over the wrapper SDT instruction', () => {
        // In real "Custom Table of Contents" docs, Word stores the TOC field codes on
        // the child node, not the wrapper SDT. The new branch must read from the child
        // first, otherwise per-TOC options like '\\o "1-3"' are silently dropped.
        const childInstruction = 'TOC \\o "1-1" \\h \\z \\u';
        const tocNode: PMNode = {
          type: 'tableOfContents',
          content: [{ type: 'paragraph', content: [] }],
          attrs: { instruction: childInstruction },
        };
        const node: PMNode = {
          type: 'documentPartObject',
          content: [tocNode],
          attrs: { docPartGallery: 'Custom Table of Contents' },
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Custom Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        // Wrapper SDT has no instruction; child carries the TOC field codes
        vi.mocked(metadataModule.getNodeInstruction).mockImplementation((n: PMNode) =>
          n.type === 'tableOfContents' ? childInstruction : undefined,
        );
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined as never);

        handleDocumentPartObjectNode(node, mockContext);

        expect(tocModule.processTocChildren).toHaveBeenCalledOnce();
        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[1]).toMatchObject({ tocInstruction: childInstruction });
      });

      it('should fall back to the wrapper SDT instruction when the child tableOfContents has none', () => {
        const wrapperInstruction = 'TOC \\o "1-3"';
        const tocNode: PMNode = {
          type: 'tableOfContents',
          content: [{ type: 'paragraph', content: [] }],
        };
        const node: PMNode = {
          type: 'documentPartObject',
          content: [tocNode],
          attrs: { docPartGallery: 'Custom Table of Contents' },
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Custom Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        // Only the wrapper SDT carries an instruction; the child doesn't
        vi.mocked(metadataModule.getNodeInstruction).mockImplementation((n: PMNode) =>
          n.type === 'documentPartObject' ? wrapperInstruction : undefined,
        );
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined as never);

        handleDocumentPartObjectNode(node, mockContext);

        expect(tocModule.processTocChildren).toHaveBeenCalledOnce();
        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[1]).toMatchObject({ tocInstruction: wrapperInstruction });
      });

      it('should not call processTocChildren when the tableOfContents child has no content array', () => {
        // Guards against the Array.isArray check that the new branch added; without
        // it, processTocChildren would be invoked with a non-array and crash.
        const tocNode: PMNode = {
          type: 'tableOfContents',
          // no content
          attrs: { instruction: 'TOC \\o "1-3"' },
        };
        const node: PMNode = {
          type: 'documentPartObject',
          content: [tocNode],
          attrs: { docPartGallery: 'Custom Table of Contents' },
        };

        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Custom Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue(undefined as never);

        handleDocumentPartObjectNode(node, mockContext);

        expect(tocModule.processTocChildren).not.toHaveBeenCalled();
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

    // ==================== Pending section-break emission (SD-2557) ====================
    describe('pending section break at SDT boundary', () => {
      const sectionFixture = (startParagraphIndex: number) => ({
        ranges: [
          {
            sectionIndex: 0,
            startParagraphIndex: 0,
            endParagraphIndex: 0,
            sectPr: null,
            margins: null,
            headerRefs: {},
            footerRefs: {},
            type: 'nextPage',
          },
          {
            sectionIndex: 1,
            startParagraphIndex,
            endParagraphIndex: 10,
            sectPr: null,
            margins: null,
            headerRefs: {},
            footerRefs: {},
            type: 'nextPage',
          },
        ],
        currentSectionIndex: 0,
        currentParagraphIndex: startParagraphIndex,
      });

      // For the TOC branch, per-child emission now lives inside `processTocChildren`
      // (which is mocked in these tests). The non-TOC branch below exercises the
      // inline per-child emission path directly.
      it('emits a section break before a docPartObj non-TOC child at a section boundary', () => {
        // Repro for SD-2557 at the non-TOC path: same root cause — the handler
        // processes child paragraphs but previously skipped the section-break check.
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Page Number' }] }],
        };
        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Building Block Gallery');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('bb-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({ type: 'docPartObject' });

        // currentParagraphIndex === nextSection.startParagraphIndex → the first
        // child paragraph is the start of section 1.
        mockContext.sectionState = sectionFixture(3) as unknown as NodeHandlerContext['sectionState'];

        handleDocumentPartObjectNode(node, mockContext);

        const sectionBreak = mockContext.blocks.find((b) => b.kind === 'sectionBreak');
        expect(sectionBreak).toBeDefined();
        expect(mockContext.sectionState!.currentSectionIndex).toBe(1);
        // Counter must advance past the child paragraph so subsequent body
        // content sees the correct paragraph index.
        expect(mockContext.sectionState!.currentParagraphIndex).toBe(4);
      });

      it('does not emit a section break when the child is not at a section boundary', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Page Number' }] }],
        };
        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Building Block Gallery');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('bb-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({ type: 'docPartObject' });

        // currentParagraphIndex (2) < startParagraphIndex (5): not at boundary.
        const state = sectionFixture(5);
        state.currentParagraphIndex = 2;
        mockContext.sectionState = state as unknown as NodeHandlerContext['sectionState'];

        handleDocumentPartObjectNode(node, mockContext);

        expect(mockContext.blocks.find((b) => b.kind === 'sectionBreak')).toBeUndefined();
        expect(mockContext.sectionState!.currentSectionIndex).toBe(0);
        // Counter still advances past the processed child.
        expect(mockContext.sectionState!.currentParagraphIndex).toBe(3);
      });

      it('is a no-op when sectionState is undefined', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Page Number' }] }],
        };
        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Building Block Gallery');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('bb-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({ type: 'docPartObject' });

        mockContext.sectionState = undefined;

        expect(() => handleDocumentPartObjectNode(node, mockContext)).not.toThrow();
        expect(mockContext.blocks.find((b) => b.kind === 'sectionBreak')).toBeUndefined();
      });

      it('passes sectionState through to processTocChildren for TOC gallery', () => {
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'TOC Entry' }] }],
        };
        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Table of Contents');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('toc-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({ type: 'docPartObject' });

        const state = sectionFixture(3);
        mockContext.sectionState = state as unknown as NodeHandlerContext['sectionState'];

        handleDocumentPartObjectNode(node, mockContext);

        // processTocChildren is mocked; just verify it received sectionState
        // so the helper-inside-processTocChildren pattern can work end-to-end.
        const callArgs = vi.mocked(tocModule.processTocChildren).mock.calls[0];
        expect(callArgs[2]).toMatchObject({ sectionState: state });
      });
    });

    // ==================== SD-3005: block field children ====================
    describe('block field children (SD-3005)', () => {
      beforeEach(() => {
        vi.mocked(metadataModule.getDocPartGallery).mockReturnValue('Bibliographies');
        vi.mocked(metadataModule.getDocPartObjectId).mockReturnValue('bib-1');
        vi.mocked(metadataModule.getNodeInstruction).mockReturnValue(undefined);
        vi.mocked(metadataModule.resolveNodeSdtMetadata).mockReturnValue({ type: 'docPartObject' });
      });

      const bibliography = (): PMNode =>
        ({
          type: 'bibliography',
          attrs: { instruction: 'BIBLIOGRAPHY' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Entry One' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Entry Two' }] },
          ],
        }) as unknown as PMNode;

      // Minimal section state with a far-away boundary so no break is emitted —
      // these tests only assert rendering + the paragraph-index counter.
      const withSectionState = () => {
        mockContext.sectionState = {
          ranges: [{ sectionIndex: 0, startParagraphIndex: 0, endParagraphIndex: 99 }],
          currentSectionIndex: 0,
          currentParagraphIndex: 0,
        } as unknown as NonNullable<NodeHandlerContext['sectionState']>;
      };

      it('renders a direct bibliography child (heading + both entries become blocks)', () => {
        withSectionState();
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bibliography' }] }, bibliography()],
        };

        handleDocumentPartObjectNode(node, mockContext);

        // heading paragraph + 2 bibliography entry paragraphs
        expect(mockParagraphConverter).toHaveBeenCalledTimes(3);
        expect(mockContext.blocks).toHaveLength(3);
      });

      it('advances currentParagraphIndex through a bibliography child to match findParagraphsWithSectPr', () => {
        // findParagraphsWithSectPr recurses `bibliography`, so the handler must
        // advance the counter per entry or section breaks downstream drift.
        withSectionState();
        const node: PMNode = {
          type: 'documentPartObject',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bibliography' }] }, bibliography()],
        };

        handleDocumentPartObjectNode(node, mockContext);

        // heading (1) + Entry One (1) + Entry Two (1) = 3 paragraphs counted
        expect(mockContext.sectionState!.currentParagraphIndex).toBe(3);
      });

      it('renders a structuredContentBlock-wrapped bibliography without advancing the counter', () => {
        // findParagraphsWithSectPr does NOT recurse structuredContentBlock, so its
        // inner paragraphs render but must not advance currentParagraphIndex.
        withSectionState();
        const node: PMNode = {
          type: 'documentPartObject',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Bibliography' }] },
            { type: 'structuredContentBlock', attrs: {}, content: [bibliography()] },
          ],
        };

        handleDocumentPartObjectNode(node, mockContext);

        // both entries still render
        expect(mockParagraphConverter).toHaveBeenCalledTimes(3); // heading + 2 entries
        // but only the heading advanced the counter (scb is not recursed by analysis)
        expect(mockContext.sectionState!.currentParagraphIndex).toBe(1);
      });
    });
  });
});
