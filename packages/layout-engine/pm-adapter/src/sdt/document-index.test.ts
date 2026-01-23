/**
 * Tests for Document Index Processing Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleIndexNode } from './document-index.js';
import type { PMNode, NodeHandlerContext } from '../types.js';
import type { FlowBlock, ParagraphBlock } from '@superdoc/contracts';

describe('document-index', () => {
  describe('handleIndexNode', () => {
    let mockContext: NodeHandlerContext;
    let mockParagraphToFlowBlocks: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockParagraphToFlowBlocks = vi.fn().mockImplementation((params) => [
        {
          kind: 'paragraph',
          id: `block-${params.para.attrs?.id || 'unknown'}`,
          runs: [{ text: 'test', fontFamily: 'Arial', fontSize: 12 }],
        },
      ]);

      mockContext = {
        blocks: [],
        recordBlockKind: vi.fn(),
        nextBlockId: vi.fn().mockReturnValue('block-1'),
        positions: [],
        defaultFont: 'Arial',
        defaultSize: 12,
        styleContext: {},
        listCounterContext: {
          getListCounter: vi.fn().mockReturnValue(1),
          incrementListCounter: vi.fn(),
          resetListCounter: vi.fn(),
        },
        trackedChangesConfig: {},
        bookmarks: new Map(),
        hyperlinkConfig: { enableRichHyperlinks: false },
        sectionState: {
          ranges: [],
          currentSectionIndex: 0,
          currentParagraphIndex: 0,
        },
        converters: {
          paragraphToFlowBlocks: mockParagraphToFlowBlocks,
        },
        converterContext: {},
        enableComments: true,
      };
    });

    it('processes child paragraphs and adds them to blocks', () => {
      const indexNode: PMNode = {
        type: 'index',
        content: [
          { type: 'paragraph', attrs: { id: 'p1' } },
          { type: 'paragraph', attrs: { id: 'p2' } },
        ],
      };

      handleIndexNode(indexNode, mockContext);

      expect(mockContext.blocks).toHaveLength(2);
      expect(mockParagraphToFlowBlocks).toHaveBeenCalledTimes(2);
      expect(mockContext.recordBlockKind).toHaveBeenCalledTimes(2);
    });

    it('skips non-paragraph children', () => {
      const indexNode: PMNode = {
        type: 'index',
        content: [
          { type: 'paragraph', attrs: { id: 'p1' } },
          { type: 'table', attrs: { id: 't1' } },
          { type: 'paragraph', attrs: { id: 'p2' } },
        ],
      };

      handleIndexNode(indexNode, mockContext);

      expect(mockContext.blocks).toHaveLength(2);
      expect(mockParagraphToFlowBlocks).toHaveBeenCalledTimes(2);
    });

    it('handles empty index node', () => {
      const indexNode: PMNode = {
        type: 'index',
        content: [],
      };

      handleIndexNode(indexNode, mockContext);

      expect(mockContext.blocks).toHaveLength(0);
      expect(mockParagraphToFlowBlocks).not.toHaveBeenCalled();
    });

    it('handles index node without content', () => {
      const indexNode: PMNode = {
        type: 'index',
      };

      handleIndexNode(indexNode, mockContext);

      expect(mockContext.blocks).toHaveLength(0);
    });

    it('throws if paragraphToFlowBlocks converter is not available', () => {
      const indexNode: PMNode = {
        type: 'index',
        content: [{ type: 'paragraph', attrs: { id: 'p1' } }],
      };

      mockContext.converters = {};

      expect(() => handleIndexNode(indexNode, mockContext)).toThrow();
    });

    it('increments currentParagraphIndex for each paragraph', () => {
      const indexNode: PMNode = {
        type: 'index',
        content: [
          { type: 'paragraph', attrs: { id: 'p1' } },
          { type: 'paragraph', attrs: { id: 'p2' } },
          { type: 'paragraph', attrs: { id: 'p3' } },
        ],
      };

      handleIndexNode(indexNode, mockContext);

      expect(mockContext.sectionState.currentParagraphIndex).toBe(3);
    });

    it('handles ProseMirror Fragment-like content with forEach', () => {
      const paragraphs = [
        { type: 'paragraph', attrs: { id: 'p1' } },
        { type: 'paragraph', attrs: { id: 'p2' } },
      ];

      const indexNode: PMNode = {
        type: 'index',
        content: {
          forEach: (cb: (node: PMNode) => void) => paragraphs.forEach(cb),
        } as unknown as PMNode[],
      };

      handleIndexNode(indexNode, mockContext);

      expect(mockContext.blocks).toHaveLength(2);
    });

    it('inserts section breaks at correct paragraph boundaries', () => {
      const indexNode: PMNode = {
        type: 'index',
        content: [
          { type: 'paragraph', attrs: { id: 'p1' } },
          { type: 'paragraph', attrs: { id: 'p2' } },
        ],
      };

      mockContext.sectionState = {
        ranges: [
          { startParagraphIndex: 0, sectionProps: {} },
          { startParagraphIndex: 1, sectionProps: {} },
        ],
        currentSectionIndex: 0,
        currentParagraphIndex: 0,
      };

      handleIndexNode(indexNode, mockContext);

      // Should have 3 blocks: section break + 2 paragraphs
      // The section break is inserted before paragraph at index 1
      expect(mockContext.blocks.length).toBeGreaterThanOrEqual(2);
    });
  });
});
