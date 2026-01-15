/**
 * Comprehensive tests for internal.ts
 *
 * Tests cover:
 * - nodeHandlers dispatch map
 * - toFlowBlocks() main conversion function
 * - toFlowBlocksMap() batch converter
 * - paragraphToFlowBlocks() wrapper function
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toFlowBlocks, toFlowBlocksMap, nodeHandlers } from './internal.js';
import type { PMNode, AdapterOptions, BatchAdapterOptions, PMDocumentMap } from './types.js';

// Mock all external dependencies
vi.mock('./converters/index.js', () => ({
  paragraphToFlowBlocks: vi.fn(() => []),
  handleParagraphNode: vi.fn(),
  contentBlockNodeToDrawingBlock: vi.fn(),
  imageNodeToBlock: vi.fn(),
  handleImageNode: vi.fn(),
  vectorShapeNodeToDrawingBlock: vi.fn(),
  shapeGroupNodeToDrawingBlock: vi.fn(),
  shapeContainerNodeToDrawingBlock: vi.fn(),
  shapeTextboxNodeToDrawingBlock: vi.fn(),
  handleVectorShapeNode: vi.fn(),
  handleShapeGroupNode: vi.fn(),
  handleShapeContainerNode: vi.fn(),
  handleShapeTextboxNode: vi.fn(),
  tableNodeToBlock: vi.fn(),
  handleTableNode: vi.fn(),
  hydrateImageBlocks: vi.fn((blocks) => blocks),
}));

vi.mock('./sdt/index.js', () => ({
  handleTableOfContentsNode: vi.fn(),
  handleIndexNode: vi.fn(),
  handleStructuredContentBlockNode: vi.fn(),
  handleDocumentSectionNode: vi.fn(),
  handleDocumentPartObjectNode: vi.fn(),
}));

vi.mock('./sections/index.js', () => {
  const SectionType = {
    CONTINUOUS: 'continuous',
    NEXT_PAGE: 'nextPage',
    EVEN_PAGE: 'evenPage',
    ODD_PAGE: 'oddPage',
  };

  return {
    SectionType,
    DEFAULT_PARAGRAPH_SECTION_TYPE: SectionType.NEXT_PAGE,
    DEFAULT_BODY_SECTION_TYPE: SectionType.CONTINUOUS,
    analyzeSectionRanges: vi.fn(() => []),
    createSectionBreakBlock: vi.fn((section, nextBlockId, _options) => ({
      kind: 'sectionBreak',
      id: nextBlockId('sectionBreak'),
      type: section.type,
    })),
    publishSectionMetadata: vi.fn(),
  };
});

vi.mock('./utilities.js', () => ({
  pxToPt: vi.fn((px) => (px != null ? px / 1.333 : undefined)),
  pickNumber: vi.fn((value) => (typeof value === 'number' ? value : undefined)),
  pickDecimalSeparator: vi.fn((value) => {
    if (typeof value === 'string' && (value.trim() === '.' || value.trim() === ',')) {
      return value.trim();
    }
    return undefined;
  }),
  pickLang: vi.fn((value) => (typeof value === 'string' ? value.toLowerCase() : undefined)),
  normalizePrefix: vi.fn((value) => (value ? String(value) : '')),
  buildPositionMap: vi.fn(() => new WeakMap()),
  createBlockIdGenerator: vi.fn((prefix = '') => {
    let counter = 0;
    return (kind: string) => `${prefix}${counter++}-${kind}`;
  }),
}));

vi.mock('./tracked-changes.js', () => ({
  isValidTrackedMode: vi.fn((mode) => mode === 'review' || mode === 'original' || mode === 'final' || mode === 'off'),
}));

vi.mock('../../../../shared/locale-utils/index.js', () => ({
  defaultDecimalSeparatorFor: vi.fn(() => '.'),
}));

// Import mocked functions for verification
import {
  handleParagraphNode,
  handleImageNode,
  handleTableNode,
  handleVectorShapeNode,
  handleShapeGroupNode,
  handleShapeContainerNode,
  handleShapeTextboxNode,
  paragraphToFlowBlocks,
  hydrateImageBlocks,
} from './converters/index.js';
import {
  handleTableOfContentsNode,
  handleStructuredContentBlockNode,
  handleDocumentSectionNode,
  handleDocumentPartObjectNode,
} from './sdt/index.js';
import { analyzeSectionRanges, createSectionBreakBlock, publishSectionMetadata } from './sections/index.js';
import { isValidTrackedMode } from './tracked-changes.js';
import { buildPositionMap } from './utilities.js';

describe('internal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('nodeHandlers', () => {
    it('should contain all expected node type handlers', () => {
      const expectedHandlers = [
        'paragraph',
        'tableOfContents',
        'structuredContentBlock',
        'documentSection',
        'table',
        'documentPartObject',
        'image',
        'vectorShape',
        'shapeGroup',
        'shapeContainer',
        'shapeTextbox',
      ];

      expectedHandlers.forEach((type) => {
        expect(nodeHandlers).toHaveProperty(type);
        expect(typeof nodeHandlers[type]).toBe('function');
      });
    });

    it('should NOT contain removed list handlers', () => {
      expect(nodeHandlers).not.toHaveProperty('orderedList');
      expect(nodeHandlers).not.toHaveProperty('bulletList');
    });

    it('should map paragraph to handleParagraphNode', () => {
      expect(nodeHandlers.paragraph).toBe(handleParagraphNode);
    });

    it('should map image to handleImageNode', () => {
      expect(nodeHandlers.image).toBe(handleImageNode);
    });

    it('should map table to handleTableNode', () => {
      expect(nodeHandlers.table).toBe(handleTableNode);
    });

    it('should map shape types to their handlers', () => {
      expect(nodeHandlers.vectorShape).toBe(handleVectorShapeNode);
      expect(nodeHandlers.shapeGroup).toBe(handleShapeGroupNode);
      expect(nodeHandlers.shapeContainer).toBe(handleShapeContainerNode);
      expect(nodeHandlers.shapeTextbox).toBe(handleShapeTextboxNode);
    });

    it('should map SDT types to their handlers', () => {
      expect(nodeHandlers.tableOfContents).toBe(handleTableOfContentsNode);
      expect(nodeHandlers.structuredContentBlock).toBe(handleStructuredContentBlockNode);
      expect(nodeHandlers.documentSection).toBe(handleDocumentSectionNode);
      expect(nodeHandlers.documentPartObject).toBe(handleDocumentPartObjectNode);
    });
  });

  describe('toFlowBlocks', () => {
    describe('basic functionality', () => {
      it('should handle empty document (no content)', () => {
        const doc: PMNode = { type: 'doc' };
        const result = toFlowBlocks(doc);

        expect(result.blocks).toEqual([]);
        expect(result.bookmarks).toBeInstanceOf(Map);
        expect(result.bookmarks.size).toBe(0);
      });

      it('should handle simple paragraph document', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledTimes(1);
        expect(handleParagraphNode).toHaveBeenCalledWith(doc.content![0], expect.any(Object));
      });

      it('should handle multiple paragraphs', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
          ],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledTimes(3);
      });

      it('should handle mixed node types', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Para' }] },
            { type: 'table', attrs: {} },
            { type: 'image', attrs: {} },
          ],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledTimes(1);
        expect(handleTableNode).toHaveBeenCalledTimes(1);
        expect(handleImageNode).toHaveBeenCalledTimes(1);
      });

      it('should return blocks array and bookmarks map', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        const result = toFlowBlocks(doc);

        expect(result).toHaveProperty('blocks');
        expect(result).toHaveProperty('bookmarks');
        expect(Array.isArray(result.blocks)).toBe(true);
        expect(result.bookmarks).toBeInstanceOf(Map);
      });

      it('should generate block IDs with prefix', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { blockIdPrefix: 'test-' });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            nextBlockId: expect.any(Function),
          }),
        );

        // Verify the generator creates IDs with prefix
        const call = vi.mocked(handleParagraphNode).mock.calls[0];
        const context = call![1];
        const id = context.nextBlockId('paragraph');
        expect(id).toMatch(/^test-\d+-paragraph$/);
      });

      it('should generate block IDs without prefix', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        const call = vi.mocked(handleParagraphNode).mock.calls[0];
        const context = call![1];
        const id = context.nextBlockId('paragraph');
        expect(id).toMatch(/^\d+-paragraph$/);
      });

      it('should apply default font and size', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            defaultFont: 'Arial',
            defaultSize: 16,
          }),
        );
      });

      it('should apply custom default font and size', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { defaultFont: 'Times New Roman', defaultSize: 12 });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            defaultFont: 'Times New Roman',
            defaultSize: 12,
          }),
        );
      });
    });

    describe('tracked changes', () => {
      it('should set tracked changes mode to review by default', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            trackedChangesConfig: {
              mode: 'review',
              enabled: true,
            },
          }),
        );
      });

      it('should set tracked changes mode to original when specified', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { trackedChangesMode: 'original' });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            trackedChangesConfig: {
              mode: 'original',
              enabled: true,
            },
          }),
        );
      });

      it('should set tracked changes mode to final when specified', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { trackedChangesMode: 'final' });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            trackedChangesConfig: {
              mode: 'final',
              enabled: true,
            },
          }),
        );
      });

      it('should set tracked changes mode to off when specified', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { trackedChangesMode: 'off' });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            trackedChangesConfig: {
              mode: 'off',
              enabled: true,
            },
          }),
        );
      });

      it('should fallback to review for invalid tracked changes mode', () => {
        vi.mocked(isValidTrackedMode).mockReturnValueOnce(false);

        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { trackedChangesMode: 'invalid' as never });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            trackedChangesConfig: {
              mode: 'review',
              enabled: true,
            },
          }),
        );
      });

      it('should disable tracked changes when enableTrackedChanges is false', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { enableTrackedChanges: false });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            trackedChangesConfig: {
              mode: 'review',
              enabled: false,
            },
          }),
        );
      });
    });

    describe('section handling', () => {
      it('should not analyze sections when emitSectionBreaks is false', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { emitSectionBreaks: false });

        expect(analyzeSectionRanges).not.toHaveBeenCalled();
      });

      it('should analyze sections when emitSectionBreaks is true', () => {
        const doc: PMNode = {
          type: 'doc',
          attrs: { bodySectPr: {} },
          content: [{ type: 'paragraph', content: [] }],
        };

        vi.mocked(analyzeSectionRanges).mockReturnValueOnce([{ type: 0, start: 0, end: 1, sectPr: {} } as never]);

        toFlowBlocks(doc, { emitSectionBreaks: true });

        expect(analyzeSectionRanges).toHaveBeenCalledWith(doc, {});
      });

      it('should publish section metadata when sections exist', () => {
        const doc: PMNode = {
          type: 'doc',
          attrs: { bodySectPr: {} },
          content: [{ type: 'paragraph', content: [] }],
        };

        const mockSections = [{ type: 0, start: 0, end: 1, sectPr: {} } as never];
        vi.mocked(analyzeSectionRanges).mockReturnValueOnce(mockSections);

        const options: AdapterOptions = { emitSectionBreaks: true };
        toFlowBlocks(doc, options);

        expect(publishSectionMetadata).toHaveBeenCalledWith(mockSections, options);
      });

      it('should create section break for first section', () => {
        const doc: PMNode = {
          type: 'doc',
          attrs: { bodySectPr: {} },
          content: [{ type: 'paragraph', content: [] }],
        };

        const mockSections = [{ type: 'nextPage', start: 0, end: 1, sectPr: {} } as never];
        vi.mocked(analyzeSectionRanges).mockReturnValueOnce(mockSections);

        toFlowBlocks(doc, { emitSectionBreaks: true });

        expect(createSectionBreakBlock).toHaveBeenCalledWith(mockSections[0], expect.any(Function), {
          isFirstSection: true,
        });
      });

      it('should create final section break when needed', () => {
        const doc: PMNode = {
          type: 'doc',
          attrs: { bodySectPr: {} },
          content: [{ type: 'paragraph', content: [] }],
        };

        const mockSections = [
          { type: 1, start: 0, end: 1, sectPr: {} },
          { type: 1, start: 2, end: 3, sectPr: {} },
        ] as never[];
        vi.mocked(analyzeSectionRanges).mockReturnValueOnce(mockSections);

        // Mock handler to set currentSectionIndex
        vi.mocked(handleParagraphNode).mockImplementationOnce((node, context) => {
          context.sectionState.currentSectionIndex = 0;
        });

        toFlowBlocks(doc, { emitSectionBreaks: true });

        // Should be called twice: once for first section, once for final
        expect(createSectionBreakBlock).toHaveBeenCalledTimes(2);
      });
    });

    describe('bookmark tracking', () => {
      it('should provide empty bookmarks map initially', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            bookmarks: expect.any(Map),
          }),
        );

        const call = vi.mocked(handleParagraphNode).mock.calls[0];
        const bookmarks = call![1].bookmarks;
        expect(bookmarks.size).toBe(0);
      });

      it('should allow handlers to populate bookmarks', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        vi.mocked(handleParagraphNode).mockImplementationOnce((node, context) => {
          context.bookmarks.set('bookmark1', 10);
          context.bookmarks.set('bookmark2', 20);
        });

        const result = toFlowBlocks(doc);

        expect(result.bookmarks.size).toBe(2);
        expect(result.bookmarks.get('bookmark1')).toBe(10);
        expect(result.bookmarks.get('bookmark2')).toBe(20);
      });

      it('should return bookmarks map in result', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        const result = toFlowBlocks(doc);

        expect(result).toHaveProperty('bookmarks');
        expect(result.bookmarks).toBeInstanceOf(Map);
      });

      it('should pass same bookmarks map to all handlers', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [] },
            { type: 'table', attrs: {} },
          ],
        };

        toFlowBlocks(doc);

        const paragraphCall = vi.mocked(handleParagraphNode).mock.calls[0];
        const tableCall = vi.mocked(handleTableNode).mock.calls[0];

        expect(paragraphCall![1].bookmarks).toBe(tableCall![1].bookmarks);
      });
    });

    describe('media file hydration', () => {
      it('should call hydrateImageBlocks with media files', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        const mediaFiles = { 'image1.jpg': 'base64data' };
        toFlowBlocks(doc, { mediaFiles });

        expect(hydrateImageBlocks).toHaveBeenCalledWith(expect.any(Array), mediaFiles);
      });

      it('should call hydrateImageBlocks without media files', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        expect(hydrateImageBlocks).toHaveBeenCalledWith(expect.any(Array), undefined);
      });
    });

    describe('instrumentation', () => {
      it('should call instrumentation log with correct data', () => {
        const mockLog = vi.fn();
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        vi.mocked(handleParagraphNode).mockImplementationOnce((node, context) => {
          context.blocks.push({ kind: 'paragraph', id: '0-paragraph' } as never);
          context.recordBlockKind('paragraph');
        });

        toFlowBlocks(doc, { instrumentation: { log: mockLog } });

        expect(mockLog).toHaveBeenCalledWith({
          totalBlocks: 1,
          blockCounts: { paragraph: 1 },
          bookmarks: 0,
        });
      });

      it('should not error when no instrumentation provided', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        expect(() => toFlowBlocks(doc)).not.toThrow();
      });
    });

    describe('options handling', () => {
      it('should pass custom decimal separator to style context', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { locale: { decimalSeparator: ',' } });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            styleContext: expect.objectContaining({
              defaults: expect.objectContaining({
                decimalSeparator: ',',
              }),
            }),
          }),
        );
      });

      it('should extract lang from document attrs', () => {
        const doc: PMNode = {
          type: 'doc',
          attrs: { lang: 'en-US' },
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        // pickLang should be called with the lang value
        expect(handleParagraphNode).toHaveBeenCalled();
      });

      it('should combine all options correctly', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        const options: AdapterOptions = {
          defaultFont: 'Calibri',
          defaultSize: 14,
          blockIdPrefix: 'custom-',
          emitSectionBreaks: false,
          trackedChangesMode: 'final',
          enableTrackedChanges: true,
          enableRichHyperlinks: true,
          locale: { decimalSeparator: ',' },
        };

        toFlowBlocks(doc, options);

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            defaultFont: 'Calibri',
            defaultSize: 14,
            trackedChangesConfig: {
              mode: 'final',
              enabled: true,
            },
            hyperlinkConfig: {
              enableRichHyperlinks: true,
            },
          }),
        );
      });
    });

    describe('position map', () => {
      it('should build position map for document', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        expect(buildPositionMap).toHaveBeenCalledWith(doc);
      });

      it('should pass atom node types to position map when provided', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };
        const atomNodeTypes = ['customAtom'];

        toFlowBlocks(doc, { atomNodeTypes });

        expect(buildPositionMap).toHaveBeenCalledWith(doc, { atomNodeTypes });
      });

      it('should pass position map to handlers', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        const mockPositions = new WeakMap();
        vi.mocked(buildPositionMap).mockReturnValueOnce(mockPositions);

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            positions: mockPositions,
          }),
        );
      });
    });

    describe('hyperlink config', () => {
      it('should default enableRichHyperlinks to false', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            hyperlinkConfig: {
              enableRichHyperlinks: false,
            },
          }),
        );
      });

      it('should enable rich hyperlinks when specified', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc, { enableRichHyperlinks: true });

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            hyperlinkConfig: {
              enableRichHyperlinks: true,
            },
          }),
        );
      });
    });

    describe('list counter context', () => {
      it('should provide list counter methods to handlers', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            listCounterContext: {
              getListCounter: expect.any(Function),
              incrementListCounter: expect.any(Function),
              resetListCounter: expect.any(Function),
            },
          }),
        );
      });
    });

    describe('converters', () => {
      it('should provide converter functions to handlers', () => {
        const doc: PMNode = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };

        toFlowBlocks(doc);

        expect(handleParagraphNode).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            converters: expect.objectContaining({
              paragraphToFlowBlocks: expect.any(Function),
              tableNodeToBlock: expect.any(Function),
              imageNodeToBlock: expect.any(Function),
            }),
          }),
        );
      });
    });
  });

  describe('toFlowBlocksMap', () => {
    it('should return empty object for empty documents map', () => {
      const result = toFlowBlocksMap({});
      expect(result).toEqual({});
    });

    it('should return empty object for null documents', () => {
      const result = toFlowBlocksMap(null as never);
      expect(result).toEqual({});
    });

    it('should return empty object for undefined documents', () => {
      const result = toFlowBlocksMap(undefined as never);
      expect(result).toEqual({});
    });

    it('should convert single document', () => {
      const documents: PMDocumentMap = {
        doc1: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        },
      };

      vi.mocked(handleParagraphNode).mockImplementationOnce((node, context) => {
        context.blocks.push({ kind: 'paragraph', id: '0-paragraph' } as never);
      });

      const result = toFlowBlocksMap(documents);

      expect(result).toHaveProperty('doc1');
      expect(Array.isArray(result.doc1)).toBe(true);
      expect(result.doc1!.length).toBeGreaterThan(0);
    });

    it('should convert multiple documents', () => {
      const documents: PMDocumentMap = {
        header: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
        body: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
        footer: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      };

      vi.mocked(handleParagraphNode).mockImplementation((node, context) => {
        context.blocks.push({ kind: 'paragraph', id: '0-paragraph' } as never);
      });

      const result = toFlowBlocksMap(documents);

      expect(Object.keys(result)).toEqual(['header', 'body', 'footer']);
      expect(result.header).toBeDefined();
      expect(result.body).toBeDefined();
      expect(result.footer).toBeDefined();
    });

    it('should use document key as default prefix', () => {
      const documents: PMDocumentMap = {
        'test-doc': { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      };

      toFlowBlocksMap(documents);

      // The prefix should be 'test-doc-' by default
      expect(handleParagraphNode).toHaveBeenCalled();
    });

    it('should use blockIdPrefixFactory when provided', () => {
      const documents: PMDocumentMap = {
        header: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
        footer: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      };

      const prefixFactory = vi.fn((key: string) => `custom-${key}-`);
      const options: BatchAdapterOptions = { blockIdPrefixFactory: prefixFactory };

      toFlowBlocksMap(documents, options);

      expect(prefixFactory).toHaveBeenCalledWith('header');
      expect(prefixFactory).toHaveBeenCalledWith('footer');
      expect(prefixFactory).toHaveBeenCalledTimes(2);
    });

    it('should use blockIdPrefix as fallback when no factory', () => {
      const documents: PMDocumentMap = {
        doc1: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      };

      toFlowBlocksMap(documents, { blockIdPrefix: 'fallback-' });

      // Should use 'fallback-' instead of 'doc1-'
      expect(handleParagraphNode).toHaveBeenCalled();
    });

    it('should skip null documents', () => {
      const documents: PMDocumentMap = {
        valid: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
        invalid: null,
      };

      vi.mocked(handleParagraphNode).mockImplementation((node, context) => {
        context.blocks.push({ kind: 'paragraph', id: '0-paragraph' } as never);
      });

      const result = toFlowBlocksMap(documents);

      expect(result).toHaveProperty('valid');
      expect(result).not.toHaveProperty('invalid');
    });

    it('should skip undefined documents', () => {
      const documents: PMDocumentMap = {
        valid: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
        invalid: undefined,
      };

      vi.mocked(handleParagraphNode).mockImplementation((node, context) => {
        context.blocks.push({ kind: 'paragraph', id: '0-paragraph' } as never);
      });

      const result = toFlowBlocksMap(documents);

      expect(result).toHaveProperty('valid');
      expect(result).not.toHaveProperty('invalid');
    });

    it('should pass adapter options to each conversion', () => {
      const documents: PMDocumentMap = {
        doc1: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      };

      const options: BatchAdapterOptions = {
        defaultFont: 'Courier',
        defaultSize: 10,
        trackedChangesMode: 'original',
      };

      toFlowBlocksMap(documents, options);

      expect(handleParagraphNode).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          defaultFont: 'Courier',
          defaultSize: 10,
          trackedChangesConfig: expect.objectContaining({
            mode: 'original',
          }),
        }),
      );
    });

    it('should return result keyed by document keys', () => {
      const documents: PMDocumentMap = {
        alpha: { type: 'doc', content: [] },
        beta: { type: 'doc', content: [] },
        gamma: { type: 'doc', content: [] },
      };

      const result = toFlowBlocksMap(documents);

      expect(Object.keys(result).sort()).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('should extract blocks correctly from each document', () => {
      const documents: PMDocumentMap = {
        doc1: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
        doc2: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      };

      let callCount = 0;
      vi.mocked(handleParagraphNode).mockImplementation((node, context) => {
        callCount++;
        context.blocks.push({
          kind: 'paragraph',
          id: `${callCount}-paragraph`,
        } as never);
      });

      const result = toFlowBlocksMap(documents);

      expect(result.doc1).toHaveLength(1);
      expect(result.doc2).toHaveLength(1);
      expect(result.doc1![0]!.id).toBe('1-paragraph');
      expect(result.doc2![0]!.id).toBe('2-paragraph');
    });
  });

  describe('paragraphToFlowBlocks wrapper', () => {
    // Note: paragraphToFlowBlocks is not exported, so we test it indirectly
    // through the converters that are passed to handlers

    it('should provide paragraph converter to handlers', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };

      toFlowBlocks(doc);

      const call = vi.mocked(handleParagraphNode).mock.calls[0];
      const context = call![1];

      expect(context.converters).toBeDefined();
      expect(context.converters!.paragraphToFlowBlocks).toBeDefined();
      expect(typeof context.converters!.paragraphToFlowBlocks).toBe('function');
    });

    it('should provide table converter to handlers', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };

      toFlowBlocks(doc);

      const call = vi.mocked(handleParagraphNode).mock.calls[0];
      const context = call![1];

      expect(context.converters!.tableNodeToBlock).toBeDefined();
      expect(typeof context.converters!.tableNodeToBlock).toBe('function');
    });

    it('should provide image converter to handlers', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };

      toFlowBlocks(doc);

      const call = vi.mocked(handleParagraphNode).mock.calls[0];
      const context = call![1];

      expect(context.converters!.imageNodeToBlock).toBeDefined();
      expect(typeof context.converters!.imageNodeToBlock).toBe('function');
    });

    it('should provide all required converters', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };

      toFlowBlocks(doc);

      const call = vi.mocked(handleParagraphNode).mock.calls[0];
      const context = call![1];

      expect(context.converters).toEqual(
        expect.objectContaining({
          paragraphToFlowBlocks: expect.any(Function),
          tableNodeToBlock: expect.any(Function),
          imageNodeToBlock: expect.any(Function),
        }),
      );
    });

    it('passes converterContext through paragraph converter', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };

      toFlowBlocks(doc);
      const call = vi.mocked(handleParagraphNode).mock.calls[0];
      const context = call![1];
      const paragraphConverter = context.converters!.paragraphToFlowBlocks;

      const paraNode: PMNode = { type: 'paragraph', content: [] };
      const converterCtx = { docx: { foo: 'bar' } } as never;
      const themeColors = { primary: '#123456' } as never;

      paragraphConverter(
        paraNode,
        context.nextBlockId,
        context.positions,
        context.defaultFont,
        context.defaultSize,
        context.styleContext,
        undefined,
        context.trackedChangesConfig,
        context.bookmarks,
        context.hyperlinkConfig,
        themeColors,
        converterCtx,
      );

      const lastCall = vi.mocked(paragraphToFlowBlocks).mock.calls.at(-1);
      expect(lastCall?.[10]).toBe(themeColors);
      expect(lastCall?.[12]).toBe(converterCtx);
    });
  });
});
