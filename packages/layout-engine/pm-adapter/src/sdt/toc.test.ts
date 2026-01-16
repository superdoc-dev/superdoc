/**
 * Tests for Table of Contents (TOC) Processing Module
 */

import { describe, it, expect, vi } from 'vitest';
import { applyTocMetadata, processTocChildren } from './toc.js';
import type { PMNode } from '../types.js';
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

    it('handles null metadata values', () => {
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
      expect(blocks[0].attrs?.sdt).toEqual({
        type: 'docPartObject',
        gallery: null,
        uniqueId: null,
        instruction: null,
      });
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
    const mockStyleContext = {
      styles: new Map(),
      numbering: new Map(),
    };
    const mockHyperlinkConfig = {
      mode: 'preserve' as const,
    };

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

      const mockParagraphConverter = vi.fn((para) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${para.content[0].text}`,
            runs: [{ text: para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
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
          styleContext: mockStyleContext,
          hyperlinkConfig: mockHyperlinkConfig,
        },
        { blocks, recordBlockKind },
        mockParagraphConverter as never,
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

      const mockParagraphConverter = vi.fn((para) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${para.content[0].text}`,
            runs: [{ text: para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
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
          styleContext: mockStyleContext,
          hyperlinkConfig: mockHyperlinkConfig,
        },
        { blocks, recordBlockKind },
        mockParagraphConverter as never,
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

      const mockParagraphConverter = vi.fn((para) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${para.content[0].text}`,
            runs: [{ text: para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
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
          styleContext: mockStyleContext,
          hyperlinkConfig: mockHyperlinkConfig,
        },
        { blocks, recordBlockKind },
        mockParagraphConverter as never,
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

      const mockParagraphConverter = vi.fn((para) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${para.content[0].text}`,
            runs: [{ text: para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
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
          styleContext: mockStyleContext,
          hyperlinkConfig: mockHyperlinkConfig,
        },
        { blocks, recordBlockKind },
        mockParagraphConverter as never,
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

      const mockParagraphConverter = vi.fn((para) => {
        return [
          {
            kind: 'paragraph',
            id: `p-${para.content[0].text}`,
            runs: [{ text: para.content[0].text, fontFamily: 'Arial', fontSize: 12 }],
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
          styleContext: mockStyleContext,
          hyperlinkConfig: mockHyperlinkConfig,
        },
        { blocks, recordBlockKind },
        mockParagraphConverter as never,
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

      const mockParagraphConverter = vi.fn((_para) => {
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
          styleContext: mockStyleContext,
          bookmarks: mockBookmarks,
          trackedChanges: mockTrackedChanges,
          hyperlinkConfig: mockHyperlinkConfig,
        },
        { blocks, recordBlockKind },
        mockParagraphConverter as never,
      );

      expect(mockParagraphConverter).toHaveBeenCalledWith(
        children[0],
        mockBlockIdGenerator,
        mockPositionMap,
        'Calibri',
        14,
        mockStyleContext,
        mockTrackedChanges,
        mockBookmarks,
        mockHyperlinkConfig,
      );
    });
  });
});
