/**
 * Tests for Table of Contents (TOC) Processing Module
 */

import { describe, it, expect, vi } from 'vitest';
import { applyTocMetadata, processTocChildren, handleTableOfContentsNode } from './toc.js';
import type { PMNode, NodeHandlerContext } from '../types.js';
import type { FlowBlock, ParagraphBlock, SdtMetadata } from '@superdoc/contracts';

describe('toc', () => {
  describe('applyTocMetadata', () => {
    it('applies TOC metadata to paragraph blocks', () => {
      const blocks: ParagraphBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Chapter 1', fontFamily: 'Arial', fontSize: 12 }],
        },
        {
          kind: 'paragraph',
          id: 'p2',
          runs: [{ text: 'Chapter 2', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];

      applyTocMetadata(blocks, {
        gallery: 'Table of Contents',
        uniqueId: 'toc-123',
        instruction: 'TOC \\o "1-3" \\h \\z \\u',
      });

      expect(blocks[0].attrs?.isTocEntry).toBe(true);
      expect(blocks[0].attrs?.tocInstruction).toBe('TOC \\o "1-3" \\h \\z \\u');
      expect(blocks[0].attrs?.sdt).toEqual({
        type: 'docPartObject',
        gallery: 'Table of Contents',
        uniqueId: 'toc-123',
        instruction: 'TOC \\o "1-3" \\h \\z \\u',
      });

      expect(blocks[1].attrs?.isTocEntry).toBe(true);
      expect(blocks[1].attrs?.sdt).toEqual({
        type: 'docPartObject',
        gallery: 'Table of Contents',
        uniqueId: 'toc-123',
        instruction: 'TOC \\o "1-3" \\h \\z \\u',
      });
    });

    it('skips non-paragraph blocks', () => {
      const blocks: FlowBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Chapter 1', fontFamily: 'Arial', fontSize: 12 }],
        },
        {
          kind: 'table',
          id: 't1',
          rows: [],
        },
      ];

      applyTocMetadata(blocks, {
        gallery: 'Table of Contents',
        uniqueId: 'toc-123',
        instruction: 'TOC \\o "1-3"',
      });

      expect(blocks[0].attrs?.isTocEntry).toBe(true);
      expect((blocks[1] as never).attrs?.isTocEntry).toBeUndefined();
    });

    it('does not overwrite existing sdt metadata', () => {
      const existingSdt: SdtMetadata = {
        type: 'documentSection',
        id: 'section-1',
      };

      const blocks: ParagraphBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Chapter 1', fontFamily: 'Arial', fontSize: 12 }],
          attrs: { sdt: existingSdt },
        },
      ];

      applyTocMetadata(blocks, {
        gallery: 'Table of Contents',
        uniqueId: 'toc-123',
      });

      // Should not overwrite existing sdt
      expect(blocks[0].attrs?.sdt).toEqual(existingSdt);
      expect(blocks[0].attrs?.isTocEntry).toBe(true);
    });

    it('does not fabricate sdt metadata when gallery is missing', () => {
      // A direct `tableOfContents` PM node has no enclosing w:sdt in OOXML,
      // so we must not invent a docPartObject SDT metadata entry for it.
      const blocks: ParagraphBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Chapter 1', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];

      applyTocMetadata(blocks, {
        gallery: null,
        uniqueId: null,
        instruction: null,
      });

      expect(blocks[0].attrs?.isTocEntry).toBe(true);
      expect(blocks[0].attrs?.sdt).toBeUndefined();
      expect(blocks[0].attrs?.tocInstruction).toBeUndefined();
    });

    it('creates attrs object if it does not exist', () => {
      const blocks: ParagraphBlock[] = [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Chapter 1', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];

      expect(blocks[0].attrs).toBeUndefined();

      applyTocMetadata(blocks, {
        gallery: 'Table of Contents',
        uniqueId: 'toc-123',
      });

      expect(blocks[0].attrs).toBeDefined();
      expect(blocks[0].attrs?.isTocEntry).toBe(true);
    });
  });

  describe('processTocChildren', () => {
    const mockBlockIdGenerator = () => 'test-id';
    const mockPositionMap = new Map();
    const mockHyperlinkConfig = {
      mode: 'preserve' as const,
    };
    const mockConverterContext = { docx: {} } as never;

    it('processes direct paragraph children', () => {
      const children: PMNode[] = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Chapter 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Chapter 2' }],
        },
      ];

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const mockParagraphConverter = vi.fn((params) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${params.para.content[0].text}`,
            runs: [{ text: params.para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
          },
        ];
      });

      processTocChildren(
        children,
        {
          docPartGallery: 'Table of Contents',
          docPartObjectId: 'toc-123',
          tocInstruction: 'TOC \\o "1-3"',
          sdtMetadata: { type: 'docPartObject', gallery: 'Table of Contents' },
        },
        {
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: true,
          converters: { paragraphToFlowBlocks: mockParagraphConverter } as never,
          converterContext: mockConverterContext,
        },
        { blocks, recordBlockKind },
      );

      expect(blocks).toHaveLength(2);
      expect(blocks[0].attrs?.isTocEntry).toBe(true);
      expect(blocks[0].attrs?.tocInstruction).toBe('TOC \\o "1-3"');
      expect(blocks[1].attrs?.isTocEntry).toBe(true);
      expect(recordBlockKind).toHaveBeenCalledTimes(2);
      expect(recordBlockKind).toHaveBeenCalledWith('paragraph');
    });

    it('processes nested tableOfContents children recursively', () => {
      const children: PMNode[] = [
        {
          type: 'tableOfContents',
          attrs: { instruction: 'TOC \\o "2-3"' },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Nested Chapter' }],
            },
          ],
        },
      ];

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const mockParagraphConverter = vi.fn((params) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${params.para.content[0].text}`,
            runs: [{ text: params.para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
          },
        ];
      });

      processTocChildren(
        children,
        {
          docPartGallery: 'Table of Contents',
          docPartObjectId: 'toc-123',
          tocInstruction: 'TOC \\o "1-3"',
          sdtMetadata: { type: 'docPartObject', gallery: 'Table of Contents' },
        },
        {
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: true,
          converters: { paragraphToFlowBlocks: mockParagraphConverter } as never,
          converterContext: mockConverterContext,
        },
        { blocks, recordBlockKind },
      );

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs?.isTocEntry).toBe(true);
      // Should use nested instruction
      expect(blocks[0].attrs?.tocInstruction).toBe('TOC \\o "2-3"');
    });

    it('uses parent instruction when nested tableOfContents has no instruction', () => {
      const children: PMNode[] = [
        {
          type: 'tableOfContents',
          attrs: {},
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Nested Chapter' }],
            },
          ],
        },
      ];

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const mockParagraphConverter = vi.fn((params) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${params.para.content[0].text}`,
            runs: [{ text: params.para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
          },
        ];
      });

      processTocChildren(
        children,
        {
          docPartGallery: 'Table of Contents',
          docPartObjectId: 'toc-123',
          tocInstruction: 'TOC \\o "1-3"',
          sdtMetadata: { type: 'docPartObject', gallery: 'Table of Contents' },
        },
        {
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: true,
          converters: { paragraphToFlowBlocks: mockParagraphConverter } as never,
          converterContext: mockConverterContext,
        },
        { blocks, recordBlockKind },
      );

      expect(blocks).toHaveLength(1);
      // Should use parent instruction
      expect(blocks[0].attrs?.tocInstruction).toBe('TOC \\o "1-3"');
    });

    it('applies SDT metadata to paragraph blocks', () => {
      const children: PMNode[] = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Chapter 1' }],
        },
      ];

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const sdtMetadata: SdtMetadata = {
        type: 'docPartObject',
        gallery: 'Table of Contents',
        uniqueId: 'toc-123',
      };

      const mockParagraphConverter = vi.fn((params) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${params.para.content[0].text}`,
            runs: [{ text: params.para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
          },
        ];
      });

      processTocChildren(
        children,
        {
          docPartGallery: 'Table of Contents',
          docPartObjectId: 'toc-123',
          sdtMetadata,
        },
        {
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: true,
          converters: { paragraphToFlowBlocks: mockParagraphConverter } as never,
          converterContext: mockConverterContext,
        },
        { blocks, recordBlockKind },
      );

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs?.sdt).toEqual(sdtMetadata);
    });

    it('handles mixed content types', () => {
      const children: PMNode[] = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Chapter 1' }],
        },
        {
          type: 'tableOfContents',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Section 1.1' }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Chapter 2' }],
        },
      ];

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();

      const mockParagraphConverter = vi.fn((params) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${params.para.content[0].text}`,
            runs: [{ text: params.para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
          },
        ];
      });

      processTocChildren(
        children,
        {
          docPartGallery: 'Table of Contents',
          docPartObjectId: 'toc-123',
        },
        {
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Arial',
          defaultSize: 12,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: true,
          converters: { paragraphToFlowBlocks: mockParagraphConverter } as never,
          converterContext: mockConverterContext,
        },
        { blocks, recordBlockKind },
      );

      expect(blocks).toHaveLength(3);
      expect(blocks[0].attrs?.isTocEntry).toBe(true);
      expect(blocks[1].attrs?.isTocEntry).toBe(true);
      expect(blocks[2].attrs?.isTocEntry).toBe(true);
    });

    it('passes all context parameters to paragraph converter', () => {
      const children: PMNode[] = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Chapter 1' }],
        },
      ];

      const blocks: FlowBlock[] = [];
      const recordBlockKind = vi.fn();
      const mockBookmarks = new Map([['bookmark1', 42]]);
      const mockTrackedChanges = { enabled: true };

      const mockParagraphConverter = vi.fn((_params) => {
        return [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Chapter 1', fontFamily: 'Arial', fontSize: 12 }],
          },
        ];
      });

      processTocChildren(
        children,
        {
          docPartGallery: 'Table of Contents',
          docPartObjectId: 'toc-123',
        },
        {
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          defaultFont: 'Calibri',
          defaultSize: 14,
          bookmarks: mockBookmarks,
          trackedChangesConfig: mockTrackedChanges,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: false,
          converters: { paragraphToFlowBlocks: mockParagraphConverter } as never,
          converterContext: mockConverterContext,
        },
        { blocks, recordBlockKind },
      );

      expect(mockParagraphConverter).toHaveBeenCalledWith(
        expect.objectContaining({
          para: children[0],
          nextBlockId: mockBlockIdGenerator,
          positions: mockPositionMap,
          trackedChangesConfig: mockTrackedChanges,
          bookmarks: mockBookmarks,
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: false,
          converterContext: mockConverterContext,
          converters: { paragraphToFlowBlocks: mockParagraphConverter },
        }),
      );
    });

    it('forwards themeColors to the paragraph converter', () => {
      const children: PMNode[] = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Entry' }],
        },
      ];
      const blocks: FlowBlock[] = [];
      const themeColors = { accent1: '#ff0000' } as never;

      const mockParagraphConverter = vi.fn(() => [
        {
          kind: 'paragraph',
          id: 'p1',
          runs: [{ text: 'Entry', fontFamily: 'Arial', fontSize: 12 }],
        } as ParagraphBlock,
      ]);

      processTocChildren(
        children,
        { docPartGallery: 'Table of Contents' },
        {
          nextBlockId: () => 'id',
          positions: new Map(),
          bookmarks: new Map(),
          hyperlinkConfig: mockHyperlinkConfig,
          enableComments: true,
          converters: { paragraphToFlowBlocks: mockParagraphConverter } as never,
          converterContext: mockConverterContext,
          themeColors,
        },
        { blocks },
      );

      expect(mockParagraphConverter).toHaveBeenCalledWith(expect.objectContaining({ themeColors }));
    });
  });

  // ==================== handleTableOfContentsNode (direct node) ====================
  describe('handleTableOfContentsNode', () => {
    const baseContext = (overrides: Partial<NodeHandlerContext> = {}): NodeHandlerContext => {
      const paragraphConverter = vi.fn((params: { para: PMNode }) => {
        const text = (params.para.content as { text: string }[] | undefined)?.[0]?.text ?? '';
        return [
          {
            kind: 'paragraph',
            id: `p-${text}`,
            runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
          } as ParagraphBlock,
        ];
      });
      return {
        blocks: [],
        recordBlockKind: vi.fn(),
        nextBlockId: (kind: string) => `${kind}-id`,
        positions: new Map(),
        defaultFont: 'Arial',
        defaultSize: 12,
        bookmarks: new Map(),
        hyperlinkConfig: { mode: 'preserve' } as never,
        enableComments: true,
        converterContext: { docx: {} } as never,
        converters: { paragraphToFlowBlocks: paragraphConverter } as never,
        trackedChangesConfig: undefined as never,
        ...overrides,
      };
    };

    const sectionStateAt = (startParagraphIndex: number, currentParagraphIndex: number) =>
      ({
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
            endParagraphIndex: 99,
            sectPr: null,
            margins: null,
            headerRefs: {},
            footerRefs: {},
            type: 'nextPage',
          },
        ],
        currentSectionIndex: 0,
        currentParagraphIndex,
      }) as unknown as NodeHandlerContext['sectionState'];

    it('advances currentParagraphIndex once per child paragraph', () => {
      const node: PMNode = {
        type: 'tableOfContents',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Ch 1' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Ch 2' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Ch 3' }] },
        ],
      };
      const ctx = baseContext({ sectionState: sectionStateAt(100, 5) });

      handleTableOfContentsNode(node, ctx);

      // 3 TOC children processed → counter advanced 3 times
      expect(ctx.sectionState!.currentParagraphIndex).toBe(8);
    });

    it('emits a section break before the TOC child that starts the next section', () => {
      // Section boundary sits at paragraph index 6: third child of the TOC.
      // currentParagraphIndex starts at 4; children consume indices 4, 5, 6.
      const node: PMNode = {
        type: 'tableOfContents',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'C' }] },
        ],
      };
      const ctx = baseContext({ sectionState: sectionStateAt(6, 4) });

      handleTableOfContentsNode(node, ctx);

      const breakIndex = ctx.blocks.findIndex((b) => b.kind === 'sectionBreak');
      const thirdEntryIndex = ctx.blocks.findIndex((b) => b.kind === 'paragraph' && (b as ParagraphBlock).id === 'p-C');
      expect(breakIndex).toBeGreaterThanOrEqual(0);
      expect(breakIndex).toBeLessThan(thirdEntryIndex);
      expect(ctx.sectionState!.currentSectionIndex).toBe(1);
    });

    it('does not fabricate attrs.sdt on entries (no enclosing SDT)', () => {
      const node: PMNode = {
        type: 'tableOfContents',
        attrs: { instruction: 'TOC \\o "1-3"' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Entry' }] }],
      };
      const ctx = baseContext();

      handleTableOfContentsNode(node, ctx);

      const entry = ctx.blocks[0] as ParagraphBlock;
      expect(entry.attrs?.isTocEntry).toBe(true);
      expect(entry.attrs?.tocInstruction).toBe('TOC \\o "1-3"');
      expect(entry.attrs?.sdt).toBeUndefined();
    });

    it('is a no-op when sectionState is undefined', () => {
      const node: PMNode = {
        type: 'tableOfContents',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Entry' }] }],
      };
      const ctx = baseContext();

      expect(() => handleTableOfContentsNode(node, ctx)).not.toThrow();
      expect(ctx.blocks.find((b) => b.kind === 'sectionBreak')).toBeUndefined();
      expect((ctx.blocks[0] as ParagraphBlock).attrs?.isTocEntry).toBe(true);
    });

    it('forwards themeColors to the paragraph converter', () => {
      const paragraphConverter = vi.fn((params: { para: PMNode }) => {
        const text = (params.para.content as { text: string }[] | undefined)?.[0]?.text ?? '';
        return [
          {
            kind: 'paragraph',
            id: `p-${text}`,
            runs: [{ text, fontFamily: 'Arial', fontSize: 12 }],
          } as ParagraphBlock,
        ];
      });
      const themeColors = { accent1: '#112233' } as never;
      const node: PMNode = {
        type: 'tableOfContents',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Entry' }] }],
      };
      const ctx = baseContext({
        converters: { paragraphToFlowBlocks: paragraphConverter } as never,
        themeColors,
      });

      handleTableOfContentsNode(node, ctx);

      expect(paragraphConverter).toHaveBeenCalledWith(expect.objectContaining({ themeColors }));
    });
  });
});
